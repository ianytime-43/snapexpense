"""Tests for smart_rules matcher + apply logic."""
import pytest

from app.modules.smart_rules.matcher import (
    VALID_CATEGORIES,
    _pattern_matches,
    apply_rule_to_expense,
    match_rule,
)


class TestPatternMatch:
    def test_substring_case_insensitive(self):
        assert _pattern_matches("Starbucks", "STARBUCKS #123 SEATTLE")
        assert _pattern_matches("starbucks", "Starbucks Coffee")
        assert not _pattern_matches("Starbucks", "Tim Hortons")

    def test_empty_inputs(self):
        assert not _pattern_matches("", "foo")
        assert not _pattern_matches("foo", "")
        assert not _pattern_matches("", "")

    def test_regex_prefix(self):
        assert _pattern_matches("re:^UBER", "UBER *TRIP 12345")
        assert _pattern_matches("re:tim\\s*hortons", "Tim Hortons #42")
        assert not _pattern_matches("re:^UBER", "MY UBER RIDE")

    def test_invalid_regex_returns_false(self):
        # Unbalanced bracket should not raise
        assert not _pattern_matches("re:[unclosed", "anything")


class TestMatchRule:
    def test_first_match_wins(self):
        rules = [
            {"id": "a", "merchant_pattern": "Coffee", "category": "meals"},
            {"id": "b", "merchant_pattern": "Starbucks", "category": "other"},
        ]
        hit = match_rule(rules, "Starbucks Coffee")
        assert hit["id"] == "a"  # first match wins

    def test_no_match_returns_none(self):
        rules = [{"id": "a", "merchant_pattern": "Uber"}]
        assert match_rule(rules, "Tim Hortons") is None

    def test_empty_merchant(self):
        rules = [{"id": "a", "merchant_pattern": "Uber"}]
        assert match_rule(rules, "") is None

    def test_empty_rules(self):
        assert match_rule([], "Starbucks") is None


class TestApplyRuleToExpense:
    def test_fills_category_when_missing(self):
        exp: dict = {"merchant_name": "Starbucks"}
        rule = {"id": "r1", "category": "meals", "is_tax_deductible": False}
        out = apply_rule_to_expense(exp, rule)
        assert out["category"] == "meals"
        assert out["applied_rule_id"] == "r1"

    def test_does_not_overwrite_existing_category(self):
        exp = {"merchant_name": "Starbucks", "category": "travel"}
        rule = {"id": "r1", "category": "meals"}
        out = apply_rule_to_expense(exp, rule)
        assert out["category"] == "travel"

    def test_tax_deductible_sets_pct_when_unset(self):
        exp: dict = {"merchant_name": "Adobe"}
        rule = {"id": "r1", "category": "software", "is_tax_deductible": True}
        out = apply_rule_to_expense(exp, rule)
        assert out["deduction_pct"] == 100

    def test_tax_deductible_respects_existing_pct(self):
        exp = {"merchant_name": "Adobe", "deduction_pct": 50}
        rule = {"id": "r1", "is_tax_deductible": True}
        out = apply_rule_to_expense(exp, rule)
        assert out["deduction_pct"] == 50


class TestValidCategories:
    def test_has_expected_core_categories(self):
        for cat in ("meals", "travel", "office", "software", "other"):
            assert cat in VALID_CATEGORIES
