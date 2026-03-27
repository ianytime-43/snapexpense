"""
Accountant access router.
Prefix: /accountant
"""
import logging
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr

from ..auth import get_current_user
from ..database import get_supabase_admin
from ..modules.export.tax_package import generate_tax_package

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/accountant", tags=["accountant"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class InviteRequest(BaseModel):
    accountant_email: EmailStr


class CommentRequest(BaseModel):
    expense_id: str
    comment: str


# ── Owner endpoints ───────────────────────────────────────────────────────────

@router.post("/invite")
def invite_accountant(body: InviteRequest, current_user: dict = Depends(get_current_user)):
    """Invite an accountant by email. Generates a read-only access token."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    token = str(uuid.uuid4())

    result = (
        admin.table("accountant_access")
        .upsert(
            {
                "user_id": user_id,
                "accountant_email": body.accountant_email,
                "access_token": token,
                "granted_at": datetime.utcnow().isoformat(),
            },
            on_conflict="user_id,accountant_email",
        )
        .execute()
    )

    row = result.data[0] if result.data else {}
    # Return the current token (may be newly generated or existing after upsert)
    # Re-fetch to get accurate token after possible upsert
    fetched = (
        admin.table("accountant_access")
        .select("*")
        .eq("user_id", user_id)
        .eq("accountant_email", body.accountant_email)
        .maybe_single()
        .execute()
    )
    row = fetched.data or {}
    return {
        "accountant_email": row.get("accountant_email"),
        "access_token": row.get("access_token"),
        "granted_at": row.get("granted_at"),
    }


@router.delete("/revoke/{email}")
def revoke_accountant(email: str, current_user: dict = Depends(get_current_user)):
    """Revoke accountant access by email."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    admin.table("accountant_access").delete().eq("user_id", user_id).eq("accountant_email", email).execute()
    return {"revoked": True}


@router.get("/access-list")
def list_access(current_user: dict = Depends(get_current_user)):
    """List all accountants with access to this user's data."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    result = (
        admin.table("accountant_access")
        .select("accountant_email, access_token, granted_at, last_accessed_at")
        .eq("user_id", user_id)
        .order("granted_at", desc=True)
        .execute()
    )
    return result.data or []


@router.get("/tax-package/{year}")
def download_tax_package(year: int, current_user: dict = Depends(get_current_user)):
    """Download an annual tax package ZIP for the given year."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    if year < 2000 or year > datetime.utcnow().year + 1:
        raise HTTPException(status_code=400, detail="Invalid year")

    buffer = generate_tax_package(admin, user_id, year)
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=tax_package_{year}.zip"},
    )


# ── Public accountant endpoints (token-based, no auth) ───────────────────────

def _resolve_token(token: str):
    """Look up accountant_access row by token; raise 404 if not found."""
    admin = get_supabase_admin()
    result = (
        admin.table("accountant_access")
        .select("*")
        .eq("access_token", token)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Invalid or expired access token")
    # Update last_accessed_at
    admin.table("accountant_access").update({"last_accessed_at": datetime.utcnow().isoformat()}).eq("access_token", token).execute()
    return result.data


@router.get("/view/{token}")
def accountant_view(token: str):
    """
    Public read-only view for accountant.
    Returns all non-personal expenses + comments for the user linked to the token.
    """
    row = _resolve_token(token)
    user_id = row["user_id"]
    admin = get_supabase_admin()

    try:
        expenses_result = (
            admin.table("expenses")
            .select("*")
            .eq("user_id", user_id)
            .order("expense_date", desc=True)
            .execute()
        )
    except Exception:
        expenses_result = type("obj", (object,), {"data": []})()
    expenses_data = [e for e in (expenses_result.data or []) if e.get("expense_tag") != "personal"]

    expense_ids = [e["id"] for e in expenses_data]

    comments = []
    if expense_ids:
        comments_result = (
            admin.table("expense_comments")
            .select("*")
            .in_("expense_id", expense_ids)
            .order("created_at")
            .execute()
        )
        comments = comments_result.data or []

    return {
        "accountant_email": row["accountant_email"],
        "granted_at": row["granted_at"],
        "expenses": expenses_data,
        "comments": comments,
    }


@router.post("/comment/{token}")
def add_comment(token: str, body: CommentRequest):
    """Accountant adds a comment on an expense (public endpoint, token auth)."""
    row = _resolve_token(token)
    admin = get_supabase_admin()

    # Verify the expense belongs to the user linked to this token
    expense = (
        admin.table("expenses")
        .select("id, user_id")
        .eq("id", body.expense_id)
        .eq("user_id", row["user_id"])
        .maybe_single()
        .execute()
    )
    if not expense.data:
        raise HTTPException(status_code=404, detail="Expense not found")

    result = (
        admin.table("expense_comments")
        .insert(
            {
                "expense_id": body.expense_id,
                "author_email": row["accountant_email"],
                "comment": body.comment,
            }
        )
        .execute()
    )
    return result.data[0] if result.data else {}
