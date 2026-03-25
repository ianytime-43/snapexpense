"""Account management — data export and account deletion."""

import json
import logging
from io import BytesIO
from zipfile import ZipFile

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from ..auth import get_current_user
from ..database import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/account", tags=["account"])


@router.get("/export")
def export_my_data(current_user: dict = Depends(get_current_user)):
    """Export all user data as a ZIP file containing JSON."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    # Collect all user data
    data = {}

    # Profile
    profile = admin.table("users").select("*").eq("id", user_id).maybe_single().execute()
    if profile.data:
        # Remove sensitive tokens
        safe_profile = {k: v for k, v in profile.data.items()
                       if k not in ("google_calendar_token", "microsoft_outlook_token")}
        data["profile"] = safe_profile

    # Expenses
    expenses = admin.table("expenses").select("*").eq("user_id", user_id).execute()
    data["expenses"] = expenses.data or []

    # Receipts
    receipts = admin.table("receipts").select("*").eq("user_id", user_id).execute()
    data["receipts"] = receipts.data or []

    # Attendees (via expenses)
    expense_ids = [e["id"] for e in data["expenses"]]
    if expense_ids:
        attendees = admin.table("attendees").select("*").in_("expense_id", expense_ids).execute()
        data["attendees"] = attendees.data or []
    else:
        data["attendees"] = []

    # Vendor memory
    try:
        vendor_mem = admin.table("vendor_memory").select("*").eq("user_id", user_id).execute()
        data["vendor_memory"] = vendor_mem.data or []
    except Exception:
        data["vendor_memory"] = []

    # Groups
    try:
        groups = admin.table("expense_groups").select("*").eq("user_id", user_id).execute()
        data["expense_groups"] = groups.data or []
    except Exception:
        data["expense_groups"] = []

    # Create ZIP
    buffer = BytesIO()
    with ZipFile(buffer, 'w') as zf:
        zf.writestr("snapexpense_data.json", json.dumps(data, indent=2, default=str))

    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=snapexpense_export.zip"},
    )


@router.delete("/delete")
def delete_my_account(current_user: dict = Depends(get_current_user)):
    """Permanently delete user account and all associated data."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    try:
        # Delete in order (foreign keys)
        # Get expense IDs first
        expenses = admin.table("expenses").select("id").eq("user_id", user_id).execute()
        expense_ids = [e["id"] for e in (expenses.data or [])]

        if expense_ids:
            # Delete attendees
            admin.table("attendees").delete().in_("expense_id", expense_ids).execute()
            # Delete line items
            admin.table("expense_line_items").delete().in_("expense_id", expense_ids).execute()
            # Delete receipts
            admin.table("receipts").delete().in_("expense_id", expense_ids).execute()

        # Delete expenses
        admin.table("expenses").delete().eq("user_id", user_id).execute()

        # Delete vendor memory
        try:
            admin.table("vendor_memory").delete().eq("user_id", user_id).execute()
        except Exception:
            pass

        # Delete groups
        try:
            admin.table("expense_groups").delete().eq("user_id", user_id).execute()
        except Exception:
            pass

        # Delete forwarded emails
        try:
            admin.table("forwarded_emails").delete().eq("user_id", user_id).execute()
        except Exception:
            pass

        # Delete notifications
        try:
            admin.table("notifications").delete().eq("user_id", user_id).execute()
        except Exception:
            pass

        # Delete user profile
        admin.table("users").delete().eq("id", user_id).execute()

        # Delete auth user (this signs them out)
        admin.auth.admin.delete_user(user_id)

        return {"message": "Account deleted successfully"}

    except Exception as e:
        logger.error(f"Account deletion failed: {e}")
        raise
