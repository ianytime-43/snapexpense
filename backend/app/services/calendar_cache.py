"""
Read/write layer for the calendar_events_cache table.

Used by both calendar_matcher (provider='google') and
outlook_matcher (provider='microsoft') to avoid redundant API calls
during batch receipt processing.

TTL: 24 hours (set by the expires_at column default in the schema).
Cache hit policy: if ANY non-expired events exist in the window, return
them. A window with genuinely no events will always miss — that's acceptable.
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)

CACHE_TTL_HOURS = 24


def read_cache(
    admin,
    user_id: str,
    provider: str,
    time_min: datetime,
    time_max: datetime,
) -> Optional[list[dict]]:
    """
    Return non-expired cached event rows for the window, or None if empty.

    Each row has: external_event_id, title, location, start_time, attendees_json.
    Returns None (not []) when there are no rows so callers can distinguish
    "cache miss" from "confirmed empty window".
    """
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        result = (
            admin.table("calendar_events_cache")
            .select("external_event_id,title,location,start_time,attendees_json")
            .eq("user_id", user_id)
            .eq("provider", provider)
            .gte("start_time", time_min.isoformat())
            .lte("start_time", time_max.isoformat())
            .gt("expires_at", now_iso)
            .execute()
        )
        if result and result.data:
            return result.data
    except Exception as exc:
        logger.warning(
            "Calendar cache read failed — user=%s provider=%s: %s",
            user_id, provider, exc,
        )
    return None


def write_cache(
    admin,
    user_id: str,
    provider: str,
    events: list[dict],
) -> None:
    """
    Upsert events into the cache. Non-fatal on failure.

    Each event dict must have:
      external_event_id (str), start_time (ISO str), and optionally
      title, location, attendees_json (list of {"email": ...}).
    """
    if not events:
        return

    expires = (datetime.now(timezone.utc) + timedelta(hours=CACHE_TTL_HOURS)).isoformat()
    rows = [
        {
            "user_id": user_id,
            "provider": provider,
            "external_event_id": e["external_event_id"],
            "title": e.get("title"),
            "location": e.get("location"),
            "start_time": e["start_time"],
            "attendees_json": e.get("attendees_json") or [],
            "expires_at": expires,
        }
        for e in events
        if e.get("external_event_id") and e.get("start_time")
    ]
    if not rows:
        return
    try:
        admin.table("calendar_events_cache").upsert(
            rows,
            on_conflict="user_id,provider,external_event_id",
        ).execute()
        logger.info(
            "Calendar cache written — user=%s provider=%s count=%d",
            user_id, provider, len(rows),
        )
    except Exception as exc:
        logger.warning(
            "Calendar cache write failed — user=%s provider=%s: %s",
            user_id, provider, exc,
        )


def cached_row_to_google_event(row: dict) -> dict:
    """
    Convert a calendar_events_cache row to the shape the Google Calendar
    scoring loop expects (mirrors the structure of a Google Calendar API event).
    """
    return {
        "id": row["external_event_id"],
        "summary": row.get("title") or "",
        "location": row.get("location"),
        "start": {"dateTime": row["start_time"]},
        # attendees_json is already [{email: ...}] — same as Google API
        "attendees": row.get("attendees_json") or [],
    }


def cached_row_to_ms_event(row: dict) -> dict:
    """
    Convert a calendar_events_cache row to the shape the Outlook / Graph API
    scoring loop expects.
    """
    attendees_json = row.get("attendees_json") or []
    # Convert [{email: ...}] → MS Graph attendees format
    ms_attendees = [
        {"emailAddress": {"address": a["email"]}}
        for a in attendees_json
        if a.get("email")
    ]
    return {
        "id": row["external_event_id"],
        "subject": row.get("title") or "",
        "location": {"displayName": row.get("location") or ""},
        "start": {"dateTime": row["start_time"]},
        "attendees": ms_attendees,
    }
