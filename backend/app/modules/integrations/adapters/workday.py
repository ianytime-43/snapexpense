"""Workday expense submission adapter (worktag format)."""
from ..base import BaseAdapter


DEFAULT_WORKDAY_MAPPINGS = {
    "Meals & Entertainment": "Expense_Type-Meals_Entertainment",
    "Travel": "Expense_Type-Travel_Airfare",
    "Transportation": "Expense_Type-Travel_Ground",
    "Accommodation": "Expense_Type-Travel_Hotel",
    "Office Supplies": "Expense_Type-Office_Supplies",
    "Software": "Expense_Type-Software_Subscriptions",
    "Professional Fees": "Expense_Type-Professional_Services",
    "Advertising": "Expense_Type-Marketing",
    "Vehicle": "Expense_Type-Mileage",
    "Other": "Expense_Type-Other",
}


class WorkdayAdapter(BaseAdapter):
    """Transform SnapExpense data into Workday worktag expense format."""

    def transform_expense(self, expense: dict, user_profile: dict | None = None) -> dict:
        profile = user_profile or {}
        return {
            "expenseItemType": self.map_category(
                expense.get("category", ""), self.get_default_mappings()
            ),
            "date": expense.get("expense_date"),
            "totalAmount": expense.get("amount_total"),
            "currency": expense.get("currency", "CAD"),
            "merchant": expense.get("merchant_name", ""),
            "memo": expense.get("business_purpose", ""),
            "worktags": {
                "costCenter": profile.get("cost_center", ""),
                "glCode": profile.get("default_gl_code", ""),
                "employeeId": profile.get("employee_id", ""),
            },
        }

    def map_category(self, snap_category: str, mappings: dict) -> str:
        return mappings.get(snap_category, "Expense_Type-Other")

    def get_default_mappings(self) -> dict[str, str]:
        return DEFAULT_WORKDAY_MAPPINGS

    def format_for_submit(self, expenses: list[dict], user_profile: dict) -> list[dict]:
        return [self.transform_expense(e, user_profile) for e in expenses]
