"""
Microsoft Outlook / Graph API calendar matching service.

Mirrors the logic of calendar_matcher.py but uses the Microsoft Identity
Platform v2.0 (MSAL-compatible) token flow and the Microsoft Graph API.

Token stored in users.outlook_calendar_token as JSONB:
  {access_token, refresh_token, outlook_email, ...}
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from anthropic import Anthropic

from ..config import settings
from .calendar_cache import cached_row_to_ms_event, read_cache, write_cache
from .calendar_matching import (
    match_action,
    stamp_expiry,
    token_is_expired,
    total_score,
)

logger = logging.getLogger(__name__)

MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
GRAPH_API = "https://graph.microsoft.com/v1.0"
MS_REFRESH_SCOPE = (
    "https://graph.microsoft.com/Calendars.Read "
    "offline_access User.Read"
)


# ── token management ──────────────────────────────────────────────────────────

def _refresh_access_token(token_data: dict) -> dict:
    """Exchange refresh_token for a fresh access_token. Returns merged token dict."""
    resp = httpx.post(
        MS_TOKEN_URL,
        data={
            "client_id": settings.microsoft_oauth_client_id,
            "client_secret": settings.microsoft_oauth_client_secret,
            "refresh_token": token_data["refresh_token"],
            "grant_type": "refresh_token",
            "scope": MS_REFRESH_SCOPE,
        },
        timeout=10.0,
    )
    resp.raise_for_status()
    new_tokens = resp.json()
    # Microsoft routinely rotates refresh_token — preserve the new one when
    # present, fall back to the existing one otherwise.
    merged = {**token_data, **new_tokens}
    if "refresh_token" not in new_tokens:
        merged["refresh_token"] = token_data["refresh_token"]
    return stamp_expiry(merged)


def _get_access_token(admin, user_id: str) -> Optional[str]:
    """Return a valid access_token for the user, refreshing only when needed."""
    try:
        result = (
            admin.table("users")
            .select("outlook_calendar_token")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        logger.warning("Could not fetch Outlook token — user=%s: %s", user_id, exc)
        return None

    if not result or not result.data:
        return None

    token_data = result.data.get("outlook_calendar_token")
    if not token_data or not token_data.get("refresh_token"):
        return None

    if not token_is_expired(token_data):
        return token_data["access_token"]

    try:
        refreshed = _refresh_access_token(token_data)
        admin.table("users").update(
            {"outlook_calendar_token": refreshed}
        ).eq("id", user_id).execute()
        return refreshed["access_token"]
    except Exception as exc:
        logger.warning("Outlook token refresh failed — user=%s: %s", user_id, exc)
        return None


# ── event parsing ─────────────────────────────────────────────────────────────

def _parse_event_start(event: dict) -> tuple[Optional[datetime], bool]:
    """Return (start_datetime, is_all_day). Graph events expose both isAllDay + start/end."""
    is_all_day = bool(event.get("isAllDay"))
    start_raw = event.get("start", {})
    start_str = start_raw.get("dateTime") or start_raw.get("date")
    if not start_str:
        return None, is_all_day
    try:
        if "T" in start_str:
            return datetime.fromisoformat(start_str.replace("Z", "+00:00")), is_all_day
        return datetime.fromisoformat(start_str).replace(tzinfo=timezone.utc), is_all_day
    except ValueError:
        return None, is_all_day


# ── Claude Haiku helpers (shared logic, independent calls) ────────────────────

def _extract_client_name(event_title: str) -> Optional[str]:
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
        logger.warning("Outlook client name extraction failed for %r: %s", event_title, exc)
        return None


def _generate_business_purpose(
    event_title: str,
    merchant_name: Optional[str],
    category: Optional[str],
    amount_total: Optional[float],
    attendee_count: int,
) -> str:
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
        logger.warning("Outlook business purpose generation failed for %r: %s", event_title, exc)
        return event_title


# ── public API ────────────────────────────────────────────────────────────────

def get_outlook_match(
    admin,
    user_id: str,
    expense_dt: Optional[datetime],
    merchant_name: Optional[str],
    merchant_address: Optional[str],
    category: Optional[str] = None,
    amount_total: Optional[float] = None,
) -> Optional[dict]:
    """
    Find the best-matching Outlook Calendar event for an expense via Graph API.

    Returns the same dict shape as get_calendar_match() so the pipeline can
    treat both interchangeably:
      action, confidence, event_id, event_title,
      client_name, business_purpose, attendees
    """
    if not settings.microsoft_oauth_client_id:
        return None
    if not expense_dt:
        return None

    access_token = _get_access_token(admin, user_id)
    if not access_token:
        return None

    if expense_dt.tzinfo is None:
        expense_dt = expense_dt.replace(tzinfo=timezone.utc)

    # Wide window — same rationale as Google matcher (OCR times are naive)
    dt_min = expense_dt - timedelta(hours=12)
    dt_max = expense_dt + timedelta(hours=4)

    # ── cache check ───────────────────────────────────────────────────────────
    cached = read_cache(admin, user_id, "microsoft", dt_min, dt_max)
    if cached is not None:
        logger.info("Outlook calendar cache hit — user=%s count=%d", user_id, len(cached))
        items = [cached_row_to_ms_event(row) for row in cached]
    else:
        # ── live API fetch ────────────────────────────────────────────────────
        try:
            resp = httpx.get(
                f"{GRAPH_API}/me/calendarView",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Prefer": 'outlook.timezone="UTC"',
                },
                params={
                    "startDateTime": dt_min.isoformat(),
                    "endDateTime": dt_max.isoformat(),
                    "$select": "id,subject,start,end,location,attendees,isAllDay,seriesMasterId,type",
                    "$top": "50",
                    "$orderby": "start/dateTime",
                },
                timeout=10.0,
            )
            resp.raise_for_status()
        except httpx.HTTPStatusError as exc:
            logger.warning(
                "Outlook Graph HTTP %s — user=%s: %s",
                exc.response.status_code, user_id, exc.response.text[:200],
            )
            return None
        except Exception as exc:
            logger.warning("Outlook Graph request failed — user=%s: %s", user_id, exc)
            return None

        items = resp.json().get("value", [])
        # Populate cache for subsequent receipts in the same batch
        if items:
            cache_rows = [
                {
                    "external_event_id": e.get("id", ""),
                    "title": e.get("subject") or "",
                    "location": e.get("location", {}).get("displayName"),
                    "start_time": (
                        e.get("start", {}).get("dateTime")
                        or e.get("start", {}).get("date", "")
                    ),
                    # Graph attendees: exclude resource-mailbox attendees (rooms/equipment)
                    # but keep ALL human attendees regardless of email domain — the
                    # previous .endswith("microsoft.com") filter excluded real users.
                    "attendees_json": [
                        {"email": a["emailAddress"]["address"]}
                        for a in e.get("attendees", [])
                        if a.get("emailAddress", {}).get("address")
                        and a.get("type") != "resource"
                    ],
                }
                for e in items
            ]
            write_cache(admin, user_id, "microsoft", cache_rows)

    if not items:
        return None

    best: Optional[dict] = None
    best_score = 0.0
    seen_recurring: set[str] = set()

    for event in items:
        event_start, is_all_day = _parse_event_start(event)
        if not event_start:
            continue
        if event_start.tzinfo is None:
            event_start = event_start.replace(tzinfo=timezone.utc)

        # Recurring-event dedupe — Graph populates seriesMasterId on instances
        series_id = event.get("seriesMasterId")
        if series_id:
            if series_id in seen_recurring:
                continue
            seen_recurring.add(series_id)

        # Graph attendees: keep all humans, exclude resource-mailbox entries.
        raw_attendees = event.get("attendees", [])
        attendee_emails = [
            a["emailAddress"]["address"]
            for a in raw_attendees
            if a.get("emailAddress", {}).get("address")
            and a.get("type") != "resource"
        ]

        location = (event.get("location") or {}).get("displayName")
        title = event.get("subject") or ""

        score = total_score(
            event_start=event_start,
            expense_dt=expense_dt,
            event_location=location,
            merchant_name=merchant_name,
            merchant_address=merchant_address,
            attendee_count=len(attendee_emails),
            event_title=title,
            is_all_day=is_all_day,
        )

        if score > best_score:
            best_score = score
            best = {
                "event_id": event.get("id"),
                "event_title": title,
                "event_location": location,
                "client_name": None,
                "business_purpose": title,
                "attendees": [{"email": e} for e in attendee_emails],
                "confidence": round(score, 3),
            }

    action = match_action(best_score) if best else None
    if best is None or action is None:
        return None

    best["client_name"] = _extract_client_name(best["event_title"])
    best["business_purpose"] = _generate_business_purpose(
        event_title=best["event_title"],
        merchant_name=merchant_name,
        category=category,
        amount_total=amount_total,
        attendee_count=len(best["attendees"]),
    )
    logger.info(
        "Outlook match — %r confidence=%.3f action=%s client=%r",
        best["event_title"], best_score, action, best["client_name"],
    )
    return {**best, "action": action}
