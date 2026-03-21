"""
Reminders router — trigger reminder emails via external cron.
Prefix: /reminders
"""
import logging

from fastapi import APIRouter, Header, HTTPException

from ..config import settings
from ..database import get_supabase_admin
from ..services.reminders import check_reminder_candidates

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.post("/send")
def trigger_reminders(x_cron_secret: str = Header(None)):
    """Called by external cron. Protected by a shared secret header."""
    if settings.reminder_cron_secret and x_cron_secret != settings.reminder_cron_secret:
        raise HTTPException(status_code=401, detail="Invalid cron secret")
    admin = get_supabase_admin()
    candidates = check_reminder_candidates(admin)
    return {"sent": len(candidates)}
