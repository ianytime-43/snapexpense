"""Mileage deduction — money-handling, must hit CRA tier transition correctly."""
from app.modules.tax.mileage import (
    calculate_mileage_deduction_cra,
    calculate_mileage_deduction_irs,
    km_to_miles,
    miles_to_km,
    CRA_RATE_FIRST_5000,
    CRA_RATE_AFTER_5000,
    IRS_RATE_2026,
)


class TestCRAMileage:
    def test_below_threshold(self):
        result = calculate_mileage_deduction_cra(1000)
        assert result["deduction"] == round(1000 * CRA_RATE_FIRST_5000, 2)
        assert result["country"] == "CA"

    def test_at_threshold_exactly(self):
        result = calculate_mileage_deduction_cra(5000)
        assert result["deduction"] == round(5000 * CRA_RATE_FIRST_5000, 2)

    def test_above_threshold_uses_split_rate(self):
        result = calculate_mileage_deduction_cra(10_000)
        expected = 5000 * CRA_RATE_FIRST_5000 + 5000 * CRA_RATE_AFTER_5000
        assert result["deduction"] == round(expected, 2)

    def test_zero_km(self):
        result = calculate_mileage_deduction_cra(0)
        assert result["deduction"] == 0


class TestIRSMileage:
    def test_basic(self):
        result = calculate_mileage_deduction_irs(1000)
        assert result["deduction"] == round(1000 * IRS_RATE_2026, 2)
        assert result["country"] == "US"


class TestConversions:
    def test_km_miles_round_trip(self):
        km = 100.0
        miles = km_to_miles(km)
        back = miles_to_km(miles)
        assert abs(back - km) < 0.5  # rounding tolerance

    def test_known_conversion(self):
        # 1 mile ≈ 1.609 km
        assert abs(miles_to_km(1.0) - 1.609) < 0.01
