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

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3"


# ── token management ──────────────────────────────────────────────────────────

def _refresh_access_token(token_data: dict) -> dict:
    """Exchange refresh_token for a fresh access_token. Returns updated token dict."""
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
    return {**token_data, "access_token": new_tokens["access_token"]}


def _get_access_token(admin, user_id: str) -> Optional[str]:
    """Return a valid access_token for the user, refreshing if necessary."""
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

    try:
        refreshed = _refresh_access_token(token_data)
        admin.table("users").update(
            {"google_calendar_token": refreshed}
        ).eq("id", user_id).execute()
        return refreshed["access_token"]
    except Exception as exc:
        logger.warning("Calendar token refresh failed — user=%s: %s", user_id, exc)
        return None


# ── scoring helpers ───────────────────────────────────────────────────────────

def _score_time(event_start: datetime, expense_dt: datetime) -> float:
    diff_minutes = abs((expense_dt - event_start).total_seconds()) / 60
    if diff_minutes <= 30:
        return 0.50
    if diff_minutes <= 60:
        return 0.40
    if diff_minutes <= 120:
        return 0.25
    if diff_minutes <= 240:
        return 0.10
    if diff_minutes <= 480:   # up to 8h — covers tz-shifted same-day events
        return 0.05
    return 0.0


def _score_location(
    event_location: Optional[str],
    merchant_name: Optional[str],
    merchant_address: Optional[str],
) -> float:
    if not event_location:
        return 0.0
    loc = event_location.lower()
    if merchant_name and merchant_name.lower() in loc:
        return 0.30
    if merchant_address:
        words = [w for w in merchant_address.lower().split() if len(w) > 3]
        if any(w in loc for w in words):
            return 0.20
    return 0.0


def _score_attendees(count: int) -> float:
    if count >= 3:
        return 0.20
    if count == 2:
        return 0.15
    if count == 1:
        return 0.10
    return 0.0


BUSINESS_KEYWORDS = {
    "dinner", "lunch", "breakfast", "brunch", "coffee", "drinks",
    "meeting", "call", "sync", "review", "demo", "presentation",
    "client", "customer", "partner", "vendor",
}


def _score_title_keywords(event_title: Optional[str]) -> float:
    """0.30 bonus if the event title contains any recognisable business/meal keyword."""
    if not event_title:
        return 0.0
    title_lower = event_title.lower()
    if any(kw in title_lower for kw in BUSINESS_KEYWORDS):
        return 0.30
    return 0.0


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


def _parse_event_start(event: dict) -> Optional[datetime]:
    start_raw = event.get("start", {})
    start_str = start_raw.get("dateTime") or start_raw.get("date")
    if not start_str:
        return None
    try:
        if "T" in start_str:
            return datetime.fromisoformat(start_str.replace("Z", "+00:00"))
        return datetime.fromisoformat(start_str).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


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
                    "maxResults": 20,
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
                        if a.get("email") and not a["email"].endswith("calendar.google.com")
                    ],
                }
                for e in items
            ]
            write_cache(admin, user_id, "google", cache_rows)

    if not items:
        return None

    best: Optional[dict] = None
    best_score = 0.0

    for event in items:
        event_start = _parse_event_start(event)
        if not event_start:
            continue
        if event_start.tzinfo is None:
            event_start = event_start.replace(tzinfo=timezone.utc)

        raw_attendees = event.get("attendees", [])
        attendee_emails = [
            a["email"]
            for a in raw_attendees
            if a.get("email") and not a["email"].endswith("calendar.google.com")
        ]

        t_score = _score_time(event_start, expense_dt)
        l_score = _score_location(event.get("location"), merchant_name, merchant_address)
        a_score = _score_attendees(len(attendee_emails))
        k_score = _score_title_keywords(event.get("summary"))
        score = t_score + l_score + a_score + k_score

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

    if best is None or best_score < 0.25:
        return None

    if best_score >= 0.75:
        action = "auto_apply"
    else:
        action = "suggest"

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
