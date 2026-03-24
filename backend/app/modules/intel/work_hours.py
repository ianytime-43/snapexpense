"""
Work hours prediction — suggests business/work/personal tag based on:
1. Time of day vs user's configured work hours
2. Day of week vs user's configured work days
3. Calendar match (if present, likely business/work)
"""

import logging
from datetime import datetime, time
from typing import Optional

logger = logging.getLogger(__name__)


def suggest_expense_tag(
    user_prefs: dict,
    expense_time: Optional[str] = None,
    expense_date: Optional[str] = None,
    has_calendar_match: bool = False,
    calendar_match_confidence: float = 0.0,
) -> tuple[str, str]:
    """
    Suggest an expense tag based on context.

    Returns (suggested_tag, reason) where:
    - suggested_tag: 'business', 'work', or 'personal'
    - reason: human-readable explanation

    Priority:
    1. Calendar match (high confidence) → business/work
    2. During work hours + work day → business/work
    3. Outside work hours or weekend → personal
    """
    categories = user_prefs.get("expense_categories", ["business", "personal"])

    # Determine user type: has 'work' means employee
    is_employee = "work" in categories
    business_tag = "work" if is_employee else "business"

    # Calendar match = strong signal
    if has_calendar_match and calendar_match_confidence >= 0.40:
        return (business_tag, "Calendar match found")

    # Check if expense is during work hours
    if expense_time and expense_date:
        try:
            is_work_time = _is_during_work_hours(
                expense_time,
                expense_date,
                user_prefs.get("work_hours_start", "09:00"),
                user_prefs.get("work_hours_end", "17:00"),
                user_prefs.get("work_days", [1, 2, 3, 4, 5]),
            )
            if is_work_time:
                return (business_tag, "During work hours")
            else:
                return ("personal", "Outside work hours")
        except Exception as e:
            logger.warning(f"Work hours check failed: {e}")

    # Default: personal (safer assumption)
    return ("personal", "No time context available")


def _is_during_work_hours(
    expense_time: str,
    expense_date: str,
    work_start: str,
    work_end: str,
    work_days: list[int],
) -> bool:
    """Check if the expense time falls within configured work hours."""
    # Parse time (HH:MM)
    hour, minute = map(int, expense_time.split(":"))
    exp_time = time(hour, minute)

    # Parse work hours
    start_h, start_m = map(int, work_start.split(":"))
    end_h, end_m = map(int, work_end.split(":"))
    start_time = time(start_h, start_m)
    end_time = time(end_h, end_m)

    # Parse day of week (1=Monday, 7=Sunday)
    exp_date = datetime.strptime(expense_date, "%Y-%m-%d")
    day_of_week = exp_date.isoweekday()  # 1=Mon, 7=Sun

    # Check day
    if day_of_week not in work_days:
        return False

    # Check time
    return start_time <= exp_time <= end_time
