"""Missing receipt alert generation."""
import logging
from datetime import datetime, timedelta
from supabase import Client

logger = logging.getLogger(__name__)

def get_missing_receipt_summary(admin: Client, user_id: str) -> dict:
    """Generate missing receipt alert data."""
    # Get bank transactions without matched expenses
    try:
        unmatched = (
            admin.table("bank_transactions")
            .select("id, merchant_name, amount, transaction_date")
            .eq("user_id", user_id)
            .is_("matched_expense_id", "null")
            .order("transaction_date", desc=True)
            .limit(20)
            .execute()
        )
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
    with_receipts = admin.table("receipts").select("expense_id", count="exact").eq("user_id", user_id).not_.is_("expense_id", "null").execute()

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
