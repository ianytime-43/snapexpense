"""
Core tax calculation engine.
Computes deductible amounts and ITCs based on country, category, and tax rates.
"""

import logging
from datetime import date
from typing import Optional

from supabase import Client

from .cra_categories import get_cra_category
from .irs_categories import get_irs_category
from .rates import get_total_tax_rate

logger = logging.getLogger(__name__)


def calculate_deduction(
    admin: Client,
    amount_total: float,
    amount_tax: Optional[float],
    category: Optional[str],
    country: str,
    region: Optional[str],
    expense_date: Optional[date] = None,
    expense_tag: Optional[str] = None,
) -> dict:
    """
    Calculate tax deduction for an expense.

    Returns:
    {
        "tax_deductible_amount": float,  # amount that can be deducted
        "itc_claimable": float,          # input tax credit (Canada only)
        "deduction_pct": float,          # deduction percentage applied (e.g., 0.5 for meals)
        "tax_line": str,                 # T2125 or Schedule C line number
        "tax_line_label": str,           # human-readable label
        "deduction_rule": str,           # explanation of rule applied
    }
    """
    # Personal expenses are not deductible
    if expense_tag == "personal":
        return {
            "tax_deductible_amount": 0.0,
            "itc_claimable": 0.0,
            "deduction_pct": 0.0,
            "tax_line": "N/A",
            "tax_line_label": "Personal expense",
            "deduction_rule": "Personal expenses are not tax-deductible",
        }

    cat = category or "Other"

    if country == "CA":
        return _calculate_cra(admin, amount_total, amount_tax, cat, region, expense_date)
    elif country == "US":
        return _calculate_irs(amount_total, cat)
    else:
        # Other countries: assume fully deductible, no ITC
        return {
            "tax_deductible_amount": amount_total,
            "itc_claimable": 0.0,
            "deduction_pct": 1.0,
            "tax_line": "N/A",
            "tax_line_label": "Other",
            "deduction_rule": "Standard deduction (non-CA/US)",
        }


def _calculate_cra(
    admin: Client,
    amount_total: float,
    amount_tax: Optional[float],
    category: str,
    region: Optional[str],
    expense_date: Optional[date],
) -> dict:
    """CRA deduction + ITC calculation for Canadian expenses."""
    cat_info = get_cra_category(category)
    deduction_pct = cat_info["deduction_pct"]

    # Deductible amount = total * deduction percentage
    # For meals: only 50% is deductible
    deductible = amount_total * deduction_pct

    # ITC calculation: tax paid * deduction percentage
    # For meals: ITC is only claimable on the deductible portion (50%)
    itc = 0.0
    if amount_tax and amount_tax > 0:
        itc = amount_tax * deduction_pct

    rule = f"{cat_info['label']} — {int(deduction_pct * 100)}% deductible"
    if deduction_pct < 1.0:
        rule += f" (CRA rule: {cat_info['label']} limited to {int(deduction_pct * 100)}%)"

    return {
        "tax_deductible_amount": round(deductible, 2),
        "itc_claimable": round(itc, 2),
        "deduction_pct": deduction_pct,
        "tax_line": cat_info["line"],
        "tax_line_label": cat_info["label"],
        "deduction_rule": rule,
    }


def _calculate_irs(
    amount_total: float,
    category: str,
) -> dict:
    """IRS deduction calculation for US expenses."""
    cat_info = get_irs_category(category)
    deduction_pct = cat_info["deduction_pct"]

    deductible = amount_total * deduction_pct

    rule = f"{cat_info['label']} — {int(deduction_pct * 100)}% deductible"
    if deduction_pct == 0:
        rule = f"{cat_info['label']} — not deductible (post-TCJA 2017)"
    elif deduction_pct < 1.0:
        rule += f" (IRS rule: meals limited to {int(deduction_pct * 100)}%)"

    return {
        "tax_deductible_amount": round(deductible, 2),
        "itc_claimable": 0.0,  # US doesn't have ITCs
        "deduction_pct": deduction_pct,
        "tax_line": cat_info["line"],
        "tax_line_label": cat_info["label"],
        "deduction_rule": rule,
    }


def calculate_expense_tax(
    admin: Client,
    expense: dict,
    user_country: str = "CA",
    user_region: Optional[str] = None,
) -> dict:
    """
    Convenience wrapper: takes a full expense dict, returns deduction info.
    Uses expense's own jurisdiction if available, falls back to user's home.
    """
    # Determine country/region from expense location or user default
    country = user_country
    region = user_region

    jurisdiction = expense.get("location_jurisdiction")
    if jurisdiction and ", " in jurisdiction:
        parts = jurisdiction.split(", ")
        if len(parts) == 2:
            region = parts[0]
            # Infer country from region
            ca_regions = {"AB","BC","MB","NB","NL","NS","NT","NU","ON","PE","QC","SK","YT"}
            if region in ca_regions:
                country = "CA"
            else:
                country = "US"

    expense_date = None
    if expense.get("expense_date"):
        try:
            expense_date = date.fromisoformat(expense["expense_date"])
        except (ValueError, TypeError):
            pass

    return calculate_deduction(
        admin=admin,
        amount_total=expense.get("amount_total") or 0,
        amount_tax=expense.get("amount_tax"),
        category=expense.get("category"),
        country=country,
        region=region,
        expense_date=expense_date,
        expense_tag=expense.get("expense_tag"),
    )
