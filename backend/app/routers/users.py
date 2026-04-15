"""
Users router — GET/PATCH current user profile.
Prefix: /users
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict

from ..auth import get_current_user
from ..database import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["users"])

ALLOWED_FIELDS = {
    "full_name",
    "company_name",
    "department",
    "default_currency",
    "timezone",
    "reminder_frequency",
    "expense_workflow",
    "onboarding_complete",
    "notification_push",
    "notification_email",
    "notification_sms",
    # Preferences added in migration 012
    "expense_categories",
    "work_hours_start",
    "work_hours_end",
    "work_days",
    "country",
    # Auto-submit preferences from migration 021
    "auto_submit_frequency",
    "auto_submit_email",
}


class UserUpdate(BaseModel):
    # Root-cause guard: reject unknown fields with 422. Previously unknown keys
    # were silently dropped by pydantic, then again by ALLOWED_FIELDS.
    model_config = ConfigDict(extra="forbid")

    full_name: Optional[str] = None
    company_name: Optional[str] = None
    department: Optional[str] = None
    default_currency: Optional[str] = None
    timezone: Optional[str] = None
    reminder_frequency: Optional[str] = None
    expense_workflow: Optional[str] = None
    onboarding_complete: Optional[bool] = None
    notification_push: Optional[bool] = None
    notification_email: Optional[bool] = None
    notification_sms: Optional[bool] = None
    # Fields the UI (OnboardingPage, SettingsPage) actually sends.
    expense_categories: Optional[list[str]] = None  # migration 012 (JSONB)
    work_hours_start: Optional[str] = None          # migration 012
    work_hours_end: Optional[str] = None            # migration 012
    work_days: Optional[list[int]] = None           # migration 012 (JSONB)
    country: Optional[str] = None                   # migration 012
    auto_submit_frequency: Optional[str] = None     # migration 021
    auto_submit_email: Optional[str] = None         # migration 021


@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()
    result = admin.table("users").select("*").eq("id", user_id).limit(1).execute()
    if not result or not result.data:
        raise HTTPException(404, "User not found")
    data = result.data[0]
    # Don't return sensitive token columns
    for col in ("google_calendar_token", "outlook_calendar_token"):
        data.pop(col, None)
    return data


@router.patch("/me")
def update_me(update: UserUpdate, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["user"].id)
    data = {k: v for k, v in update.model_dump(exclude_none=True).items() if k in ALLOWED_FIELDS}
    if not data:
        raise HTTPException(400, "No updatable fields")
    admin = get_supabase_admin()
    result = admin.table("users").update(data).eq("id", user_id).execute()
    return result.data[0] if result.data else {}
