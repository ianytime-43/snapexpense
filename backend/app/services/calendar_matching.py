"""
Shared scoring + token helpers for calendar matching.

Used by both calendar_matcher (Google) and outlook_matcher (Microsoft Graph)
so the scoring rubric stays in lock-step between providers.

Scoring rubric (totals max ~1.30, threshold for suggest=0.25, auto_apply=0.75):
  time proximity     0.00 – 0.50
  location overlap   0.00 – 0.30
  attendee count     0.00 – 0.20
  business keyword   0.00 – 0.30 (whole-word match in event title)
  all-day penalty   −0.20 (timed events strictly preferred)
"""
from __future__ import annotations

import re
import time
from datetime import datetime
from typing import Optional

# ── Token expiry helpers ──────────────────────────────────────────────────────

# Refresh proactively this many seconds before the access_token actually expires
# so an in-flight request never races against expiry.
TOKEN_EXPIRY_SAFETY_SECONDS = 60


def token_is_expired(token_data: dict) -> bool:
    """
    True if the token has no access_token, no recorded expiry, or is within
    TOKEN_EXPIRY_SAFETY_SECONDS of expiring. Returns True for missing data
    so callers refresh on first use after migration / re-deploy.
    """
    if not token_data.get("access_token"):
        return True
    expires_at = token_data.get("expires_at")
    if expires_at is None:
        # Legacy tokens stored before we tracked expiry — force refresh once.
        return True
    try:
        return time.time() >= float(expires_at) - TOKEN_EXPIRY_SAFETY_SECONDS
    except (TypeError, ValueError):
        return True


def stamp_expiry(token_data: dict) -> dict:
    """
    Compute and inject `expires_at` (unix seconds) from `expires_in` (seconds
    from now) so subsequent calls can avoid unnecessary refreshes.
    Mutates and returns token_data.
    """
    expires_in = token_data.get("expires_in")
    if expires_in:
        try:
            token_data["expires_at"] = int(time.time()) + int(expires_in)
        except (TypeError, ValueError):
            pass
    return token_data


# ── Scoring helpers ───────────────────────────────────────────────────────────

def score_time(event_start: datetime, expense_dt: datetime) -> float:
    diff_minutes = abs((expense_dt - event_start).total_seconds()) / 60
    if diff_minutes <= 30:
        return 0.50
    if diff_minutes <= 60:
        return 0.40
    if diff_minutes <= 120:
        return 0.25
    if diff_minutes <= 240:
        return 0.10
    if diff_minutes <= 480:  # up to 8h — covers tz-shifted same-day events
        return 0.05
    return 0.0


def score_location(
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


def score_attendees(count: int) -> float:
    if count >= 3:
        return 0.20
    if count == 2:
        return 0.15
    if count == 1:
        return 0.10
    return 0.0


BUSINESS_KEYWORDS: frozenset[str] = frozenset({
    "dinner", "lunch", "breakfast", "brunch", "coffee", "drinks",
    "meeting", "call", "sync", "review", "demo", "presentation",
    "client", "customer", "partner", "vendor",
})

# Whole-word match — exact word boundaries to avoid "demo" matching
# "democracy" or "call" matching "callback". Plurals are added explicitly
# below so we don't reintroduce the substring problem with \w*.
_KEYWORD_VARIANTS = set(BUSINESS_KEYWORDS) | {kw + "s" for kw in BUSINESS_KEYWORDS}
_KEYWORD_RE = re.compile(
    r"\b(" + "|".join(sorted(_KEYWORD_VARIANTS, key=len, reverse=True)) + r")\b",
    flags=re.IGNORECASE,
)


def score_title_keywords(event_title: Optional[str]) -> float:
    """0.30 bonus if the event title contains a recognisable business/meal keyword."""
    if not event_title:
        return 0.0
    return 0.30 if _KEYWORD_RE.search(event_title) else 0.0


# All-day events lack a precise time so they should never beat a timed event.
ALL_DAY_PENALTY = -0.20


def score_all_day_penalty(is_all_day: bool) -> float:
    return ALL_DAY_PENALTY if is_all_day else 0.0


def total_score(
    *,
    event_start: datetime,
    expense_dt: datetime,
    event_location: Optional[str],
    merchant_name: Optional[str],
    merchant_address: Optional[str],
    attendee_count: int,
    event_title: Optional[str],
    is_all_day: bool = False,
) -> float:
    return (
        score_time(event_start, expense_dt)
        + score_location(event_location, merchant_name, merchant_address)
        + score_attendees(attendee_count)
        + score_title_keywords(event_title)
        + score_all_day_penalty(is_all_day)
    )


# ── Match action thresholds ───────────────────────────────────────────────────
SUGGEST_THRESHOLD = 0.25
AUTO_APPLY_THRESHOLD = 0.75


def match_action(score: float) -> Optional[str]:
    """Return 'auto_apply', 'suggest', or None based on the configured thresholds."""
    if score >= AUTO_APPLY_THRESHOLD:
        return "auto_apply"
    if score >= SUGGEST_THRESHOLD:
        return "suggest"
    return None
