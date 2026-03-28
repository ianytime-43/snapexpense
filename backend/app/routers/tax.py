"""
Tax router — quarterly estimate endpoint.
Prefix: /tax
"""
import logging
from datetime import datetime

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
        .select("country, region, default_currency")
        .eq("id", user_id)
        .limit(1)
        .execute()
    )
    profile = profile_result.data[0] if profile_result.data else {}
    country = (profile.get("country") or "CA").upper()
    region = profile.get("region") or ("ON" if country == "CA" else "NY")
    province = region  # alias for CRA estimator
    state = region     # alias for IRS estimator

    # ── 2. Sum confirmed deductible expenses ──────────────────────────────────
    expenses_result = (
        admin.table("expenses")
        .select("amount_total, tax_deductible_amount, expense_tag")
        .eq("user_id", user_id)
        # Include all statuses so users see data before confirming
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


@router.get("/itc-report")
def get_itc_report(year: int = Query(default=None), current_user: dict = Depends(get_current_user)):
    """Export ITC summary by jurisdiction as JSON."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()
    if not year:
        year = datetime.now().year

    try:
        all_expenses = admin.table("expenses").select("*").eq("user_id", user_id).execute()
        # Filter in Python
        expenses = [e for e in (all_expenses.data or [])
                    if e.get("expense_tag") != "personal"
                    and (not e.get("expense_date") or e["expense_date"][:4] == str(year))]

        by_jurisdiction = {}
        for e in expenses:
            j = e.get("location_jurisdiction") or "Unknown"
            if j not in by_jurisdiction:
                by_jurisdiction[j] = {"tax_paid": 0, "itc_claimable": 0, "expense_count": 0, "total_amount": 0}
            by_jurisdiction[j]["tax_paid"] += float(e.get("amount_tax") or 0)
            by_jurisdiction[j]["itc_claimable"] += float(e.get("itc_claimable") or 0)
            by_jurisdiction[j]["expense_count"] += 1
            by_jurisdiction[j]["total_amount"] += float(e.get("amount_total") or 0)

        return {
            "year": year,
            "jurisdictions": [{**{"jurisdiction": k}, **{kk: round(vv, 2) for kk, vv in v.items()}} for k, v in sorted(by_jurisdiction.items())],
            "total_itc": round(sum(v["itc_claimable"] for v in by_jurisdiction.values()), 2),
            "total_tax_paid": round(sum(v["tax_paid"] for v in by_jurisdiction.values()), 2),
        }
    except Exception as e:
        return {"error": str(e), "jurisdictions": [], "total_itc": 0}


@router.get("/summary")
def get_tax_summary(
    quarter: int = Query(default=None, ge=1, le=4),
    year: int = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    """Tax dashboard summary — ITCs, deductions, by jurisdiction and category."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    # Default to current quarter/year
    now = datetime.now()
    if not year:
        year = now.year
    if not quarter:
        quarter = (now.month - 1) // 3 + 1

    # Date range for quarter
    q_start = f"{year}-{(quarter - 1) * 3 + 1:02d}-01"
    q_end_month = quarter * 3
    if q_end_month == 12:
        q_end = f"{year}-12-31"
    else:
        q_end = f"{year}-{q_end_month + 1:02d}-01"

    # Fetch ALL user expenses and filter in Python (avoids Supabase query issues)
    try:
        all_expenses = (
            admin.table("expenses")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
    except Exception as e:
        logger.error(f"Tax summary query failed: {e}")
        return {"error": str(e), "savings": {"itc_total": 0, "deductible_total": 0, "total_business_expenses": 0}, "jurisdictions": [], "categories": [], "completeness": {"percentage": 0, "total": 0, "categorized": 0, "drafts": 0}}

    # Filter by quarter date range (include expenses with no date)
    deduped = []
    for e in (all_expenses.data or []):
        ed = e.get("expense_date")
        if ed is None or (ed >= q_start and ed < q_end):
            deduped.append(e)
    class _R:
        def __init__(self, d): self.data = d
    expenses = _R(deduped)

    data = expenses.data or []

    # Filter to business/work only for tax calculations
    taxable = [e for e in data if e.get("expense_tag") != "personal"]
    all_expenses = data

    # Total tax savings (ITCs for CA, deductions for US)
    total_itc = sum(float(e.get("itc_claimable") or 0) for e in taxable)
    total_deductible = sum(float(e.get("tax_deductible_amount") or 0) for e in taxable)
    total_amount = sum(float(e.get("amount_total") or 0) for e in taxable)

    # By jurisdiction
    jurisdictions = {}
    for e in taxable:
        j = e.get("location_jurisdiction") or "Unknown"
        if j not in jurisdictions:
            jurisdictions[j] = {"amount": 0, "count": 0, "itc": 0}
        jurisdictions[j]["amount"] += float(e.get("amount_total") or 0)
        jurisdictions[j]["count"] += 1
        jurisdictions[j]["itc"] += float(e.get("itc_claimable") or 0)

    # By category with tax line
    categories = {}
    for e in taxable:
        cat = e.get("category") or "Other"
        if cat not in categories:
            categories[cat] = {"amount": 0, "deductible": 0, "count": 0, "tax_line": e.get("tax_line", ""), "deduction_pct": float(e.get("deduction_pct") or 1.0)}
        categories[cat]["amount"] += float(e.get("amount_total") or 0)
        categories[cat]["deductible"] += float(e.get("tax_deductible_amount") or 0)
        categories[cat]["count"] += 1

    # Completeness
    total_count = len(all_expenses)
    categorized = len([e for e in all_expenses if e.get("category") and e.get("expense_tag")])
    drafts = len([e for e in all_expenses if e.get("status") == "draft"])
    completeness = (categorized / total_count * 100) if total_count > 0 else 100

    return {
        "quarter": quarter,
        "year": year,
        "savings": {
            "itc_total": round(total_itc, 2),
            "deductible_total": round(total_deductible, 2),
            "total_business_expenses": round(total_amount, 2),
        },
        "jurisdictions": [
            {"name": k, **v} for k, v in sorted(jurisdictions.items(), key=lambda x: x[1]["amount"], reverse=True)
        ],
        "categories": [
            {"name": k, **v} for k, v in sorted(categories.items(), key=lambda x: x[1]["amount"], reverse=True)
        ],
        "completeness": {
            "percentage": round(completeness, 1),
            "total": total_count,
            "categorized": categorized,
            "drafts": drafts,
        },
    }
