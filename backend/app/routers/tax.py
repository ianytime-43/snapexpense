"""
Tax router — quarterly estimate endpoint.
Prefix: /tax
"""
import logging

from fastapi import APIRouter, Depends, Query

from ..auth import get_current_user
from ..database import get_supabase_admin
from ..modules.tax.estimator import estimate_quarterly_tax_cra, estimate_quarterly_tax_irs

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/tax", tags=["tax"])


@router.get("/quarterly-estimate")
def get_quarterly_estimate(
    annual_income: float = Query(..., gt=0, description="Gross annual income"),
    current_user: dict = Depends(get_current_user),
):
    """
    Estimate quarterly tax instalment / payment.

    1. Fetches the user's country and region from their profile.
    2. Sums all confirmed deductible expense amounts for this user.
    3. Delegates to the CRA or IRS estimator based on country.
    """
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    # ── 1. User profile ──────────────────────────────────────────────────────
    profile_result = (
        admin.table("users")
        .select("country, province, state, default_currency")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    profile = profile_result.data[0] if profile_result.data else {}
    country = (profile.get("country") or "CA").upper()
    province = profile.get("province") or "ON"
    state = profile.get("state") or "NY"

    # ── 2. Sum confirmed deductible expenses ──────────────────────────────────
    expenses_result = (
        admin.table("expenses")
        .select("amount_total, tax_deductible_amount, expense_tag")
        .eq("user_id", user_id)
        .eq("status", "confirmed")
        .execute()
    )

    annual_deductions = 0.0
    for exp in expenses_result.data or []:
        # Skip personal expenses
        if exp.get("expense_tag") == "personal":
            continue
        # Prefer pre-computed deductible amount; fall back to full amount
        deductible = exp.get("tax_deductible_amount")
        if deductible is not None:
            annual_deductions += float(deductible)
        else:
            annual_deductions += float(exp.get("amount_total") or 0)

    # ── 3. Estimate ───────────────────────────────────────────────────────────
    if country == "CA":
        result = estimate_quarterly_tax_cra(
            annual_income=annual_income,
            annual_deductions=annual_deductions,
            province=province,
        )
    else:
        result = estimate_quarterly_tax_irs(
            annual_income=annual_income,
            annual_deductions=annual_deductions,
            state=state,
        )

    result["confirmed_deductions_used"] = round(annual_deductions, 2)
    return result
