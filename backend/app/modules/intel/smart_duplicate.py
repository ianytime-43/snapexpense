"""Smart duplicate detection across sources (camera + email + bank feed)."""
import logging
from supabase import Client

logger = logging.getLogger(__name__)

def find_potential_duplicates(admin: Client, user_id: str, expense: dict) -> list[dict]:
    """Find expenses that might be duplicates of the given expense.
    Checks: same amount + similar merchant + close date (within 2 days)."""
    amount = expense.get("amount_total")
    date = expense.get("expense_date")
    merchant = expense.get("merchant_name", "")

    if not amount or not date:
        return []

    # Query similar expenses (filter out current expense in Python to avoid .neq() issues)
    try:
        results = (
            admin.table("expenses")
            .select("id, merchant_name, amount_total, expense_date, status")
            .eq("user_id", user_id)
            .gte("expense_date", _offset_date(date, -1))
            .lte("expense_date", _offset_date(date, 1))
            .execute()
        )
    except Exception:
        return []
    current_id = expense.get("id", "")
    results_data = [e for e in (results.data or []) if e.get("id") != current_id]
    results = type("obj", (object,), {"data": results_data})()

    duplicates = []
    for e in (results.data or []):
        e_amount = float(e.get("amount_total") or 0)
        if abs(e_amount - float(amount)) < 0.01:  # Same amount
            e_merchant = (e.get("merchant_name") or "").upper()
            # Require both merchant AND amount to match (first 8 chars of merchant)
            if merchant and e_merchant and merchant.upper()[:8] == e_merchant[:8]:
                duplicates.append({
                    "id": e["id"],
                    "merchant_name": e["merchant_name"],
                    "amount_total": e_amount,
                    "expense_date": e["expense_date"],
                    "reason": f"Same amount (${amount}) within 1 day, similar merchant",
                })

    return duplicates

def _offset_date(date_str: str, days: int) -> str:
    from datetime import datetime, timedelta
    d = datetime.strptime(date_str, "%Y-%m-%d")
    return (d + timedelta(days=days)).strftime("%Y-%m-%d")
