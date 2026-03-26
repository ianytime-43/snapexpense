"""IRS Schedule C category mapping for US self-employed users."""

IRS_CATEGORIES = {
    "Advertising": {"line": "8", "deduction_pct": 1.0, "label": "Advertising"},
    "Meals & Entertainment": {"line": "24b", "deduction_pct": 0.5, "label": "Deductible meals"},
    "Entertainment": {"line": "N/A", "deduction_pct": 0.0, "label": "Entertainment (non-deductible post-TCJA)"},
    "Insurance": {"line": "15", "deduction_pct": 1.0, "label": "Insurance (other than health)"},
    "Interest & Bank Charges": {"line": "16b", "deduction_pct": 1.0, "label": "Other interest"},
    "Office Supplies": {"line": "18", "deduction_pct": 1.0, "label": "Office supplies and postage"},
    "Professional Fees": {"line": "17", "deduction_pct": 1.0, "label": "Legal and professional services"},
    "Rent": {"line": "20b", "deduction_pct": 1.0, "label": "Rent or lease — other business property"},
    "Repairs & Maintenance": {"line": "21", "deduction_pct": 1.0, "label": "Repairs and maintenance"},
    "Salaries & Wages": {"line": "26", "deduction_pct": 1.0, "label": "Wages"},
    "Travel": {"line": "24a", "deduction_pct": 1.0, "label": "Travel"},
    "Telephone & Utilities": {"line": "25", "deduction_pct": 1.0, "label": "Utilities"},
    "Vehicle": {"line": "9", "deduction_pct": 1.0, "label": "Car and truck expenses"},
    "Software": {"line": "18", "deduction_pct": 1.0, "label": "Office supplies and postage"},
    "Transportation": {"line": "24a", "deduction_pct": 1.0, "label": "Travel"},
    "Accommodation": {"line": "24a", "deduction_pct": 1.0, "label": "Travel"},
    "Marketing": {"line": "8", "deduction_pct": 1.0, "label": "Advertising"},
    "Professional Services": {"line": "17", "deduction_pct": 1.0, "label": "Legal and professional services"},
    "Supplies": {"line": "22", "deduction_pct": 1.0, "label": "Supplies"},
    "Other": {"line": "27b", "deduction_pct": 1.0, "label": "Other expenses"},
    "Investment Fees": {"line": "27b", "deduction_pct": 1.0, "label": "Other expenses"},
}

def get_irs_category(category: str) -> dict:
    """Look up IRS Schedule C info for a SnapExpense category."""
    return IRS_CATEGORIES.get(category, IRS_CATEGORIES["Other"])
