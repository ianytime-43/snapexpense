"""
Quarterly tax estimate calculator.
Estimates federal + provincial/state tax based on income and deductions.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# 2025 CRA federal tax brackets
CRA_FEDERAL_BRACKETS = [
    (55867, 0.15),
    (55866, 0.205),
    (61942, 0.26),
    (72030, 0.29),
    (float("inf"), 0.33),
]

# 2025 CRA CPP rates for self-employed
CRA_CPP_RATE = 0.1190  # Both employee + employer portions
CRA_CPP_MAX_PENSIONABLE = 71300
CRA_CPP_BASIC_EXEMPTION = 3500

# 2025 IRS federal tax brackets (single)
IRS_FEDERAL_BRACKETS = [
    (11600, 0.10),
    (35550, 0.12),  # 11601-47150
    (53375, 0.22),  # 47151-100525
    (50650, 0.24),  # 100526-191175
    (45475, 0.32),  # 191176-243725  (corrected: was 236726)
    (200000, 0.35),
    (float("inf"), 0.37),
]

# Self-employment tax (US)
IRS_SE_TAX_RATE = 0.153  # 12.4% SS + 2.9% Medicare
IRS_SE_TAX_THRESHOLD = 400  # Minimum to owe SE tax


def estimate_quarterly_tax_cra(
    annual_income: float,
    annual_deductions: float,
    province: Optional[str] = "ON",
) -> dict:
    """
    Estimate quarterly CRA tax instalment.
    Returns breakdown of federal, provincial, CPP.
    """
    taxable_income = max(0, annual_income - annual_deductions)

    # Federal tax
    federal = _apply_brackets(taxable_income, CRA_FEDERAL_BRACKETS)

    # Basic personal amount credit (2025: ~$16,129 × 15%)
    federal = max(0, federal - 16129 * 0.15)

    # Provincial tax (simplified — using ON rates as example, ~5.05% first bracket)
    # Real implementation would use province-specific brackets
    provincial_rates = {
        "ON": 0.0505, "BC": 0.0506, "AB": 0.10, "QC": 0.14,
        "MB": 0.108, "SK": 0.105, "NS": 0.0879, "NB": 0.094,
        "NL": 0.087, "PE": 0.098, "NT": 0.059, "NU": 0.04,
        "YT": 0.064,
    }
    prov_rate = provincial_rates.get(province, 0.05)
    provincial = taxable_income * prov_rate

    # CPP (self-employed pays both portions)
    cpp_pensionable = min(taxable_income, CRA_CPP_MAX_PENSIONABLE) - CRA_CPP_BASIC_EXEMPTION
    cpp = max(0, cpp_pensionable * CRA_CPP_RATE)

    total_annual = federal + provincial + cpp
    quarterly = total_annual / 4

    return {
        "annual_income": annual_income,
        "annual_deductions": annual_deductions,
        "taxable_income": taxable_income,
        "federal_tax": round(federal, 2),
        "provincial_tax": round(provincial, 2),
        "cpp_contributions": round(cpp, 2),
        "total_annual": round(total_annual, 2),
        "quarterly_instalment": round(quarterly, 2),
        "instalment_dates": ["March 15", "June 15", "September 15", "December 15"],
        "country": "CA",
        "disclaimer": "This is an estimate only. Consult a qualified tax professional.",
    }


def estimate_quarterly_tax_irs(
    annual_income: float,
    annual_deductions: float,
    state: Optional[str] = "NY",
) -> dict:
    """Estimate quarterly IRS tax payment (1040-ES)."""
    taxable_income = max(0, annual_income - annual_deductions)

    # Standard deduction (2025 single: $15,000)
    taxable_after_std = max(0, taxable_income - 15000)

    # Federal income tax
    federal = _apply_brackets(taxable_after_std, IRS_FEDERAL_BRACKETS)

    # Self-employment tax
    se_income = taxable_income * 0.9235  # 92.35% of net SE income
    se_tax = se_income * IRS_SE_TAX_RATE if se_income > IRS_SE_TAX_THRESHOLD else 0

    # Deduct half of SE tax from income tax
    federal = max(0, federal - se_tax * 0.5 * 0.22)  # Approximate marginal rate benefit

    # State tax (simplified flat rates)
    state_rates = {
        "CA": 0.093, "NY": 0.0685, "TX": 0.0, "FL": 0.0, "WA": 0.0,
        "IL": 0.0495, "PA": 0.0307, "OH": 0.04, "NJ": 0.0637,
        "MA": 0.05, "GA": 0.055, "NC": 0.0475, "VA": 0.0575,
    }
    state_rate = state_rates.get(state, 0.05)
    state_tax = taxable_income * state_rate

    total_annual = federal + se_tax + state_tax
    quarterly = total_annual / 4

    return {
        "annual_income": annual_income,
        "annual_deductions": annual_deductions,
        "taxable_income": taxable_income,
        "federal_tax": round(federal, 2),
        "se_tax": round(se_tax, 2),
        "state_tax": round(state_tax, 2),
        "total_annual": round(total_annual, 2),
        "quarterly_payment": round(quarterly, 2),
        "payment_dates": ["April 15", "June 15", "September 15", "January 15"],
        "country": "US",
        "disclaimer": "This is an estimate only. Consult a qualified tax professional.",
    }


def _apply_brackets(income: float, brackets: list[tuple[float, float]]) -> float:
    """Apply progressive tax brackets."""
    tax = 0.0
    remaining = income
    for bracket_size, rate in brackets:
        taxable_in_bracket = min(remaining, bracket_size)
        tax += taxable_in_bracket * rate
        remaining -= taxable_in_bracket
        if remaining <= 0:
            break
    return tax
