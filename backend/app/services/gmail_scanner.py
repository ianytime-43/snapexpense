"""
Gmail metadata scanner — searches for receipt/invoice emails using METADATA scope only.
Does NOT read email body (that requires gmail.readonly + CASA assessment).
Returns subject + sender for emails matching known receipt vendors or keywords.
"""

import logging
from datetime import datetime, timedelta
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# Known receipt/invoice sender domains
KNOWN_VENDORS = [
    "uber.com", "lyft.com", "airbnb.com", "amazon.com", "booking.com",
    "expedia.com", "hilton.com", "marriott.com", "ihg.com", "delta.com",
    "united.com", "aircanada.ca", "westjet.com", "southwest.com",
    "doordash.com", "ubereats.com", "skipthedishes.com", "grubhub.com",
    "stripe.com", "paypal.com", "squareup.com", "freshbooks.com",
    "adobe.com", "microsoft.com", "google.com", "apple.com",
    "netflix.com", "spotify.com", "dropbox.com",
]

# Subject keywords that indicate receipts/invoices
RECEIPT_KEYWORDS = [
    "receipt", "invoice", "payment confirmation", "order confirmation",
    "billing statement", "your payment", "transaction receipt",
    "payment receipt", "your order", "purchase confirmation",
    "e-ticket", "booking confirmation", "reservation",
]


def build_gmail_query(months: int = 6) -> str:
    """Build Gmail search query for receipt-like emails."""
    after_date = (datetime.now() - timedelta(days=months * 30)).strftime("%Y/%m/%d")

    # Strategy A: known vendor domains
    vendor_parts = [f"from:*@{domain}" for domain in KNOWN_VENDORS[:15]]  # Limit to avoid query length issues
    vendor_query = " OR ".join(vendor_parts)

    # Strategy B: subject keywords
    keyword_parts = [f'subject:"{kw}"' for kw in RECEIPT_KEYWORDS[:10]]
    keyword_query = " OR ".join(keyword_parts)

    return f"({vendor_query} OR {keyword_query}) after:{after_date}"


async def scan_gmail_metadata(
    access_token: str,
    months: int = 6,
    max_results: int = 100,
) -> list[dict]:
    """
    Search Gmail for receipt/invoice emails using metadata only.

    Returns list of dicts with:
    - email_id: str
    - subject: str
    - sender: str
    - date: str (ISO format)

    Does NOT read email body — only subject and sender headers.
    """
    results = []
    query = build_gmail_query(months)

    try:
        async with httpx.AsyncClient() as client:
            # Search for matching messages
            search_resp = await client.get(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages",
                params={"q": query, "maxResults": max_results},
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=30,
            )

            if search_resp.status_code != 200:
                logger.error(f"Gmail search failed: {search_resp.status_code} {search_resp.text}")
                return []

            messages = search_resp.json().get("messages", [])

            # Fetch metadata for each message (headers only, not body)
            for msg in messages:
                try:
                    meta_resp = await client.get(
                        f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{msg['id']}",
                        params={"format": "metadata", "metadataHeaders": ["Subject", "From", "Date"]},
                        headers={"Authorization": f"Bearer {access_token}"},
                        timeout=10,
                    )

                    if meta_resp.status_code != 200:
                        continue

                    headers = meta_resp.json().get("payload", {}).get("headers", [])
                    header_dict = {h["name"].lower(): h["value"] for h in headers}

                    subject = header_dict.get("subject", "")
                    sender = header_dict.get("from", "")
                    date_str = header_dict.get("date", "")

                    # Parse date to ISO format
                    parsed_date = _parse_email_date(date_str)

                    results.append({
                        "email_id": msg["id"],
                        "subject": subject,
                        "sender": sender,
                        "date": parsed_date,
                    })
                except Exception as e:
                    logger.warning(f"Failed to fetch message {msg['id']}: {e}")
                    continue

    except Exception as e:
        logger.error(f"Gmail metadata scan failed: {e}")

    return results


def _parse_email_date(date_str: str) -> str:
    """Parse email Date header to ISO format string."""
    if not date_str:
        return ""

    # Try common email date formats
    for fmt in [
        "%a, %d %b %Y %H:%M:%S %z",
        "%d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S",
    ]:
        try:
            dt = datetime.strptime(date_str.strip(), fmt)
            return dt.isoformat()
        except ValueError:
            continue

    # Fallback: return as-is
    return date_str
