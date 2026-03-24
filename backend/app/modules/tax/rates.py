"""
Tax rate lookup service.

Queries the tax_rates table to find applicable tax rates
for a given country, region, and date. Handles:
- Canadian provinces: GST, HST, PST, QST, RST
- US states: STATE sales tax
- Rate changes over time (via effective_from/effective_to dates)
"""

import logging
from datetime import date
from typing import Optional

from supabase import Client

logger = logging.getLogger(__name__)


def get_tax_rates(
    admin: Client,
    country: str,
    region: str,
    expense_date: Optional[date] = None,
) -> list[dict]:
    """
    Get all applicable tax rates for a country/region on a given date.

    Returns a list of rate dicts, e.g.:
    [{"tax_type": "GST", "rate": 0.05}, {"tax_type": "PST", "rate": 0.07}]

    For HST provinces, returns a single entry.
    For GST+PST provinces, returns two entries.
    For US states, returns a single STATE entry.

    Returns empty list if no rates found.
    """
    if not expense_date:
        expense_date = date.today()

    date_str = expense_date.isoformat()

    try:
        # Query rates where:
        # - country and region match
        # - effective_from <= expense_date
        # - effective_to is NULL (still active) OR effective_to >= expense_date
        result = (
            admin.table("tax_rates")
            .select("tax_type, rate")
            .eq("country", country.upper())
            .eq("region", region.upper())
            .lte("effective_from", date_str)
            .or_(f"effective_to.is.null,effective_to.gte.{date_str}")
            .execute()
        )

        if not result.data:
            logger.warning(f"No tax rates found for {country}/{region} on {date_str}")
            return []

        return [{"tax_type": r["tax_type"], "rate": float(r["rate"])} for r in result.data]

    except Exception as e:
        logger.error(f"Tax rate lookup failed: {e}")
        return []


def get_total_tax_rate(
    admin: Client,
    country: str,
    region: str,
    expense_date: Optional[date] = None,
) -> float:
    """
    Get the combined tax rate for a country/region.

    For Ontario: returns 0.13 (HST)
    For BC: returns 0.12 (GST 0.05 + PST 0.07)
    For Alberta: returns 0.05 (GST only)
    For New York: returns 0.04 (state only, no county/city)

    Returns 0.0 if no rates found.
    """
    rates = get_tax_rates(admin, country, region, expense_date)
    return sum(r["rate"] for r in rates)


def get_tax_summary_label(
    admin: Client,
    country: str,
    region: str,
    expense_date: Optional[date] = None,
) -> str:
    """
    Get a human-readable label for the tax, e.g.:
    - "HST 13%" for Ontario
    - "GST 5% + PST 7%" for BC
    - "GST 5% + QST 9.975%" for Quebec
    - "State 6.25%" for Texas
    - "No tax" for Delaware
    """
    rates = get_tax_rates(admin, country, region, expense_date)

    if not rates:
        return "No tax"

    parts = []
    for r in rates:
        pct = f"{r['rate'] * 100:.3g}%"
        parts.append(f"{r['tax_type']} {pct}")

    return " + ".join(parts)
