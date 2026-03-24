"""CRA T2125 category mapping for Canadian self-employed users."""

# Maps SnapExpense categories to T2125 line numbers and deduction rules
CRA_CATEGORIES = {
    "Advertising": {"line": "8521", "deduction_pct": 1.0, "label": "Advertising"},
    "Meals & Entertainment": {"line": "8523", "deduction_pct": 0.5, "label": "Meals and entertainment"},
    "Insurance": {"line": "8690", "deduction_pct": 1.0, "label": "Insurance"},
    "Interest & Bank Charges": {"line": "8710", "deduction_pct": 1.0, "label": "Interest and bank charges"},
    "Office Supplies": {"line": "8810", "deduction_pct": 1.0, "label": "Office expenses"},
    "Professional Fees": {"line": "8860", "deduction_pct": 1.0, "label": "Professional fees"},
    "Rent": {"line": "8910", "deduction_pct": 1.0, "label": "Business tax, fees, licences, dues, memberships, and subscriptions"},
    "Repairs & Maintenance": {"line": "8960", "deduction_pct": 1.0, "label": "Repairs and maintenance"},
    "Salaries & Wages": {"line": "9060", "deduction_pct": 1.0, "label": "Salaries, wages, and benefits"},
    "Travel": {"line": "9200", "deduction_pct": 1.0, "label": "Travel"},
    "Telephone & Utilities": {"line": "9220", "deduction_pct": 1.0, "label": "Telephone and utilities"},
    "Vehicle": {"line": "9281", "deduction_pct": 1.0, "label": "Motor vehicle expenses"},  # business-use % applied separately
    "Software": {"line": "8810", "deduction_pct": 1.0, "label": "Office expenses"},
    "Transportation": {"line": "9200", "deduction_pct": 1.0, "label": "Travel"},
    "Accommodation": {"line": "9200", "deduction_pct": 1.0, "label": "Travel"},
    "Marketing": {"line": "8521", "deduction_pct": 1.0, "label": "Advertising"},
    "Professional Services": {"line": "8860", "deduction_pct": 1.0, "label": "Professional fees"},
    "Other": {"line": "9270", "deduction_pct": 1.0, "label": "Other expenses"},
}

def get_cra_category(category: str) -> dict:
    """Look up CRA T2125 info for a SnapExpense category."""
    return CRA_CATEGORIES.get(category, CRA_CATEGORIES["Other"])
