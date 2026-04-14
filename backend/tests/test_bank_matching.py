"""Unit tests for Plaid bank transaction matching logic."""
from app.modules.bank.matching import score_pair, rank_candidates, auto_match


# ── score_pair ────────────────────────────────────────────────────────────────


def test_perfect_match_scores_high():
    tx = {
        "amount": 42.50,
        "currency": "USD",
        "merchant_name": "STARBUCKS",
        "transaction_date": "2026-04-10",
    }
    exp = {
        "id": "e1",
        "amount_total": 42.50,
        "currency": "USD",
        "merchant_name": "STARBUCKS",
        "expense_date": "2026-04-10",
    }
    assert score_pair(tx, exp) >= 0.9


def test_amount_off_by_two_dollars_still_matches_strongly():
    tx = {"amount": 50.00, "merchant_name": "UBER", "transaction_date": "2026-04-10"}
    exp = {
        "id": "e1",
        "amount_total": 48.00,
        "merchant_name": "UBER",
        "expense_date": "2026-04-10",
    }
    # Within $2 tolerance + same date + exact merchant
    assert score_pair(tx, exp) >= 0.8


def test_date_three_days_off_lower_score():
    tx = {"amount": 100.00, "merchant_name": "HILTON", "transaction_date": "2026-04-10"}
    exp = {
        "id": "e1",
        "amount_total": 100.00,
        "merchant_name": "HILTON",
        "expense_date": "2026-04-13",  # 3 days off
    }
    s = score_pair(tx, exp)
    assert s > 0.6  # still a match
    assert s < 0.95  # but not perfect


def test_completely_unrelated_scores_zero_or_low():
    tx = {"amount": 10.00, "merchant_name": "STARBUCKS", "transaction_date": "2026-04-10"}
    exp = {
        "id": "e1",
        "amount_total": 1500.00,
        "merchant_name": "AMAZON WEB SERVICES",
        "expense_date": "2026-01-01",
    }
    assert score_pair(tx, exp) < 0.3


def test_partial_merchant_name_match():
    tx = {"amount": 25.00, "merchant_name": "TIM HORTONS", "transaction_date": "2026-04-10"}
    exp = {
        "id": "e1",
        "amount_total": 25.00,
        "merchant_name": "TIM HORTONS #1234 TORONTO",
        "expense_date": "2026-04-10",
    }
    # Substring match should still score very high
    assert score_pair(tx, exp) >= 0.85


def test_uses_plaid_name_field_when_no_merchant_name():
    tx = {"amount": 30, "name": "WALMART SUPERCENTRE", "transaction_date": "2026-04-10"}
    exp = {
        "id": "e1",
        "amount_total": 30,
        "merchant_name": "WALMART",
        "expense_date": "2026-04-10",
    }
    assert score_pair(tx, exp) >= 0.7


# ── rank_candidates ───────────────────────────────────────────────────────────


def test_rank_candidates_returns_top_n_sorted():
    tx = {"amount": 50.00, "merchant_name": "SHELL", "transaction_date": "2026-04-10"}
    expenses = [
        {"id": "a", "amount_total": 50.00, "merchant_name": "SHELL", "expense_date": "2026-04-10"},
        {"id": "b", "amount_total": 50.00, "merchant_name": "ESSO", "expense_date": "2026-04-10"},
        {"id": "c", "amount_total": 200.00, "merchant_name": "SHELL", "expense_date": "2026-04-10"},
        {"id": "d", "amount_total": 9.99, "merchant_name": "NETFLIX", "expense_date": "2026-01-01"},
    ]
    top = rank_candidates(tx, expenses, top_n=3)
    assert len(top) == 3
    assert top[0]["id"] == "a"  # perfect match wins
    # scores are sorted descending
    assert top[0]["score"] >= top[1]["score"] >= top[2]["score"]


def test_rank_candidates_excludes_zero_scores():
    tx = {"amount": 0, "merchant_name": "", "transaction_date": ""}
    expenses = [{"id": "a", "amount_total": 0, "merchant_name": "", "expense_date": ""}]
    assert rank_candidates(tx, expenses) == []


# ── auto_match ────────────────────────────────────────────────────────────────


def test_auto_match_returns_match_when_above_threshold():
    tx = {
        "amount": 100.00,
        "currency": "USD",
        "merchant_name": "MARRIOTT",
        "transaction_date": "2026-04-10",
    }
    expenses = [
        {
            "id": "x",
            "amount_total": 100.00,
            "currency": "USD",
            "merchant_name": "MARRIOTT",
            "expense_date": "2026-04-10",
        }
    ]
    match = auto_match(tx, expenses, threshold=0.9)
    assert match is not None
    assert match["id"] == "x"


def test_auto_match_returns_none_when_below_threshold():
    tx = {"amount": 50.00, "merchant_name": "UNKNOWN", "transaction_date": "2026-04-10"}
    expenses = [
        {"id": "x", "amount_total": 200.00, "merchant_name": "OTHER", "expense_date": "2026-03-01"}
    ]
    assert auto_match(tx, expenses, threshold=0.9) is None
