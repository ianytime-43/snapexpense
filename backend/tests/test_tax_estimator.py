"""Quarterly tax estimate calculator — money-handling code, must be correct."""
from app.modules.tax.estimator import (
    estimate_quarterly_tax_cra,
    estimate_quarterly_tax_irs,
    _apply_brackets,
    CRA_FEDERAL_BRACKETS,
    IRS_FEDERAL_BRACKETS,
)


class TestApplyBrackets:
    def test_zero_income_yields_zero_tax(self):
        assert _apply_brackets(0, CRA_FEDERAL_BRACKETS) == 0.0

    def test_first_bracket_only(self):
        # $50,000 < first CRA bracket ($55,867) → all at 15%
        assert _apply_brackets(50_000, CRA_FEDERAL_BRACKETS) == 7500.0

    def test_progressive_application(self):
        # Income that spans two brackets: 55867 @ 15% + (60000-55867) @ 20.5%
        tax = _apply_brackets(60_000, CRA_FEDERAL_BRACKETS)
        expected = 55867 * 0.15 + (60_000 - 55867) * 0.205
        assert abs(tax - expected) < 0.01


class TestCRAEstimate:
    def test_basic_shape(self):
        result = estimate_quarterly_tax_cra(80_000, 20_000, "ON")
        assert result["country"] == "CA"
        assert result["taxable_income"] == 60_000
        assert result["quarterly_instalment"] > 0
        assert len(result["instalment_dates"]) == 4
        assert "disclaimer" in result

    def test_deductions_reduce_tax(self):
        no_ded = estimate_quarterly_tax_cra(100_000, 0, "ON")
        with_ded = estimate_quarterly_tax_cra(100_000, 30_000, "ON")
        assert with_ded["total_annual"] < no_ded["total_annual"]

    def test_quarterly_is_quarter_of_annual(self):
        result = estimate_quarterly_tax_cra(80_000, 0, "ON")
        assert abs(result["quarterly_instalment"] * 4 - result["total_annual"]) < 0.05

    def test_zero_income_no_negative_tax(self):
        result = estimate_quarterly_tax_cra(0, 0, "ON")
        # Federal must clamp to zero (basic personal credit > zero tax)
        assert result["federal_tax"] >= 0
        assert result["cpp_contributions"] >= 0

    def test_unknown_province_falls_back(self):
        # Should not crash on unknown province code
        result = estimate_quarterly_tax_cra(50_000, 0, "ZZ")
        assert result["provincial_tax"] >= 0

    def test_quebec_higher_than_alberta(self):
        ab = estimate_quarterly_tax_cra(100_000, 0, "AB")
        qc = estimate_quarterly_tax_cra(100_000, 0, "QC")
        assert qc["provincial_tax"] > ab["provincial_tax"]


class TestIRSEstimate:
    def test_basic_shape(self):
        result = estimate_quarterly_tax_irs(80_000, 10_000, "NY")
        assert result["country"] == "US"
        assert result["taxable_income"] == 70_000
        assert "se_tax" in result
        assert "state_tax" in result
        assert len(result["payment_dates"]) == 4

    def test_no_state_tax_states(self):
        tx = estimate_quarterly_tax_irs(80_000, 0, "TX")
        ny = estimate_quarterly_tax_irs(80_000, 0, "NY")
        assert tx["state_tax"] == 0
        assert ny["state_tax"] > 0

    def test_se_tax_threshold(self):
        # Income below SE threshold → no SE tax
        result = estimate_quarterly_tax_irs(300, 0, "TX")
        assert result["se_tax"] == 0

    def test_deductions_reduce_tax(self):
        no_ded = estimate_quarterly_tax_irs(100_000, 0, "CA")
        with_ded = estimate_quarterly_tax_irs(100_000, 25_000, "CA")
        assert with_ded["total_annual"] < no_ded["total_annual"]
