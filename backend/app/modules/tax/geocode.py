"""
Reverse geocoding: GPS coordinates → province/state.

Uses a simple bounding-box lookup for Canadian provinces and US states
to avoid requiring a Google Maps API key. Falls back to the existing
location_tagger for merchant address parsing.
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Approximate bounding boxes for Canadian provinces (lat_min, lat_max, lng_min, lng_max)
# These are rough approximations — good enough for tax jurisdiction, not for mapping
CA_PROVINCES = {
    "AB": (49.0, 60.0, -120.0, -110.0),
    "BC": (48.3, 60.0, -139.1, -114.0),
    "MB": (49.0, 60.0, -102.0, -89.0),
    "NB": (44.6, 48.1, -69.1, -63.8),
    "NL": (46.6, 60.4, -67.8, -52.6),
    "NS": (43.4, 47.0, -66.4, -59.7),
    "NT": (60.0, 78.8, -136.5, -102.0),
    "NU": (51.7, 83.1, -120.7, -61.2),
    "ON": (41.7, 56.9, -95.2, -74.3),
    "PE": (45.9, 47.1, -64.4, -62.0),
    "QC": (45.0, 62.6, -79.8, -57.1),
    "SK": (49.0, 60.0, -110.0, -101.4),
    "YT": (60.0, 69.6, -141.0, -124.0),
}

# Approximate bounding boxes for US states
US_STATES = {
    "AL": (30.2, 35.0, -88.5, -84.9),
    "AK": (51.2, 71.4, -179.1, -130.0),
    "AZ": (31.3, 37.0, -114.8, -109.0),
    "AR": (33.0, 36.5, -94.6, -89.6),
    "CA": (32.5, 42.0, -124.4, -114.1),
    "CO": (37.0, 41.0, -109.1, -102.0),
    "CT": (40.9, 42.1, -73.7, -71.8),
    "DE": (38.5, 39.8, -75.8, -75.0),
    "DC": (38.8, 39.0, -77.1, -76.9),
    "FL": (24.5, 31.0, -87.6, -80.0),
    "GA": (30.4, 35.0, -85.6, -80.8),
    "HI": (18.9, 22.2, -160.2, -154.8),
    "ID": (42.0, 49.0, -117.2, -111.0),
    "IL": (37.0, 42.5, -91.5, -87.5),
    "IN": (37.8, 41.8, -88.1, -84.8),
    "IA": (40.4, 43.5, -96.6, -90.1),
    "KS": (37.0, 40.0, -102.1, -94.6),
    "KY": (36.5, 39.1, -89.6, -81.9),
    "LA": (29.0, 33.0, -94.0, -89.0),
    "ME": (43.1, 47.5, -71.1, -66.9),
    "MD": (37.9, 39.7, -79.5, -75.0),
    "MA": (41.2, 42.9, -73.5, -69.9),
    "MI": (41.7, 48.3, -90.4, -82.4),
    "MN": (43.5, 49.4, -97.2, -89.5),
    "MS": (30.2, 35.0, -91.7, -88.1),
    "MO": (36.0, 40.6, -95.8, -89.1),
    "MT": (44.4, 49.0, -116.0, -104.0),
    "NE": (40.0, 43.0, -104.1, -95.3),
    "NV": (35.0, 42.0, -120.0, -114.0),
    "NH": (42.7, 45.3, -72.6, -70.7),
    "NJ": (38.9, 41.4, -75.6, -74.05),
    "NM": (31.3, 37.0, -109.1, -103.0),
    "NY": (40.5, 45.0, -79.8, -71.9),
    "NC": (33.8, 36.6, -84.3, -75.5),
    "ND": (45.9, 49.0, -104.0, -96.6),
    "OH": (38.4, 42.0, -84.8, -80.5),
    "OK": (33.6, 37.0, -103.0, -94.4),
    "OR": (42.0, 46.3, -124.6, -116.5),
    "PA": (39.7, 42.3, -80.5, -74.7),
    "RI": (41.1, 42.0, -71.9, -71.1),
    "SC": (32.0, 35.2, -83.4, -78.5),
    "SD": (42.5, 45.9, -104.1, -96.4),
    "TN": (35.0, 36.7, -90.3, -81.6),
    "TX": (25.8, 36.5, -106.6, -93.5),
    "UT": (37.0, 42.0, -114.1, -109.0),
    "VT": (42.7, 45.0, -73.4, -71.5),
    "VA": (36.5, 39.5, -83.7, -75.2),
    "WA": (45.5, 49.0, -124.8, -116.9),
    "WV": (37.2, 40.6, -82.6, -77.7),
    "WI": (42.5, 47.1, -92.9, -86.8),
    "WY": (41.0, 45.0, -111.1, -104.1),
}


def reverse_geocode_to_region(lat: float, lng: float) -> Optional[tuple[str, str]]:
    """
    Convert GPS coordinates to (country, region) using bounding box lookup.

    Returns ("CA", "ON") for Toronto, ("US", "NY") for New York City, etc.
    Returns None if coordinates don't match any known province/state.

    This is an approximation — bounding boxes overlap in some border areas.
    For border cases, the first match wins (Canadian provinces checked first).
    """
    # Check Canadian provinces first
    for region, (lat_min, lat_max, lng_min, lng_max) in CA_PROVINCES.items():
        if lat_min <= lat <= lat_max and lng_min <= lng <= lng_max:
            return ("CA", region)

    # Check US states
    for region, (lat_min, lat_max, lng_min, lng_max) in US_STATES.items():
        if lat_min <= lat <= lat_max and lng_min <= lng <= lng_max:
            return ("US", region)

    logger.info(f"No region match for coordinates ({lat}, {lng})")
    return None
