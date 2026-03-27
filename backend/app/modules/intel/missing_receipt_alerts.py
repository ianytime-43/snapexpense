"""Missing receipt alert generation."""
import logging
from datetime import datetime, timedelta
from supabase import Client

logger = logging.getLogger(__name__)

def get_missing_receipt_summary(admin: Client, user_id: str) -> dict:
    """Generate missing receipt alert data."""
    # Get bank transactions without matched expenses
    try:
        _all_tx = (
            admin.table("bank_transactions")
            .select("id, merchant_name, amount, transaction_date, matched_expense_id")
            .eq("user_id", user_id)
            .order("transaction_date", desc=True)
            .execute()
        )
        _unmatched_data = [t for t in (_all_tx.data or []) if t.get("matched_expense_id") is None][:20]
        unmatched = type('obj', (object,), {'data': _unmatched_data})()
    except Exception:
        unmatched = type('obj', (object,), {'data': []})()

    # Get draft expenses older than 7 days
    week_ago = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
    stale_drafts = (
        admin.table("expenses")
        .select("id, merchant_name, amount_total, expense_date")
        .eq("user_id", user_id)
        .eq("status", "draft")
        .lte("created_at", week_ago)
        .limit(10)
        .execute()
    )

    # Get total receipt coverage
    total_expenses = admin.table("expenses").select("id", count="exact").eq("user_id", user_id).execute()
    try:
        _receipts_res = admin.table("receipts").select("expense_id").eq("user_id", user_id).execute()
        _receipt_rows = [r for r in (_receipts_res.data or []) if r.get("expense_id") is not None]
        with_receipts = type('obj', (object,), {'count': len(_receipt_rows)})()
    except Exception:
        with_receipts = type('obj', (object,), {'count': 0})()

    total = total_expenses.count or 0
    covered = with_receipts.count or 0
    coverage = (covered / total * 100) if total > 0 else 100

    return {
        "unmatched_transactions": unmatched.data or [],
        "stale_drafts": stale_drafts.data or [],
        "receipt_coverage": round(coverage, 1),
        "total_expenses": total,
        "with_receipts": covered,
    }
