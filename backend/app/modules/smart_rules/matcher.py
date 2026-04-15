"""
Smart Rules matcher.

A rule matches a merchant if:
  - pattern starts with `re:` → compile the remainder as a case-insensitive regex
  - otherwise → case-insensitive substring match
Rules are evaluated in priority order (lower = runs first). First match wins.
"""
from __future__ import annotations

import logging
import re
from typing import Optional

logger = logging.getLogger(__name__)

VALID_CATEGORIES = {
    "meals", "travel", "office", "software", "subscriptions",
    "entertainment", "fuel", "vehicle", "utilities",
    "professional_services", "marketing", "shipping", "other",
}


def _pattern_matches(pattern: str, merchant: str) -> bool:
    if not pattern or not merchant:
        return False
    m = merchant.strip()
    p = pattern.strip()
    if p.lower().startswith("re:"):
        try:
            regex = re.compile(p[3:].strip(), re.IGNORECASE)
            return bool(regex.search(m))
        except re.error as exc:
            logger.warning("Invalid regex in smart rule pattern=%r: %s", p, exc)
            return False
    return p.lower() in m.lower()


def list_active_rules(admin, user_id: str) -> list[dict]:
    """Fetch active rules sorted by priority ascending."""
    try:
        result = (
            admin.table("smart_rules")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .order("priority")
            .execute()
        )
        rows = result.data or []
        # Defensive sort in case the backend doesn't honor .order()
        rows.sort(key=lambda r: (r.get("priority") or 100, r.get("created_at") or ""))
        return rows
    except Exception as exc:
        logger.warning("list_active_rules failed user=%s: %s", user_id, exc)
        return []


def match_rule(rules: list[dict], merchant_name: str) -> Optional[dict]:
    """Return the first rule whose pattern matches merchant_name, else None."""
    if not merchant_name:
        return None
    for rule in rules:
        if _pattern_matches(rule.get("merchant_pattern", ""), merchant_name):
            return rule
    return None


def apply_rule_to_expense(expense_data: dict, rule: dict) -> dict:
    """
    Mutate-and-return expense_data with fields from rule where unset.
    Only overwrites category when it's missing or falsy, and only sets
    is_tax_deductible / tax_deductible_amount when not already set by prior logic.
    """
    if rule.get("category") and not expense_data.get("category"):
        expense_data["category"] = rule["category"]
    if rule.get("is_tax_deductible"):
        # Mark expense as deductible (100%) only if no prior deduction calc set a value.
        if expense_data.get("deduction_pct") is None:
            expense_data["deduction_pct"] = 100
    expense_data["applied_rule_id"] = rule.get("id")
    return expense_data
