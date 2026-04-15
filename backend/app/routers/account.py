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
                       if k not in ("google_calendar_token", "outlook_calendar_token",
                                    "microsoft_outlook_token")}
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


# User-scoped tables keyed by `user_id`. Deleted in this order; child tables
# (referencing expenses/receipts) are handled separately before this list runs.
# Keep in sync with supabase/migrations/*.sql.
USER_SCOPED_TABLES = (
    "bank_transactions",
    "plaid_items",
    "recurring_expenses",
    "accountant_access",
    "integration_connections",
    "category_mappings",
    "warranties",
    "expense_templates",
    "budgets",
    "trips",
    "vendor_memory",
    "expense_groups",
    "expense_reports",
    "forwarded_emails",
    "notifications",
    "calendar_events_cache",
    "user_forwarding_addresses",
)


def _safe_delete(admin, label: str, fn) -> None:
    """Run a delete best-effort; log and continue on failure (GDPR best-effort)."""
    try:
        fn()
    except Exception as exc:  # noqa: BLE001
        logger.warning("ACCOUNT DELETE: failed to clear %s: %s", label, exc)


@router.delete("/delete")
def delete_my_account(current_user: dict = Depends(get_current_user)):
    """Permanently delete user account and all associated data.

    Best-effort: per-table failures are logged but do not abort the run, so
    later tables still get cleared and the auth user is still removed.
    """
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    # Audit log entry (best-effort; table is optional).
    try:
        admin.table("audit_log").insert({
            "user_id": user_id,
            "action": "account_delete",
            "created_at": None,
        }).execute()
    except Exception as exc:
        # Non-fatal: audit_log table is optional — account deletion must proceed.
        logger.warning("ACCOUNT DELETE: audit_log insert failed for user=%s: %s", user_id, exc)

    # Child tables tied to expenses must go before expenses themselves.
    expense_ids: list[str] = []
    try:
        exp_rows = admin.table("expenses").select("id").eq("user_id", user_id).execute()
        expense_ids = [e["id"] for e in (exp_rows.data or [])]
    except Exception as exc:  # noqa: BLE001
        logger.warning("ACCOUNT DELETE: could not fetch expense ids: %s", exc)

    if expense_ids:
        _safe_delete(admin, "attendees",
                     lambda: admin.table("attendees").delete().in_("expense_id", expense_ids).execute())
        _safe_delete(admin, "expense_line_items",
                     lambda: admin.table("expense_line_items").delete().in_("expense_id", expense_ids).execute())
        _safe_delete(admin, "receipts (by expense_id)",
                     lambda: admin.table("receipts").delete().in_("expense_id", expense_ids).execute())

    # Receipts can also live keyed only by user_id — clear any stragglers.
    _safe_delete(admin, "receipts (by user_id)",
                 lambda: admin.table("receipts").delete().eq("user_id", user_id).execute())

    # Expenses next (FK-parent for the above children).
    _safe_delete(admin, "expenses",
                 lambda: admin.table("expenses").delete().eq("user_id", user_id).execute())

    # All other user-scoped tables.
    for table in USER_SCOPED_TABLES:
        _safe_delete(
            admin,
            table,
            lambda t=table: admin.table(t).delete().eq("user_id", user_id).execute(),
        )

    # User profile row (parent in public.users).
    _safe_delete(admin, "users profile",
                 lambda: admin.table("users").delete().eq("id", user_id).execute())

    # Auth user last — this signs them out and triggers any cascades we missed.
    try:
        admin.auth.admin.delete_user(user_id)
    except Exception as exc:  # noqa: BLE001
        logger.error("ACCOUNT DELETE: auth.admin.delete_user failed for %s: %s", user_id, exc)
        # Surface to caller so they know the auth principal still exists.
        raise

    return {"message": "Account deleted successfully"}
