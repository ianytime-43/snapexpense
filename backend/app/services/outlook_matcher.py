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

logger = logging.getLogger(__name__)

MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
GRAPH_API = "https://graph.microsoft.com/v1.0"

BUSINESS_KEYWORDS = {
    "dinner", "lunch", "breakfast", "brunch", "coffee", "drinks",
    "meeting", "call", "sync", "review", "demo", "presentation",
    "client", "customer", "partner", "vendor",
}


# ── token management ──────────────────────────────────────────────────────────

def _refresh_access_token(token_data: dict) -> dict:
    """Exchange refresh_token for a fresh access_token. Returns updated token dict."""
    resp = httpx.post(
        MS_TOKEN_URL,
        data={
            "client_id": settings.microsoft_oauth_client_id,
            "client_secret": settings.microsoft_oauth_client_secret,
            "refresh_token": token_data["refresh_token"],
            "grant_type": "refresh_token",
            "scope": "https://graph.microsoft.com/Calendars.Read offline_access User.Read",
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

    try:
        refreshed = _refresh_access_token(token_data)
        admin.table("users").update(
            {"outlook_calendar_token": refreshed}
        ).eq("id", user_id).execute()
        return refreshed["access_token"]
    except Exception as exc:
        logger.warning("Outlook token refresh failed — user=%s: %s", user_id, exc)
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
    if diff_minutes <= 480:
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


def _score_title_keywords(event_title: Optional[str]) -> float:
    if not event_title:
        return 0.0
    if any(kw in event_title.lower() for kw in BUSINESS_KEYWORDS):
        return 0.30
    return 0.0


def _parse_event_start(event: dict) -> Optional[datetime]:
    start_raw = event.get("start", {})
    start_str = start_raw.get("dateTime") or start_raw.get("date")
    if not start_str:
        return None
    try:
        # Graph API returns ISO 8601; may or may not have tz offset
        if "T" in start_str:
            return datetime.fromisoformat(start_str.replace("Z", "+00:00"))
        return datetime.fromisoformat(start_str).replace(tzinfo=timezone.utc)
    except ValueError:
        return None


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
                    "$select": "id,subject,start,end,location,attendees",
                    "$top": "20",
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
                    "attendees_json": [
                        {"email": a["emailAddress"]["address"]}
                        for a in e.get("attendees", [])
                        if a.get("emailAddress", {}).get("address")
                        and not a["emailAddress"]["address"].endswith("microsoft.com")
                    ],
                }
                for e in items
            ]
            write_cache(admin, user_id, "microsoft", cache_rows)

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

        # Graph attendees: [{"emailAddress": {"address": ..., "name": ...}, "type": ...}]
        raw_attendees = event.get("attendees", [])
        attendee_emails = [
            a["emailAddress"]["address"]
            for a in raw_attendees
            if a.get("emailAddress", {}).get("address")
            and not a["emailAddress"]["address"].endswith("microsoft.com")
        ]

        location = event.get("location", {}).get("displayName")
        title = event.get("subject") or ""

        t_score = _score_time(event_start, expense_dt)
        l_score = _score_location(location, merchant_name, merchant_address)
        a_score = _score_attendees(len(attendee_emails))
        k_score = _score_title_keywords(title)
        score = t_score + l_score + a_score + k_score

        if score > best_score:
            best_score = score
            best = {
                "event_id": event.get("id"),
                "event_title": title,
                "event_location": event.get("location", {}).get("displayName"),
                "client_name": None,
                "business_purpose": title,
                "attendees": [{"email": e} for e in attendee_emails],
                "confidence": round(score, 3),
            }

    if best is None or best_score < 0.25:
        return None

    action = "auto_apply" if best_score >= 0.75 else "suggest"

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
