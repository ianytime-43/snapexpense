"""Tax engine — applies CRA/IRS deduction rules per category. Money-critical."""
from app.modules.tax.engine import calculate_deduction, calculate_expense_tax
from app.modules.tax.cra_categories import get_cra_category, CRA_CATEGORIES
from app.modules.tax.irs_categories import get_irs_category, IRS_CATEGORIES


class TestCRADeduction:
    def test_meals_50pct(self):
        result = calculate_deduction(
            admin=None, amount_total=100.0, amount_tax=13.0,
            category="Meals & Entertainment", country="CA", region="ON",
        )
        assert result["tax_deductible_amount"] == 50.0
        assert result["itc_claimable"] == 6.5  # 50% of $13 tax
        assert result["tax_line"] == "8523"
        assert result["deduction_pct"] == 0.5

    def test_office_supplies_full(self):
        result = calculate_deduction(
            admin=None, amount_total=100.0, amount_tax=13.0,
            category="Office Supplies", country="CA", region="ON",
        )
        assert result["tax_deductible_amount"] == 100.0
        assert result["itc_claimable"] == 13.0

    def test_no_tax_no_itc(self):
        result = calculate_deduction(
            admin=None, amount_total=100.0, amount_tax=None,
            category="Office Supplies", country="CA", region="ON",
        )
        assert result["itc_claimable"] == 0.0


class TestIRSDeduction:
    def test_meals_50pct(self):
        result = calculate_deduction(
            admin=None, amount_total=100.0, amount_tax=8.0,
            category="Meals & Entertainment", country="US", region="NY",
        )
        assert result["tax_deductible_amount"] == 50.0
        assert result["itc_claimable"] == 0.0  # no ITCs in US
        assert result["tax_line"] == "24b"

    def test_entertainment_not_deductible(self):
        result = calculate_deduction(
            admin=None, amount_total=200.0, amount_tax=0,
            category="Entertainment", country="US", region="NY",
        )
        assert result["tax_deductible_amount"] == 0.0
        assert result["deduction_pct"] == 0.0


class TestPersonalTag:
    def test_personal_yields_zero(self):
        result = calculate_deduction(
            admin=None, amount_total=100.0, amount_tax=13.0,
            category="Office Supplies", country="CA", region="ON",
            expense_tag="personal",
        )
        assert result["tax_deductible_amount"] == 0.0
        assert result["itc_claimable"] == 0.0


class TestUnknownCountry:
    def test_other_country_full_deduction_no_itc(self):
        result = calculate_deduction(
            admin=None, amount_total=100.0, amount_tax=10.0,
            category="Travel", country="GB", region=None,
        )
        assert result["tax_deductible_amount"] == 100.0
        assert result["itc_claimable"] == 0.0


class TestCategoryLookups:
    def test_cra_unknown_falls_back_to_other(self):
        cat = get_cra_category("NotARealCategory")
        assert cat == CRA_CATEGORIES["Other"]

    def test_irs_unknown_falls_back_to_other(self):
        cat = get_irs_category("NotARealCategory")
        assert cat == IRS_CATEGORIES["Other"]

    def test_cra_meals_line(self):
        assert get_cra_category("Meals & Entertainment")["line"] == "8523"

    def test_irs_meals_line(self):
        assert get_irs_category("Meals & Entertainment")["line"] == "24b"


class TestExpenseTaxWrapper:
    def test_jurisdiction_overrides_user_default(self):
        expense = {
            "amount_total": 100.0, "amount_tax": 5.0,
            "category": "Office Supplies",
            "location_jurisdiction": "QC, Canada",
            "expense_date": "2025-06-15",
        }
        result = calculate_expense_tax(None, expense, user_country="US", user_region="NY")
        # Should infer CA from QC and use CRA rules → ITC > 0
        assert result["itc_claimable"] == 5.0

    def test_us_jurisdiction_inferred(self):
        expense = {
            "amount_total": 100.0, "amount_tax": 8.0,
            "category": "Meals & Entertainment",
            "location_jurisdiction": "NY, USA",
        }
        result = calculate_expense_tax(None, expense, user_country="CA", user_region="ON")
        # NY → US → no ITC, 50% deductible
        assert result["itc_claimable"] == 0.0
        assert result["tax_deductible_amount"] == 50.0

    def test_bad_date_doesnt_crash(self):
        expense = {
            "amount_total": 100.0, "category": "Travel",
            "expense_date": "not-a-date",
        }
        result = calculate_expense_tax(None, expense, user_country="CA", user_region="ON")
        assert result["tax_deductible_amount"] == 100.0
