"""
Enterprise expense submission router.
Handles employee profile configuration and expense formatting for
SAP Concur, ChromeRiver, Workday, and other enterprise platforms.
Prefix: /enterprise
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, EmailStr

from ..auth import get_current_user
from ..database import get_supabase_admin
from ..modules.integrations.adapters.concur import ConcurAdapter
from ..modules.integrations.adapters.chromeriver import ChromeRiverAdapter
from ..modules.integrations.adapters.workday import WorkdayAdapter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/enterprise", tags=["enterprise"])

SUPPORTED_PLATFORMS = {"concur", "chromeriver", "workday", "other"}

ENTERPRISE_PROFILE_FIELDS = {
    "employee_id",
    "cost_center",
    "default_gl_code",
    "manager_email",
    "enterprise_platform",
}

COMPLIANCE_REQUIRED_FIELDS = ["employee_id", "cost_center", "default_gl_code"]


class EnterpriseProfileUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    employee_id: Optional[str] = None
    cost_center: Optional[str] = None
    default_gl_code: Optional[str] = None
    manager_email: Optional[str] = None
    enterprise_platform: Optional[str] = None


class ValidateRequest(BaseModel):
    expense_ids: list[str]


class FormatRequest(BaseModel):
    expense_ids: list[str]
    platform: str


# ── GET /enterprise/profile ───────────────────────────────────────────────────

@router.get("/profile")
def get_enterprise_profile(current_user: dict = Depends(get_current_user)):
    """Return the current user's enterprise configuration fields."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()
    result = (
        admin.table("users")
        .select(
            "employee_id, cost_center, default_gl_code, manager_email, enterprise_platform"
        )
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not result or not result.data:
        raise HTTPException(404, "User not found")
    return result.data[0]


# ── PATCH /enterprise/profile ─────────────────────────────────────────────────

@router.patch("/profile")
def update_enterprise_profile(
    update: EnterpriseProfileUpdate,
    current_user: dict = Depends(get_current_user),
):
    """Update the current user's enterprise configuration."""
    user_id = str(current_user["user"].id)

    if (
        update.enterprise_platform is not None
        and update.enterprise_platform not in SUPPORTED_PLATFORMS
    ):
        raise HTTPException(
            400,
            f"Unsupported platform. Choose from: {', '.join(sorted(SUPPORTED_PLATFORMS))}",
        )

    data = {
        k: v
        for k, v in update.model_dump(exclude_none=True).items()
        if k in ENTERPRISE_PROFILE_FIELDS
    }
    if not data:
        raise HTTPException(400, "No updatable fields provided")

    admin = get_supabase_admin()
    result = admin.table("users").update(data).eq("id", user_id).execute()
    if not result or not result.data:
        raise HTTPException(500, "Failed to update enterprise profile")
    row = result.data[0]
    return {k: row.get(k) for k in ENTERPRISE_PROFILE_FIELDS}


# ── POST /enterprise/validate ─────────────────────────────────────────────────

@router.post("/validate")
def validate_expenses(
    body: ValidateRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Check compliance readiness for a set of expenses.
    Returns field-level pass/fail and per-expense issues.
    """
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    # Fetch user enterprise profile
    user_result = (
        admin.table("users")
        .select(
            "employee_id, cost_center, default_gl_code, manager_email, enterprise_platform"
        )
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not user_result or not user_result.data:
        raise HTTPException(404, "User not found")
    profile = user_result.data[0]

    # Profile compliance checks
    profile_checks = {
        field: bool(profile.get(field)) for field in COMPLIANCE_REQUIRED_FIELDS
    }

    # Fetch the requested expenses (must belong to current user and be confirmed)
    if not body.expense_ids:
        raise HTTPException(400, "No expense IDs provided")

    exp_result = (
        admin.table("expenses")
        .select("id, status, amount_total, expense_date, category, business_purpose, merchant_name")
        .eq("user_id", user_id)
        .in_("id", body.expense_ids)
        .execute()
    )
    found_expenses = exp_result.data or []
    found_ids = {e["id"] for e in found_expenses}
    not_found = [eid for eid in body.expense_ids if eid not in found_ids]

    expense_checks = []
    for exp in found_expenses:
        issues = []
        if exp.get("status") != "confirmed":
            issues.append("Expense must be in 'confirmed' status")
        if not exp.get("expense_date"):
            issues.append("Missing expense date")
        if not exp.get("amount_total"):
            issues.append("Missing amount")
        if not exp.get("category"):
            issues.append("Missing category")
        if not exp.get("business_purpose"):
            issues.append("Missing business purpose")
        expense_checks.append(
            {
                "id": exp["id"],
                "merchant_name": exp.get("merchant_name"),
                "amount_total": exp.get("amount_total"),
                "issues": issues,
                "ready": len(issues) == 0,
            }
        )

    profile_ready = all(profile_checks.values())
    all_expenses_ready = all(e["ready"] for e in expense_checks)

    return {
        "profile_checks": profile_checks,
        "profile_ready": profile_ready,
        "expense_checks": expense_checks,
        "all_expenses_ready": all_expenses_ready,
        "ready_to_submit": profile_ready and all_expenses_ready and len(not_found) == 0,
        "not_found_ids": not_found,
    }


# ── POST /enterprise/format ───────────────────────────────────────────────────

@router.post("/format")
def format_expenses(
    body: FormatRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Transform selected expenses into the target platform format.
    Returns the formatted payload (no actual submission occurs).
    """
    user_id = str(current_user["user"].id)

    platform = body.platform.lower()
    if platform not in SUPPORTED_PLATFORMS:
        raise HTTPException(
            400,
            f"Unsupported platform '{body.platform}'. Choose from: {', '.join(sorted(SUPPORTED_PLATFORMS))}",
        )

    if not body.expense_ids:
        raise HTTPException(400, "No expense IDs provided")

    admin = get_supabase_admin()

    # Fetch profile
    user_result = (
        admin.table("users")
        .select(
            "employee_id, cost_center, default_gl_code, manager_email, enterprise_platform"
        )
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    if not user_result or not user_result.data:
        raise HTTPException(404, "User not found")
    profile = user_result.data[0]

    # Fetch expenses
    exp_result = (
        admin.table("expenses")
        .select(
            "id, status, amount_total, expense_date, category, business_purpose, "
            "merchant_name, currency, payment_method"
        )
        .eq("user_id", user_id)
        .in_("id", body.expense_ids)
        .execute()
    )
    expenses = exp_result.data or []

    # Select adapter
    if platform == "concur":
        adapter = ConcurAdapter()
    elif platform == "chromeriver":
        adapter = ChromeRiverAdapter()
    elif platform == "workday":
        adapter = WorkdayAdapter()
    else:
        # "other" — return a generic format
        formatted = [
            {
                "id": e["id"],
                "date": e.get("expense_date"),
                "amount": e.get("amount_total"),
                "currency": e.get("currency", "CAD"),
                "merchant": e.get("merchant_name", ""),
                "category": e.get("category", ""),
                "purpose": e.get("business_purpose", ""),
                "cost_center": profile.get("cost_center", ""),
                "gl_code": profile.get("default_gl_code", ""),
                "employee_id": profile.get("employee_id", ""),
            }
            for e in expenses
        ]
        return {"platform": "other", "formatted_expenses": formatted}

    formatted = adapter.format_for_submit(expenses, profile)

    return {
        "platform": platform,
        "formatted_expenses": formatted,
        "expense_count": len(formatted),
    }
