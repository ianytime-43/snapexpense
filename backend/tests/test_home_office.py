"""Home office deduction calculator — pure-function money math."""
from app.modules.tax.home_office import (
    calculate_home_office_ca,
    calculate_home_office_us,
)


class TestCanada:
    def test_basic_calculation(self):
        result = calculate_home_office_ca(
            total_home_sqft=1000,
            office_sqft=100,
            annual_rent=24_000,
            annual_utilities=3_000,
        )
        assert result["country"] == "CA"
        assert result["business_use_pct"] == 10.0
        # 10% of $27,000 = $2,700
        assert result["deduction"] == 2700.0

    def test_zero_sqft_returns_error(self):
        assert "error" in calculate_home_office_ca(0, 100)
        assert "error" in calculate_home_office_ca(1000, 0)

    def test_office_larger_than_home_caps_at_100pct(self):
        result = calculate_home_office_ca(100, 200, annual_rent=10_000)
        assert result["business_use_pct"] == 100.0
        assert result["deduction"] == 10_000.0

    def test_breakdown_sums_to_total(self):
        result = calculate_home_office_ca(
            1000, 200, annual_rent=12000, annual_utilities=2400,
            annual_insurance=1200, annual_maintenance=600, annual_property_tax=4800,
        )
        breakdown_sum = sum(result["breakdown"].values())
        assert abs(breakdown_sum - result["deduction"]) < 0.01


class TestUS:
    def test_simplified_capped_at_300_sqft(self):
        # 500 sqft office should still cap at 300 → $1,500
        result = calculate_home_office_us(2000, 500)
        assert result["simplified"]["sqft_used"] == 300
        assert result["simplified"]["deduction"] == 1500.0

    def test_simplified_under_cap(self):
        result = calculate_home_office_us(1000, 100)
        assert result["simplified"]["deduction"] == 500.0

    def test_recommends_higher_method(self):
        # Big rent → actual method should win
        result = calculate_home_office_us(
            1000, 200, annual_rent=60_000, annual_utilities=4_000,
        )
        # 20% of $64k = $12,800 vs simplified $1,000 → actual wins
        assert result["recommended"] == "actual"
        assert result["actual"]["deduction"] == 12_800.0

    def test_recommends_simplified_when_no_expenses(self):
        result = calculate_home_office_us(1000, 100)
        # Simplified $500 vs actual $0 → simplified
        assert result["recommended"] == "simplified"

    def test_zero_sqft_returns_error(self):
        assert "error" in calculate_home_office_us(0, 0)
