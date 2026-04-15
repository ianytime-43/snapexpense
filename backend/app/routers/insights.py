"""Spending insights and trends endpoints."""

import logging
from collections import defaultdict
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query

from ..auth import get_current_user
from ..database import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("/trends")
def get_spending_trends(
    months: int = Query(default=6, ge=1, le=24),
    current_user: dict = Depends(get_current_user),
):
    """Monthly spending totals for the last N months."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    start_date = (datetime.now() - timedelta(days=months * 30)).strftime("%Y-%m-%d")

    expenses = (
        admin.table("expenses")
        .select("amount_total, expense_date, category, expense_tag, currency")
        .eq("user_id", user_id)
        .execute()
    )

    # Group by month — include all expenses, filter by date if available
    monthly = defaultdict(lambda: {"total": 0, "business": 0, "work": 0, "personal": 0, "count": 0})
    for e in (expenses.data or []):
        if not e.get("amount_total") or float(e.get("amount_total") or 0) == 0:
            continue
        # Use expense_date if available, otherwise use current month
        exp_date = e.get("expense_date")
        if exp_date and exp_date < start_date:
            continue  # Too old
        month_key = (exp_date or datetime.now().strftime("%Y-%m-%d"))[:7]  # YYYY-MM
        amount = float(e["amount_total"])
        monthly[month_key]["total"] += amount
        monthly[month_key]["count"] += 1
        tag = e.get("expense_tag", "business")
        if tag in monthly[month_key]:
            monthly[month_key][tag] += amount

    # Sort by month
    sorted_months = sorted(monthly.items())

    return {
        "months": [{"month": m, **data} for m, data in sorted_months],
    }


@router.get("/top-vendors")
def get_top_vendors(
    months: int = Query(default=3, ge=1, le=12),
    limit: int = Query(default=10, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    """Top vendors by total spend."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    start_date = (datetime.now() - timedelta(days=months * 30)).strftime("%Y-%m-%d")

    expenses = (
        admin.table("expenses")
        .select("merchant_name, amount_total, expense_date")
        .eq("user_id", user_id)
        .execute()
    )

    vendor_totals = defaultdict(lambda: {"total": 0, "count": 0})
    for e in (expenses.data or []):
        name = e.get("merchant_name") or "Unknown"
        amount = float(e.get("amount_total") or 0)
        if amount == 0:
            continue  # Skip zero-amount expenses
        vendor_totals[name]["total"] += amount
        vendor_totals[name]["count"] += 1

    sorted_vendors = sorted(vendor_totals.items(), key=lambda x: x[1]["total"], reverse=True)[:limit]

    return {
        "vendors": [{"name": name, **data} for name, data in sorted_vendors],
    }


@router.get("/anomalies")
def get_anomalies(
    current_user: dict = Depends(get_current_user),
):
    """Detect spending anomalies — categories with unusual changes."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    # Get last 6 months of expenses
    start_date = (datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d")

    expenses = (
        admin.table("expenses")
        .select("amount_total, expense_date, category")
        .eq("user_id", user_id)
        .gte("expense_date", start_date)
        .execute()
    )

    # Group by category and month
    cat_monthly = defaultdict(lambda: defaultdict(float))
    for e in (expenses.data or []):
        if not e.get("expense_date") or not e.get("amount_total"):
            continue
        month = e["expense_date"][:7]
        cat = e.get("category") or "Other"
        cat_monthly[cat][month] += float(e["amount_total"])

    alerts = []
    now = datetime.now()
    current_month = now.strftime("%Y-%m")
    day_of_month = now.day

    for cat, months_data in cat_monthly.items():
        current = months_data.get(current_month, 0)

        # Skip categories with no current-month activity yet — "down 100%"
        # on a category simply because the user hasn't recorded anything
        # this month yet is noise, not a signal. A partial month against
        # complete prior months is not an apples-to-apples comparison.
        if current <= 0:
            continue

        prev_values = [v for m, v in months_data.items() if m != current_month]
        if not prev_values:
            continue
        avg = sum(prev_values) / len(prev_values)
        if avg <= 0:
            continue

        # Pro-rate current month to avoid false "down" alerts early in month.
        # Compare current month-to-date against prior months' expected amount
        # for the equivalent portion of the month.
        days_in_month = 30  # approximation; good enough for a noise filter
        proration = min(day_of_month / days_in_month, 1.0)
        expected_so_far = avg * proration
        if expected_so_far <= 0:
            continue

        pct_change = ((current - expected_so_far) / expected_so_far) * 100

        if abs(pct_change) >= 25:
            direction = "up" if pct_change > 0 else "down"
            alerts.append({
                "category": cat,
                "current_amount": round(current, 2),
                "average_amount": round(avg, 2),
                "pct_change": round(pct_change, 1),
                "direction": direction,
                "message": f"{cat} spending {direction} {abs(round(pct_change))}% vs average",
            })

    # Sort by absolute change
    alerts.sort(key=lambda a: abs(a["pct_change"]), reverse=True)

    return {"alerts": alerts}
