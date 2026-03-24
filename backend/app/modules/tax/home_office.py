"""
Home office deduction calculator.
Canada: Detailed method only (flat rate discontinued after 2022)
USA: Simplified ($5/sq ft, max 300 sq ft = $1,500) OR actual method
"""

import logging

logger = logging.getLogger(__name__)


def calculate_home_office_ca(
    total_home_sqft: float,
    office_sqft: float,
    annual_rent: float = 0,
    annual_utilities: float = 0,
    annual_insurance: float = 0,
    annual_maintenance: float = 0,
    annual_property_tax: float = 0,
) -> dict:
    """
    Calculate Canadian home office deduction (detailed method only).
    Flat rate ($2/day) was discontinued after 2022.
    Requires T2200 from employer.
    """
    if total_home_sqft <= 0 or office_sqft <= 0:
        return {"error": "Square footage must be greater than 0"}

    business_use_pct = min(office_sqft / total_home_sqft, 1.0)

    total_expenses = (
        annual_rent + annual_utilities + annual_insurance +
        annual_maintenance + annual_property_tax
    )

    deduction = total_expenses * business_use_pct

    return {
        "country": "CA",
        "method": "detailed",
        "business_use_pct": round(business_use_pct * 100, 1),
        "total_home_expenses": round(total_expenses, 2),
        "deduction": round(deduction, 2),
        "breakdown": {
            "rent": round(annual_rent * business_use_pct, 2),
            "utilities": round(annual_utilities * business_use_pct, 2),
            "insurance": round(annual_insurance * business_use_pct, 2),
            "maintenance": round(annual_maintenance * business_use_pct, 2),
            "property_tax": round(annual_property_tax * business_use_pct, 2),
        },
        "note": "Requires T2200 form from employer. Flat rate method discontinued after 2022.",
    }


def calculate_home_office_us(
    total_home_sqft: float,
    office_sqft: float,
    annual_rent: float = 0,
    annual_utilities: float = 0,
    annual_insurance: float = 0,
    annual_maintenance: float = 0,
    annual_mortgage_interest: float = 0,
    annual_property_tax: float = 0,
) -> dict:
    """
    Calculate US home office deduction — compares simplified vs actual method.
    Simplified: $5/sq ft, max 300 sq ft = $1,500
    Actual: business-use % of total expenses
    """
    if total_home_sqft <= 0 or office_sqft <= 0:
        return {"error": "Square footage must be greater than 0"}

    business_use_pct = min(office_sqft / total_home_sqft, 1.0)

    # Simplified method
    simplified_sqft = min(office_sqft, 300)
    simplified_deduction = simplified_sqft * 5  # $5 per sq ft, max $1,500

    # Actual method
    total_expenses = (
        annual_rent + annual_utilities + annual_insurance +
        annual_maintenance + annual_mortgage_interest + annual_property_tax
    )
    actual_deduction = total_expenses * business_use_pct

    # Recommend the better method
    recommended = "simplified" if simplified_deduction >= actual_deduction else "actual"
    savings = abs(actual_deduction - simplified_deduction)

    return {
        "country": "US",
        "business_use_pct": round(business_use_pct * 100, 1),
        "simplified": {
            "method": "simplified",
            "sqft_used": simplified_sqft,
            "rate_per_sqft": 5,
            "deduction": round(simplified_deduction, 2),
            "max": 1500,
        },
        "actual": {
            "method": "actual",
            "total_home_expenses": round(total_expenses, 2),
            "deduction": round(actual_deduction, 2),
            "breakdown": {
                "rent": round(annual_rent * business_use_pct, 2),
                "utilities": round(annual_utilities * business_use_pct, 2),
                "insurance": round(annual_insurance * business_use_pct, 2),
                "maintenance": round(annual_maintenance * business_use_pct, 2),
                "mortgage_interest": round(annual_mortgage_interest * business_use_pct, 2),
                "property_tax": round(annual_property_tax * business_use_pct, 2),
            },
        },
        "recommended": recommended,
        "savings_vs_other": round(savings, 2),
    }
