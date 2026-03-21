"""
Reminder service — finds users with old unconfirmed draft expenses.

Call check_reminder_candidates(admin) from a scheduled job or cron endpoint.
Sends Mailgun emails when configured.
"""
import logging
from datetime import datetime, timedelta, timezone

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

REMINDER_THRESHOLD_DAYS = 3


def _send_reminder_email(email: str, name: str, count: int, total: float, oldest_date: str) -> None:
    if not settings.mailgun_api_key or not settings.mailgun_domain:
        logger.warning("Mailgun not configured — skipping reminder email to %s", email)
        return

    display_name = name or email.split("@")[0]
    subject = f"You have {count} unconfirmed expense{'s' if count != 1 else ''} waiting"
    total_fmt = f"${total:,.2f}"

    html_body = f"""
    <div style="font-family: -apple-system, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
      <h2 style="color: #16a34a;">SnapExpense reminder</h2>
      <p>Hi {display_name},</p>
      <p>You have <strong>{count} expense draft{'s' if count != 1 else ''}</strong> waiting for review,
         totalling <strong>{total_fmt}</strong>. The oldest is from <strong>{oldest_date}</strong>.</p>
      <p>These won't make it into your expense report until you confirm them.</p>
      <a href="{settings.frontend_url}"
         style="display:inline-block;background:#16a34a;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">
        Review expenses →
      </a>
      <p style="color:#6b7280;font-size:12px;margin-top:24px;">
        You're receiving this because you have a SnapExpense account.
        To stop reminders, visit Settings in the app.
      </p>
    </div>
    """

    try:
        resp = httpx.post(
            f"https://api.mailgun.net/v3/{settings.mailgun_domain}/messages",
            auth=("api", settings.mailgun_api_key),
            data={
                "from": f"SnapExpense <reminders@{settings.mailgun_domain}>",
                "to": email,
                "subject": subject,
                "html": html_body,
            },
            timeout=10.0,
        )
        resp.raise_for_status()
        logger.info("Reminder sent to %s (%d expenses)", email, count)
    except Exception as exc:
        logger.warning("Failed to send reminder to %s: %s", email, exc)


def check_reminder_candidates(admin) -> list[dict]:
    """
    Return users who have draft expenses older than REMINDER_THRESHOLD_DAYS days.
    Also sends reminder emails via Mailgun if configured.

    Each entry:
      user_id, email, count (number of old drafts), oldest_date (ISO string)

    Side-effect: logs each candidate at INFO level.
    """
    cutoff = (
        datetime.now(timezone.utc) - timedelta(days=REMINDER_THRESHOLD_DAYS)
    ).isoformat()

    try:
        result = (
            admin.table("expenses")
            .select("user_id, created_at, amount_total, users(email, full_name, reminder_frequency)")
            .eq("status", "draft")
            .lt("created_at", cutoff)
            .execute()
        )
    except Exception as exc:
        logger.error("reminder check failed: %s", exc)
        return []

    by_user: dict[str, dict] = {}
    for row in result.data or []:
        uid = row["user_id"]
        user_data = row.get("users") or {}

        # Skip users who have disabled reminders
        if user_data.get("reminder_frequency") == "never":
            continue

        if uid not in by_user:
            by_user[uid] = {
                "user_id": uid,
                "email": user_data.get("email"),
                "name": user_data.get("full_name"),
                "count": 0,
                "total": 0.0,
                "oldest_date": row["created_at"],
            }
        by_user[uid]["count"] += 1
        by_user[uid]["total"] += float(row.get("amount_total") or 0)
        if row["created_at"] < by_user[uid]["oldest_date"]:
            by_user[uid]["oldest_date"] = row["created_at"]

    candidates = list(by_user.values())
    for c in candidates:
        logger.info(
            "Reminder candidate: user=%s email=%s unconfirmed=%d oldest=%s",
            c["user_id"],
            c["email"],
            c["count"],
            c["oldest_date"][:10],
        )
        if c["email"]:
            _send_reminder_email(
                email=c["email"],
                name=c.get("name") or "",
                count=c["count"],
                total=c["total"],
                oldest_date=c["oldest_date"][:10],
            )
    return candidates
