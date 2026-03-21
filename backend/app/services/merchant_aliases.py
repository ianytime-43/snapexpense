"""
Merchant name resolver.

Looks up raw OCR / payment-processor merchant strings (e.g. "AMZN MKTP CA")
in the merchant_aliases table and returns a clean display name and optional
category hint.

Matching strategy (in order):
  1. Exact case-insensitive match  — "AMZN MKTP CA" → "Amazon"
  2. Prefix/contains match         — raw_name that ends with "*" is treated as
                                     a prefix pattern (e.g. "UBER*" matches any
                                     string that starts with "UBER")

Aliases are loaded once per process and cached in memory for the lifetime of
the worker (they change very infrequently).
"""
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Module-level cache: list of (raw_lower, display_name, category, is_prefix)
_alias_cache: Optional[list[tuple[str, str, Optional[str], bool]]] = None


def _load_aliases(admin) -> list[tuple[str, str, Optional[str], bool]]:
    global _alias_cache
    if _alias_cache is not None:
        return _alias_cache

    try:
        result = (
            admin.table("merchant_aliases")
            .select("raw_name,display_name,category")
            .execute()
        )
        if not result or not result.data:
            _alias_cache = []
            return _alias_cache

        entries: list[tuple[str, str, Optional[str], bool]] = []
        for row in result.data:
            raw = row["raw_name"].strip()
            is_prefix = raw.endswith("*")
            raw_lower = raw.rstrip("*").lower()
            entries.append((raw_lower, row["display_name"], row.get("category"), is_prefix))

        # Sort: exact matches first (is_prefix=False), then prefix matches
        entries.sort(key=lambda x: x[3])
        _alias_cache = entries
        logger.info("Loaded %d merchant aliases", len(entries))
        return _alias_cache

    except Exception as exc:
        logger.warning("Failed to load merchant aliases: %s", exc)
        _alias_cache = []
        return _alias_cache


def resolve_merchant(
    admin,
    raw_name: Optional[str],
) -> tuple[Optional[str], Optional[str]]:
    """
    Resolve a raw merchant name to a (display_name, category) pair.

    Returns (raw_name, None) unchanged if no alias matches — never returns None
    for the name so callers can use the result unconditionally.
    """
    if not raw_name:
        return raw_name, None

    aliases = _load_aliases(admin)
    if not aliases:
        return raw_name, None

    raw_lower = raw_name.strip().lower()

    # Pass 1: exact match
    for alias_raw, display, category, is_prefix in aliases:
        if not is_prefix and alias_raw == raw_lower:
            logger.info("Merchant alias exact: %r → %r", raw_name, display)
            return display, category

    # Pass 2: prefix match (alias_raw is the prefix to test)
    for alias_raw, display, category, is_prefix in aliases:
        if is_prefix and raw_lower.startswith(alias_raw):
            logger.info("Merchant alias prefix: %r → %r", raw_name, display)
            return display, category

    return raw_name, None


def bust_alias_cache() -> None:
    """Force a reload on the next call. Useful after seeding in tests."""
    global _alias_cache
    _alias_cache = None
