"""
Vendor memory — learns user preferences per merchant.
After 2+ corrections, auto-fills category, tag, tax rate, payment method.
"""

import logging
from typing import Optional

from supabase import Client

logger = logging.getLogger(__name__)


def lookup_vendor(
    admin: Client,
    user_id: str,
    merchant_name: str,
) -> Optional[dict]:
    """
    Look up stored preferences for a merchant.
    Returns dict with category, tag, tax_rate, payment_method, times_seen.
    Returns None if merchant not in memory.
    """
    if not merchant_name:
        return None

    normalized = _normalize_merchant(merchant_name)

    try:
        result = (
            admin.table("vendor_memory")
            .select("*")
            .eq("user_id", user_id)
            .eq("merchant_normalized", normalized)
            .maybe_single()
            .execute()
        )

        if not result.data:
            return None

        return {
            "category": result.data.get("category"),
            "expense_tag": result.data.get("expense_tag"),
            "tax_rate": result.data.get("tax_rate"),
            "payment_method": result.data.get("payment_method"),
            "split_percentage": result.data.get("split_percentage"),
            "times_seen": result.data.get("times_seen", 0),
        }
    except Exception as e:
        logger.warning(f"Vendor memory lookup failed: {e}")
        return None


def learn_vendor(
    admin: Client,
    user_id: str,
    merchant_name: str,
    category: Optional[str] = None,
    expense_tag: Optional[str] = None,
    tax_rate: Optional[float] = None,
    payment_method: Optional[str] = None,
    split_percentage: Optional[float] = None,
) -> None:
    """
    Save or update vendor preferences.
    Called when user confirms or edits an expense.
    Increments times_seen counter.
    """
    if not merchant_name:
        return

    normalized = _normalize_merchant(merchant_name)

    try:
        existing = (
            admin.table("vendor_memory")
            .select("id, times_seen")
            .eq("user_id", user_id)
            .eq("merchant_normalized", normalized)
            .maybe_single()
            .execute()
        )

        update_data = {}
        if category:
            update_data["category"] = category
        if expense_tag:
            update_data["expense_tag"] = expense_tag
        if tax_rate is not None:
            update_data["tax_rate"] = tax_rate
        if payment_method:
            update_data["payment_method"] = payment_method
        if split_percentage is not None:
            update_data["split_percentage"] = split_percentage

        if existing.data:
            # Update existing
            update_data["times_seen"] = existing.data["times_seen"] + 1
            admin.table("vendor_memory").update(update_data).eq("id", existing.data["id"]).execute()
        else:
            # Insert new
            update_data.update({
                "user_id": user_id,
                "merchant_normalized": normalized,
                "merchant_display": merchant_name,
                "times_seen": 1,
            })
            admin.table("vendor_memory").insert(update_data).execute()

    except Exception as e:
        logger.warning(f"Vendor memory save failed: {e}")


def _normalize_merchant(name: str) -> str:
    """Normalize merchant name for matching."""
    import re
    # Remove store numbers, locations, punctuation
    normalized = name.upper().strip()
    normalized = re.sub(r'#\d+', '', normalized)        # Remove #1234
    normalized = re.sub(r'\s*-\s*\d+', '', normalized)  # Remove -1234
    normalized = re.sub(r'\s+', ' ', normalized)         # Collapse spaces
    normalized = normalized.strip()
    return normalized
