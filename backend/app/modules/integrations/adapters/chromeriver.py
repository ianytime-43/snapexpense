"""ChromeRiver expense submission adapter (email-based XML format)."""
from ..base import BaseAdapter


DEFAULT_CHROMERIVER_MAPPINGS = {
    "Meals & Entertainment": "Meals",
    "Travel": "Airfare",
    "Transportation": "Ground Transportation",
    "Accommodation": "Hotel",
    "Office Supplies": "Office Supplies",
    "Software": "Software/Subscriptions",
    "Professional Fees": "Professional Services",
    "Advertising": "Marketing",
    "Vehicle": "Mileage",
    "Other": "Miscellaneous",
}


class ChromeRiverAdapter(BaseAdapter):
    """Transform SnapExpense data into ChromeRiver email-based submission format."""

    def transform_expense(self, expense: dict, user_profile: dict | None = None) -> dict:
        profile = user_profile or {}
        return {
            "type": self.map_category(expense.get("category", ""), self.get_default_mappings()),
            "date": expense.get("expense_date"),
            "amount": expense.get("amount_total"),
            "currency": expense.get("currency", "CAD"),
            "merchant": expense.get("merchant_name", ""),
            "businessPurpose": expense.get("business_purpose", ""),
            "costCenter": profile.get("cost_center", ""),
            "glCode": profile.get("default_gl_code", ""),
            "employeeId": profile.get("employee_id", ""),
        }

    def map_category(self, snap_category: str, mappings: dict) -> str:
        return mappings.get(snap_category, "Miscellaneous")

    def get_default_mappings(self) -> dict[str, str]:
        return DEFAULT_CHROMERIVER_MAPPINGS

    def format_for_submit(self, expenses: list[dict], user_profile: dict) -> list[dict]:
        return [self.transform_expense(e, user_profile) for e in expenses]

    def format_as_email_body(self, expenses: list[dict], user_profile: dict) -> str:
        """Produce a plain-text email body suitable for ChromeRiver email ingestion."""
        lines = [
            f"Employee ID: {user_profile.get('employee_id', '')}",
            f"Cost Center: {user_profile.get('cost_center', '')}",
            "",
            "EXPENSE ITEMS:",
        ]
        for i, exp in enumerate(expenses, 1):
            transformed = self.transform_expense(exp, user_profile)
            lines.append(
                f"{i}. {transformed['date']} | {transformed['type']} | "
                f"{transformed['currency']} {transformed['amount']} | {transformed['merchant']} | "
                f"{transformed['businessPurpose']}"
            )
        return "\n".join(lines)
