"""Fuzzy matching between bank transactions and scanned receipts."""
import logging
from datetime import datetime, timedelta
logger = logging.getLogger(__name__)

def match_transactions(transactions: list[dict], expenses: list[dict]) -> list[dict]:
    """Match bank transactions to expenses using fuzzy matching.
    Returns transactions with match info added."""
    results = []
    matched_expense_ids = set()
    for tx in transactions:
        best_match = None
        best_score = 0
        for exp in expenses:
            if exp["id"] in matched_expense_ids:
                continue
            score = _calculate_match_score(tx, exp)
            if score > best_score:
                best_score = score
                best_match = exp
        tx_result = {**tx, "match_confidence": round(best_score, 2), "matched_expense": None}
        if best_match and best_score >= 0.6:
            tx_result["matched_expense"] = best_match
            if best_score >= 0.9:
                matched_expense_ids.add(best_match["id"])
        results.append(tx_result)
    return results

def _calculate_match_score(tx: dict, exp: dict) -> float:
    score = 0.0
    tx_amount = abs(float(tx.get("amount") or 0))
    exp_amount = abs(float(exp.get("amount_total") or 0))
    if tx_amount > 0 and exp_amount > 0:
        diff_pct = abs(tx_amount - exp_amount) / max(tx_amount, exp_amount)
        if diff_pct == 0: score += 0.4
        elif diff_pct < 0.02: score += 0.3
        elif diff_pct < 0.05: score += 0.2
    tx_date = tx.get("transaction_date", "")
    exp_date = exp.get("expense_date", "")
    if tx_date and exp_date:
        try:
            td = datetime.strptime(str(tx_date)[:10], "%Y-%m-%d")
            ed = datetime.strptime(str(exp_date)[:10], "%Y-%m-%d")
            days = abs((td - ed).days)
            if days == 0: score += 0.25
            elif days <= 1: score += 0.2
            elif days <= 3: score += 0.1
        except ValueError: pass
    tx_merchant = (tx.get("merchant_name") or "").upper()
    exp_merchant = (exp.get("merchant_name") or "").upper()
    if tx_merchant and exp_merchant:
        if tx_merchant == exp_merchant: score += 0.25
        elif tx_merchant in exp_merchant or exp_merchant in tx_merchant: score += 0.15
        else:
            words_tx = set(tx_merchant.split())
            words_exp = set(exp_merchant.split())
            if words_tx & words_exp: score += 0.1
    tx_curr = (tx.get("currency") or "CAD").upper()
    exp_curr = (exp.get("currency") or "CAD").upper()
    if tx_curr == exp_curr: score += 0.1
    return min(score, 1.0)
