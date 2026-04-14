"""
Google Calendar matching service.

Fetches events ±4h around the expense datetime, scores each on:
  - time proximity  (max 0.50)
  - location match  (max 0.30)
  - attendee count  (max 0.20)

Returns the best match (or None) with action: auto_apply / suggest / ignore.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from anthropic import Anthropic

from ..config import settings
from .calendar_cache import cached_row_to_google_event, read_cache, write_cache
from .calendar_matching import (
    match_action,
    stamp_expiry,
    token_is_expired,
    total_score,
)

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"


# ── token management ──────────────────────────────────────────────────────────

def _refresh_access_token(token_data: dict) -> dict:
    """Exchange refresh_token for a fresh access_token. Returns merged token dict."""
    resp = httpx.post(
        GOOGLE_TOKEN_URL,
        data={
            "client_id": settings.google_oauth_client_id,
            "client_secret": settings.google_oauth_client_secret,
            "refresh_token": token_data["refresh_token"],
            "grant_type": "refresh_token",
        },
        timeout=10.0,
    )
    resp.raise_for_status()
    new_tokens = resp.json()
    # Google rarely rotates refresh_token but persist it if present.
    merged = {**token_data, **new_tokens}
    if "refresh_token" not in new_tokens:
        merged["refresh_token"] = token_data["refresh_token"]
    return stamp_expiry(merged)


def _get_access_token(admin, user_id: str) -> Optional[str]:
    """Return a valid access_token for the user, refreshing only when needed."""
    try:
        result = (
            admin.table("users")
            .select("google_calendar_token")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        logger.warning("Could not fetch calendar token — user=%s: %s", user_id, exc)
        return None

    if not result or not result.data:
        return None

    token_data = result.data.get("google_calendar_token")
    if not token_data or not token_data.get("refresh_token"):
        return None

    # Skip refresh if the cached access_token is still valid
    if not token_is_expired(token_data):
        return token_data["access_token"]

    try:
        refreshed = _refresh_access_token(token_data)
        admin.table("users").update(
            {"google_calendar_token": refreshed}
        ).eq("id", user_id).execute()
        return refreshed["access_token"]
    except Exception as exc:
        logger.warning("Calendar token refresh failed — user=%s: %s", user_id, exc)
        return None


# ── scoring helpers ──────────────────────────────────────────────────────────
# Scoring lives in calendar_matching.total_score() so Google + Outlook stay
# in lock-step. This file only handles provider-specific glue (API parsing).


def _extract_client_name(event_title: str) -> Optional[str]:
    """
    Use Claude Haiku to extract a company/client name from a calendar event title.
    Returns None if no client is found or the API is unavailable.
    """
    if not settings.anthropic_api_key:
        return None
    try:
        client = Anthropic(api_key=settings.anthropic_api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=64,
            messages=[{
                "role": "user",
                "content": (
                    f"Extract the company or client name from this calendar event title: "
                    f'"{event_title}". '
                    "Return ONLY the company name, nothing else. "
                    "If no company is mentioned, return 'Personal'."
                ),
            }],
        )
        name = message.content[0].text.strip().strip('"').strip("'")
        return None if name.lower() == "personal" else name
    except Exception as exc:
        logger.warning("Client name extraction failed for %r: %s", event_title, exc)
        return None


def _generate_business_purpose(
    event_title: str,
    merchant_name: Optional[str],
    category: Optional[str],
    amount_total: Optional[float],
    attendee_count: int,
) -> str:
    """
    Use Claude Haiku to generate a concise professional business expense justification.
    Falls back to the raw event title if the API is unavailable.
    """
    if not settings.anthropic_api_key:
        return event_title

    parts = [f'Calendar event: "{event_title}"']
    if merchant_name:
        parts.append(f"Merchant: {merchant_name}")
    if category:
        parts.append(f"Category: {category}")
    if amount_total is not None:
        parts.append(f"Amount: ${amount_total:.2f}")
    if attendee_count:
        parts.append(f"Attendees: {attendee_count}")

    context = "\n".join(f"- {p}" for p in parts)

    try:
        client = Anthropic(api_key=settings.anthropic_api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=120,
            messages=[{
                "role": "user",
                "content": (
                    "Write a 1–2 sentence professional business expense justification "
                    "(50 words or fewer) based on:\n"
                    f"{context}\n\n"
                    "Return ONLY the justification text. No labels, no formatting."
                ),
            }],
        )
        return message.content[0].text.strip()
    except Exception as exc:
        logger.warning("Business purpose generation failed for %r: %s", event_title, exc)
        return event_title


def _parse_event_start(event: dict) -> tuple[Optional[datetime], bool]:
    """
    Return (start_datetime, is_all_day). Google all-day events use 'date' (no time);
    timed events use 'dateTime'. is_all_day controls the all-day score penalty.
    """
    start_raw = event.get("start", {})
    if start_raw.get("dateTime"):
        try:
            return datetime.fromisoformat(start_raw["dateTime"].replace("Z", "+00:00")), False
        except ValueError:
            return None, False
    if start_raw.get("date"):
        try:
            return datetime.fromisoformat(start_raw["date"]).replace(tzinfo=timezone.utc), True
        except ValueError:
            return None, True
    return None, False


# ── public API ────────────────────────────────────────────────────────────────

def get_calendar_match(
    admin,
    user_id: str,
    expense_dt: Optional[datetime],
    merchant_name: Optional[str],
    merchant_address: Optional[str],
    category: Optional[str] = None,
    amount_total: Optional[float] = None,
) -> Optional[dict]:
    """
    Find the best-matching Google Calendar event for an expense.

    Returns a dict with keys:
      action, confidence, event_id, event_title,
      client_name, business_purpose, attendees
    or None if the user has no calendar connected or no match found.
    """
    if not settings.google_oauth_client_id:
        return None
    if not expense_dt:
        return None

    access_token = _get_access_token(admin, user_id)
    if not access_token:
        return None

    # Treat naive datetimes as UTC — receipt times extracted by OCR have no tz info
    if expense_dt.tzinfo is None:
        expense_dt = expense_dt.replace(tzinfo=timezone.utc)

    # Wide window to handle timezone ambiguity — receipt times from OCR have no tz info
    # and may be in any local timezone. 12h before covers same-day events even when
    # the naive time is misinterpreted as UTC instead of local time.
    dt_min = expense_dt - timedelta(hours=12)
    dt_max = expense_dt + timedelta(hours=4)

    # ── cache check ───────────────────────────────────────────────────────────
    cached = read_cache(admin, user_id, "google", dt_min, dt_max)
    if cached is not None:
        logger.info("Google calendar cache hit — user=%s count=%d", user_id, len(cached))
        items = [cached_row_to_google_event(row) for row in cached]
    else:
        # ── live API fetch ────────────────────────────────────────────────────
        try:
            resp = httpx.get(
                f"{GOOGLE_CALENDAR_API}/calendars/primary/events",
                headers={"Authorization": f"Bearer {access_token}"},
                params={
                    "timeMin": dt_min.isoformat(),
                    "timeMax": dt_max.isoformat(),
                    "singleEvents": "true",
                    "orderBy": "startTime",
                    "maxResults": 50,
                },
                timeout=10.0,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "Calendar API HTTP %s — user=%s: %s",
                exc.response.status_code, user_id, exc.response.text[:200],
            )
            return None
        except Exception as exc:
            logger.warning("Calendar API request failed — user=%s: %s", user_id, exc)
            return None

        items = resp.json().get("items", [])
        # Populate cache so subsequent receipts processed in the same batch reuse this
        if items:
            cache_rows = [
                {
                    "external_event_id": e.get("id", ""),
                    "title": e.get("summary") or "",
                    "location": e.get("location"),
                    "start_time": (
                        e.get("start", {}).get("dateTime")
                        or e.get("start", {}).get("date", "")
                    ),
                    "attendees_json": [
                        {"email": a["email"]}
                        for a in e.get("attendees", [])
                        if a.get("email")
                        and not a["email"].endswith("calendar.google.com")
                        and not a.get("resource", False)
                    ],
                }
                for e in items
            ]
            write_cache(admin, user_id, "google", cache_rows)

    if not items:
        return None

    best: Optional[dict] = None
    best_score = 0.0
    seen_recurring: set[str] = set()  # dedupe recurring instances by series id

    for event in items:
        event_start, is_all_day = _parse_event_start(event)
        if not event_start:
            continue
        if event_start.tzinfo is None:
            event_start = event_start.replace(tzinfo=timezone.utc)

        # Recurring-event dedupe — keep the instance closest to expense_dt.
        # Google sets recurringEventId on each expanded instance.
        recurring_id = event.get("recurringEventId")
        if recurring_id:
            if recurring_id in seen_recurring:
                continue
            seen_recurring.add(recurring_id)

        raw_attendees = event.get("attendees", [])
        # Filter only resource calendars — real Google Workspace attendees use
        # standard email domains so we must NOT exclude them.
        attendee_emails = [
            a["email"]
            for a in raw_attendees
            if a.get("email")
            and not a["email"].endswith("calendar.google.com")
            and not a.get("resource", False)
        ]

        score = total_score(
            event_start=event_start,
            expense_dt=expense_dt,
            event_location=event.get("location"),
            merchant_name=merchant_name,
            merchant_address=merchant_address,
            attendee_count=len(attendee_emails),
            event_title=event.get("summary"),
            is_all_day=is_all_day,
        )

        if score > best_score:
            best_score = score
            best = {
                "event_id": event.get("id"),
                "event_title": event.get("summary") or "",
                "event_location": event.get("location"),
                "client_name": None,  # resolved below after loop
                "business_purpose": event.get("summary") or "",
                "attendees": [{"email": e} for e in attendee_emails],
                "confidence": round(score, 3),
            }

    action = match_action(best_score) if best else None
    if best is None or action is None:
        return None

    # Extract client name and generate purpose from the winning event using Claude Haiku
    best["client_name"] = _extract_client_name(best["event_title"])
    best["business_purpose"] = _generate_business_purpose(
        event_title=best["event_title"],
        merchant_name=merchant_name,
        category=category,
        amount_total=amount_total,
        attendee_count=len(best["attendees"]),
    )
    logger.info(
        "Calendar match — %r confidence=%.3f action=%s client=%r",
        best["event_title"], best_score, action, best["client_name"],
    )
    return {**best, "action": action}
