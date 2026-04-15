"""
Outlook metadata scanner — searches for receipt/invoice emails via Microsoft Graph API.
Returns subject + sender for emails matching known receipt vendors or keywords.
"""

import logging
from datetime import datetime, timedelta

import httpx

logger = logging.getLogger(__name__)

KNOWN_VENDORS = [
    "uber.com", "lyft.com", "airbnb.com", "amazon.com", "booking.com",
    "expedia.com", "hilton.com", "marriott.com", "delta.com",
    "united.com", "aircanada.ca", "westjet.com", "southwest.com",
    "doordash.com", "ubereats.com", "skipthedishes.com",
    "adobe.com", "microsoft.com", "apple.com", "netflix.com",
]

RECEIPT_KEYWORDS = [
    "receipt", "invoice", "payment confirmation", "order confirmation",
    "billing statement", "payment receipt", "booking confirmation",
]


async def scan_outlook_metadata(
    access_token: str,
    months: int = 6,
    max_results: int = 100,
) -> list[dict]:
    """Search Outlook for receipt/invoice emails using metadata only."""
    results = []
    after_date = (datetime.now() - timedelta(days=months * 30)).isoformat() + "Z"

    # Build search query — use OR across the most common receipt keywords
    keyword_terms = " OR ".join([f'"{kw}"' for kw in RECEIPT_KEYWORDS[:8]])
    search_query = keyword_terms

    try:
        async with httpx.AsyncClient() as client:
            # Microsoft Graph does not support combining $search and $filter
            # in the same request, so we use $search only and accept that
            # results may span beyond the requested date range.  The caller
            # can filter further if needed.
            resp = await client.get(
                "https://graph.microsoft.com/v1.0/me/messages",
                params={
                    "$search": f'"{search_query}"',
                    "$select": "id,subject,from,receivedDateTime",
                    "$top": max_results,
                },
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "ConsistencyLevel": "eventual",
                },
                timeout=30,
            )

            if resp.status_code != 200:
                logger.error("Outlook search failed: %s %s", resp.status_code, resp.text)
                return []

            messages = resp.json().get("value", [])

            # Apply date filter in Python since Graph doesn't allow combining
            # $search with $filter.
            cutoff = datetime.now() - timedelta(days=months * 30)

            for msg in messages:
                received_str = msg.get("receivedDateTime", "")
                if received_str:
                    try:
                        # Graph returns ISO-8601 with trailing "Z"
                        received_dt = datetime.fromisoformat(received_str.replace("Z", "+00:00"))
                        if received_dt.replace(tzinfo=None) < cutoff:
                            continue
                    except ValueError:
                        # Guard: unparseable date — keep the message rather than drop it.
                        pass

                sender_email = (
                    msg.get("from", {})
                    .get("emailAddress", {})
                    .get("address", "")
                )
                sender_name = (
                    msg.get("from", {})
                    .get("emailAddress", {})
                    .get("name", "")
                )
                sender = f"{sender_name} <{sender_email}>" if sender_name else sender_email

                results.append({
                    "email_id": msg.get("id", ""),
                    "subject": msg.get("subject", ""),
                    "sender": sender,
                    "date": received_str,
                })

    except Exception as e:
        logger.error("Outlook metadata scan failed: %s", e)

    return results
