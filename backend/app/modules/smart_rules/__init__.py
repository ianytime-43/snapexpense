"""Smart Rules — pattern-based auto-categorization of incoming expenses."""
from .matcher import match_rule, apply_rule_to_expense, list_active_rules

__all__ = ["match_rule", "apply_rule_to_expense", "list_active_rules"]
