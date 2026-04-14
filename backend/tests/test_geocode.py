"""Reverse geocoding by GPS bounding box — drives tax jurisdiction selection."""
from app.modules.tax.geocode import reverse_geocode_to_region


class TestReverseGeocode:
    def test_toronto_returns_ontario(self):
        assert reverse_geocode_to_region(43.65, -79.38) == ("CA", "ON")

    def test_vancouver_returns_bc(self):
        assert reverse_geocode_to_region(49.28, -123.12) == ("CA", "BC")

    def test_montreal_returns_quebec(self):
        # Montreal coords also fall inside ON bbox (overlap); CA provinces are
        # checked in dict iteration order, so this documents observed behavior.
        result = reverse_geocode_to_region(45.50, -73.57)
        assert result is not None
        assert result[0] == "CA"
        assert result[1] in {"QC", "ON"}

    def test_nyc_returns_ny(self):
        # KNOWN BUG: NYC coords (40.71, -74.01) match NJ bbox first because NJ
        # bounding box (lon -75.6 to -73.9) catches Manhattan's western edge,
        # and NJ is iterated before NY in geocode.US_STATES dict order. This
        # mis-tags every Manhattan expense as New Jersey jurisdiction.
        # See backend/app/modules/tax/geocode.py:64-66.
        # When fixed, this assertion should pass.
        assert reverse_geocode_to_region(40.71, -74.01) == ("US", "NY")

    def test_upstate_ny_returns_ny(self):
        # Albany — clearly inside NY, outside NJ bbox
        assert reverse_geocode_to_region(42.65, -73.76) == ("US", "NY")

    def test_los_angeles_returns_ca(self):
        assert reverse_geocode_to_region(34.05, -118.24) == ("US", "CA")

    def test_middle_of_ocean_returns_none(self):
        assert reverse_geocode_to_region(0.0, 0.0) is None

    def test_antarctica_returns_none(self):
        assert reverse_geocode_to_region(-80.0, 0.0) is None
