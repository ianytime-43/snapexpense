"""QuickBooks Online adapter."""
from .base import BaseAdapter

DEFAULT_QB_MAPPINGS = {
    "Meals & Entertainment": "Meals and Entertainment",
    "Travel": "Travel",
    "Office Supplies": "Office Expenses",
    "Software": "Computer and Internet Expenses",
    "Professional Fees": "Legal and Professional Fees",
    "Advertising": "Advertising",
    "Rent": "Rent or Lease",
    "Telephone & Utilities": "Utilities",
    "Transportation": "Travel",
    "Accommodation": "Travel",
    "Vehicle": "Auto",
    "Insurance": "Insurance",
    "Other": "Other Expenses",
}

class QuickBooksAdapter(BaseAdapter):
    def transform_expense(self, expense: dict) -> dict:
        return {
            "TxnDate": expense.get("expense_date"),
            "TotalAmt": expense.get("amount_total"),
            "PrivateNote": expense.get("business_purpose", ""),
            "PaymentType": "CreditCard" if expense.get("payment_method") == "corporate_card" else "Cash",
            "EntityRef": {"name": expense.get("merchant_name", "")},
            "CurrencyRef": {"value": expense.get("currency", "CAD")},
        }
    def map_category(self, snap_category: str, mappings: dict) -> str:
        return mappings.get(snap_category, "Other Expenses")
    def get_default_mappings(self) -> dict[str, str]:
        return DEFAULT_QB_MAPPINGS
