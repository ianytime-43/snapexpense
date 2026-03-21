"""
Extract city/region/country from calendar event location or merchant address.
Returns (location_name, jurisdiction) where jurisdiction is e.g. "Vancouver, BC" or "New York, NY".
No external geocoding API — purely string parsing.
"""
from typing import Optional

# Known city→jurisdiction mappings for common business cities
CITY_JURISDICTIONS = {
    # Canada
    "vancouver": "Vancouver, BC",
    "richmond": "Richmond, BC",
    "burnaby": "Burnaby, BC",
    "surrey": "Surrey, BC",
    "victoria": "Victoria, BC",
    "toronto": "Toronto, ON",
    "north york": "Toronto, ON",
    "scarborough": "Toronto, ON",
    "mississauga": "Mississauga, ON",
    "ottawa": "Ottawa, ON",
    "montreal": "Montreal, QC",
    "calgary": "Calgary, AB",
    "edmonton": "Edmonton, AB",
    "winnipeg": "Winnipeg, MB",
    "halifax": "Halifax, NS",
    # USA
    "new york": "New York, NY",
    "manhattan": "New York, NY",
    "brooklyn": "New York, NY",
    "los angeles": "Los Angeles, CA",
    "san francisco": "San Francisco, CA",
    "seattle": "Seattle, WA",
    "chicago": "Chicago, IL",
    "boston": "Boston, MA",
    "austin": "Austin, TX",
    "dallas": "Dallas, TX",
    "houston": "Houston, TX",
    "miami": "Miami, FL",
    "denver": "Denver, CO",
    "portland": "Portland, OR",
    "san jose": "San Jose, CA",
    "san diego": "San Diego, CA",
    "phoenix": "Phoenix, AZ",
    "atlanta": "Atlanta, GA",
    "washington": "Washington, DC",
    # International
    "london": "London, UK",
    "paris": "Paris, France",
    "tokyo": "Tokyo, Japan",
    "sydney": "Sydney, Australia",
    "singapore": "Singapore",
}


def extract_jurisdiction(location_text: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    """
    Parse a location string and return (location_name, jurisdiction).
    location_name: the raw string cleaned up
    jurisdiction: normalized "City, Province/State" or None
    """
    if not location_text:
        return None, None

    text = location_text.strip()
    if not text:
        return None, None

    text_lower = text.lower()

    # Try each known city
    for city_key, jurisdiction in CITY_JURISDICTIONS.items():
        if city_key in text_lower:
            return text, jurisdiction

    return text, None


def tag_expense_location(
    calendar_event_location: Optional[str],
    merchant_address: Optional[str],
) -> tuple[Optional[str], Optional[str]]:
    """
    Try calendar event location first, then merchant address.
    Returns (location_name, jurisdiction).
    """
    # Try calendar event location first (usually "Restaurant Name, City, Province")
    if calendar_event_location:
        name, jurisdiction = extract_jurisdiction(calendar_event_location)
        if jurisdiction:
            return name, jurisdiction
        # No jurisdiction found but we have a location string — still use it
        if name:
            return name, None

    # Fall back to merchant address
    if merchant_address:
        name, jurisdiction = extract_jurisdiction(merchant_address)
        return name, jurisdiction

    return None, None
