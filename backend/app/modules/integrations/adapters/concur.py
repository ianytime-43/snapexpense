"""SAP Concur expense submission adapter."""
from ..base import BaseAdapter


DEFAULT_CONCUR_MAPPINGS = {
    "Meals & Entertainment": "MEALS",
    "Travel": "AIRFARE",
    "Transportation": "TAXI",
    "Accommodation": "HOTEL",
    "Office Supplies": "OFFIC",
    "Software": "SFTWR",
    "Professional Fees": "PROFE",
    "Advertising": "OTHER",
    "Vehicle": "CARRT",
    "Other": "OTHER",
}


class ConcurAdapter(BaseAdapter):
    """Transform SnapExpense data into SAP Concur expense report format."""

    def transform_expense(self, expense: dict, user_profile: dict | None = None) -> dict:
        profile = user_profile or {}
        return {
            "expenseTypeId": self._map_category(expense.get("category")),
            "transactionDate": expense.get("expense_date"),
            "transactionAmount": expense.get("amount_total"),
            "transactionCurrencyCode": expense.get("currency", "CAD"),
            "vendor": expense.get("merchant_name", ""),
            "comment": expense.get("business_purpose", ""),
            "custom1": profile.get("cost_center", ""),
            "custom2": profile.get("default_gl_code", ""),
        }

    def _map_category(self, category: str | None) -> str:
        return DEFAULT_CONCUR_MAPPINGS.get(category or "", "OTHER")

    def map_category(self, snap_category: str, mappings: dict) -> str:
        return mappings.get(snap_category, "OTHER")

    def get_default_mappings(self) -> dict[str, str]:
        return DEFAULT_CONCUR_MAPPINGS

    def format_for_submit(self, expenses: list[dict], user_profile: dict) -> list[dict]:
        return [self.transform_expense(e, user_profile) for e in expenses]
