"""Mileage calculation and method comparison."""

import logging

logger = logging.getLogger(__name__)

# 2025/2026 rates
CRA_RATE_FIRST_5000 = 0.70   # per km, first 5,000 km
CRA_RATE_AFTER_5000 = 0.64   # per km, after 5,000 km
IRS_RATE_2026 = 0.725         # per mile


def calculate_mileage_deduction_cra(total_km: float) -> dict:
    """CRA mileage deduction using standard per-km rates."""
    if total_km <= 5000:
        deduction = total_km * CRA_RATE_FIRST_5000
    else:
        deduction = 5000 * CRA_RATE_FIRST_5000 + (total_km - 5000) * CRA_RATE_AFTER_5000

    return {
        "method": "standard_rate",
        "total_km": total_km,
        "rate_first_5000": CRA_RATE_FIRST_5000,
        "rate_after_5000": CRA_RATE_AFTER_5000,
        "deduction": round(deduction, 2),
        "country": "CA",
    }


def calculate_mileage_deduction_irs(total_miles: float) -> dict:
    """IRS mileage deduction using standard per-mile rate."""
    deduction = total_miles * IRS_RATE_2026

    return {
        "method": "standard_rate",
        "total_miles": total_miles,
        "rate_per_mile": IRS_RATE_2026,
        "deduction": round(deduction, 2),
        "country": "US",
    }


def km_to_miles(km: float) -> float:
    return round(km * 0.621371, 2)

def miles_to_km(miles: float) -> float:
    return round(miles / 0.621371, 2)
