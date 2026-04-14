"""Matching a single Plaid transaction to candidate expenses.

Spec rule of thumb: vendor name fuzzy match + date ±3 days + amount ±$2.
Returns ranked candidates with a 0..1 score.
"""
from __future__ import annotations

from datetime import datetime
from typing import Iterable


def _norm(s: str | None) -> str:
    return (s or "").upper().strip()


def _parse_date(d: str | None):
    if not d:
        return None
    try:
        return datetime.strptime(str(d)[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def score_pair(tx: dict, exp: dict) -> float:
    """0..1 score. >=0.9 is a strong auto-match candidate."""
    score = 0.0

    # Amount: ±$2 or 5% — Plaid amounts are positive for debits in 'amount' field
    tx_amount = abs(float(tx.get("amount") or 0))
    exp_amount = abs(float(exp.get("amount_total") or 0))
    if tx_amount > 0 and exp_amount > 0:
        diff = abs(tx_amount - exp_amount)
        diff_pct = diff / max(tx_amount, exp_amount)
        if diff < 0.01:
            score += 0.45
        elif diff <= 2.0 or diff_pct < 0.02:
            score += 0.35
        elif diff_pct < 0.05:
            score += 0.2

    # Date: ±3 days
    td = _parse_date(tx.get("transaction_date") or tx.get("date"))
    ed = _parse_date(exp.get("expense_date"))
    if td and ed:
        days = abs((td - ed).days)
        if days == 0:
            score += 0.25
        elif days <= 1:
            score += 0.2
        elif days <= 3:
            score += 0.1

    # Merchant fuzzy
    tx_m = _norm(tx.get("merchant_name") or tx.get("name"))
    exp_m = _norm(exp.get("merchant_name"))
    if tx_m and exp_m:
        if tx_m == exp_m:
            score += 0.25
        elif tx_m in exp_m or exp_m in tx_m:
            score += 0.18
        else:
            words_tx = set(w for w in tx_m.split() if len(w) > 2)
            words_exp = set(w for w in exp_m.split() if len(w) > 2)
            overlap = words_tx & words_exp
            if overlap:
                score += 0.1

    # Currency tie-breaker
    tx_c = (tx.get("currency") or "").upper()
    exp_c = (exp.get("currency") or "").upper()
    if tx_c and exp_c and tx_c == exp_c:
        score += 0.05

    return min(round(score, 3), 1.0)


def rank_candidates(tx: dict, expenses: Iterable[dict], top_n: int = 3) -> list[dict]:
    """Return top N expenses with score, sorted desc. Excludes score 0."""
    ranked = []
    for exp in expenses:
        s = score_pair(tx, exp)
        if s > 0:
            ranked.append({**exp, "score": s})
    ranked.sort(key=lambda x: x["score"], reverse=True)
    return ranked[:top_n]


def auto_match(tx: dict, expenses: Iterable[dict], threshold: float = 0.9) -> dict | None:
    """Return the single best expense if score >= threshold, else None."""
    top = rank_candidates(tx, expenses, top_n=1)
    if top and top[0]["score"] >= threshold:
        return top[0]
    return None
