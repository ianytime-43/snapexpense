"""Intel modules: duplicate detection, transaction matching, work hours suggestion."""
from app.modules.intel.smart_duplicate import find_potential_duplicates, _offset_date
from app.modules.intel.transaction_matcher import match_transactions
from app.modules.intel.work_hours import suggest_expense_tag


# ---- Duplicate detection ----

class FakeTable:
    def __init__(self, rows):
        self.rows = list(rows)
    def select(self, *_a, **_k): return self
    def eq(self, k, v):
        self.rows = [r for r in self.rows if r.get(k) == v]
        return self
    def gte(self, k, v):
        self.rows = [r for r in self.rows if r.get(k) and r.get(k) >= v]
        return self
    def lte(self, k, v):
        self.rows = [r for r in self.rows if r.get(k) and r.get(k) <= v]
        return self
    def execute(self):
        return type("R", (), {"data": self.rows})()

class FakeAdmin:
    def __init__(self, rows): self.rows = rows
    def table(self, _name): return FakeTable(self.rows)


class TestSmartDuplicate:
    def test_finds_match_same_amount_similar_merchant(self):
        existing = [{
            "id": "e1", "merchant_name": "STARBUCKS COFFEE", "user_id": "user-1",
            "amount_total": 5.50, "expense_date": "2026-01-15", "status": "confirmed",
        }]
        admin = FakeAdmin(existing)
        new_exp = {
            "id": "e2", "merchant_name": "Starbucks",
            "amount_total": 5.50, "expense_date": "2026-01-15",
        }
        dups = find_potential_duplicates(admin, "user-1", new_exp)
        assert len(dups) == 1
        assert dups[0]["id"] == "e1"

    def test_excludes_self(self):
        existing = [{
            "id": "e1", "merchant_name": "Starbucks", "user_id": "u",
            "amount_total": 5.50, "expense_date": "2026-01-15", "status": "confirmed",
        }]
        admin = FakeAdmin(existing)
        new_exp = {
            "id": "e1", "merchant_name": "Starbucks",
            "amount_total": 5.50, "expense_date": "2026-01-15",
        }
        assert find_potential_duplicates(admin, "u", new_exp) == []

    def test_different_amount_not_duplicate(self):
        existing = [{
            "id": "e1", "merchant_name": "Starbucks", "user_id": "u",
            "amount_total": 6.00, "expense_date": "2026-01-15", "status": "confirmed",
        }]
        admin = FakeAdmin(existing)
        new_exp = {"merchant_name": "Starbucks", "amount_total": 5.50, "expense_date": "2026-01-15"}
        assert find_potential_duplicates(admin, "u", new_exp) == []

    def test_missing_amount_returns_empty(self):
        admin = FakeAdmin([])
        assert find_potential_duplicates(admin, "u", {"merchant_name": "x", "expense_date": "2026-01-15"}) == []

    def test_offset_date(self):
        assert _offset_date("2026-01-15", -1) == "2026-01-14"
        assert _offset_date("2026-01-15", 1) == "2026-01-16"
        assert _offset_date("2026-02-28", 1) == "2026-03-01"


# ---- Transaction matcher ----

class TestTransactionMatcher:
    def test_perfect_match_high_score(self):
        txs = [{"id": "t1", "amount": 100.0, "transaction_date": "2026-01-15",
                "merchant_name": "STARBUCKS", "currency": "CAD"}]
        exps = [{"id": "e1", "amount_total": 100.0, "expense_date": "2026-01-15",
                 "merchant_name": "STARBUCKS", "currency": "CAD"}]
        result = match_transactions(txs, exps)
        assert result[0]["match_confidence"] >= 0.9
        assert result[0]["matched_expense"]["id"] == "e1"

    def test_no_match_returns_no_expense(self):
        txs = [{"id": "t1", "amount": 100.0, "transaction_date": "2026-01-15",
                "merchant_name": "STARBUCKS", "currency": "CAD"}]
        exps = [{"id": "e1", "amount_total": 5000.0, "expense_date": "2025-06-01",
                 "merchant_name": "AMAZON", "currency": "USD"}]
        result = match_transactions(txs, exps)
        assert result[0]["matched_expense"] is None

    def test_one_expense_wont_double_match(self):
        # Same expense should only be claimed by one tx (when score ≥ 0.9)
        txs = [
            {"id": "t1", "amount": 50.0, "transaction_date": "2026-01-15",
             "merchant_name": "UBER", "currency": "CAD"},
            {"id": "t2", "amount": 50.0, "transaction_date": "2026-01-15",
             "merchant_name": "UBER", "currency": "CAD"},
        ]
        exps = [{"id": "e1", "amount_total": 50.0, "expense_date": "2026-01-15",
                 "merchant_name": "UBER", "currency": "CAD"}]
        result = match_transactions(txs, exps)
        matched = [r for r in result if r["matched_expense"]]
        assert len(matched) == 1


# ---- Work hours suggestion ----

class TestWorkHoursSuggestion:
    def test_calendar_match_returns_business(self):
        prefs = {"expense_categories": ["business", "personal"]}
        tag, _reason = suggest_expense_tag(prefs, has_calendar_match=True, calendar_match_confidence=0.8)
        assert tag == "business"

    def test_employee_gets_work_tag(self):
        prefs = {"expense_categories": ["work", "personal"]}
        tag, _ = suggest_expense_tag(prefs, has_calendar_match=True, calendar_match_confidence=0.8)
        assert tag == "work"

    def test_during_work_hours_business(self):
        prefs = {
            "expense_categories": ["business", "personal"],
            "work_hours_start": "09:00", "work_hours_end": "17:00",
            "work_days": [1, 2, 3, 4, 5],
        }
        # 2026-03-25 is a Wednesday
        tag, _ = suggest_expense_tag(prefs, expense_time="12:30", expense_date="2026-03-25")
        assert tag == "business"

    def test_weekend_personal(self):
        prefs = {
            "expense_categories": ["business", "personal"],
            "work_hours_start": "09:00", "work_hours_end": "17:00",
            "work_days": [1, 2, 3, 4, 5],
        }
        # 2026-03-28 is Saturday
        tag, _ = suggest_expense_tag(prefs, expense_time="12:30", expense_date="2026-03-28")
        assert tag == "personal"

    def test_after_hours_personal(self):
        prefs = {
            "expense_categories": ["business", "personal"],
            "work_hours_start": "09:00", "work_hours_end": "17:00",
            "work_days": [1, 2, 3, 4, 5],
        }
        tag, _ = suggest_expense_tag(prefs, expense_time="22:00", expense_date="2026-03-25")
        assert tag == "personal"

    def test_low_confidence_calendar_ignored(self):
        prefs = {"expense_categories": ["business", "personal"]}
        tag, _ = suggest_expense_tag(prefs, has_calendar_match=True, calendar_match_confidence=0.1)
        # Falls through to "no time context" → personal
        assert tag == "personal"

    def test_no_context_defaults_personal(self):
        prefs = {"expense_categories": ["business", "personal"]}
        tag, reason = suggest_expense_tag(prefs)
        assert tag == "personal"
        assert "No time context" in reason
