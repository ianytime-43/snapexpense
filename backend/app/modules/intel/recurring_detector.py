"""Detect recurring expenses from expense history."""
import logging
from collections import defaultdict
from datetime import datetime, timedelta
from supabase import Client

logger = logging.getLogger(__name__)

def detect_recurring(admin: Client, user_id: str) -> list[dict]:
    """Scan expense history for recurring patterns. Returns detected subscriptions."""
    expenses = admin.table("expenses").select("merchant_name, amount_total, expense_date, currency, expense_tag").eq("user_id", user_id).order("expense_date", desc=True).limit(500).execute()

    by_merchant = defaultdict(list)
    for e in (expenses.data or []):
        name = (e.get("merchant_name") or "").strip()
        if not name: continue
        by_merchant[name].append(e)

    recurring = []
    for merchant, exps in by_merchant.items():
        if len(exps) < 2: continue
        amounts = [float(e.get("amount_total") or 0) for e in exps]
        dates = sorted([e["expense_date"] for e in exps if e.get("expense_date")])
        if len(dates) < 2: continue

        # Check if amounts are similar (within 10%)
        avg_amount = sum(amounts) / len(amounts)
        if avg_amount == 0: continue
        consistent = all(abs(a - avg_amount) / avg_amount < 0.1 for a in amounts)
        if not consistent: continue

        # Check date intervals
        intervals = []
        for i in range(1, len(dates)):
            d1 = datetime.strptime(dates[i-1], "%Y-%m-%d")
            d2 = datetime.strptime(dates[i], "%Y-%m-%d")
            intervals.append((d2 - d1).days)

        avg_interval = sum(intervals) / len(intervals)
        if 25 <= avg_interval <= 35: frequency = "monthly"
        elif 350 <= avg_interval <= 380: frequency = "annual"
        elif 5 <= avg_interval <= 9: frequency = "weekly"
        else: continue

        last_date = dates[-1]
        last_amount = amounts[0]
        prev_amount = amounts[1] if len(amounts) > 1 else None
        price_change = None
        if prev_amount and prev_amount != last_amount:
            price_change = round(last_amount - prev_amount, 2)

        # Estimate next date
        next_date = (datetime.strptime(last_date, "%Y-%m-%d") + timedelta(days=int(avg_interval))).strftime("%Y-%m-%d")

        recurring.append({
            "merchant_name": merchant,
            "amount": round(last_amount, 2),
            "currency": exps[0].get("currency", "CAD"),
            "frequency": frequency,
            "expense_tag": exps[0].get("expense_tag", "business"),
            "last_seen_date": last_date,
            "next_expected_date": next_date,
            "times_seen": len(exps),
            "price_change": price_change,
        })

    return sorted(recurring, key=lambda r: r["amount"], reverse=True)
