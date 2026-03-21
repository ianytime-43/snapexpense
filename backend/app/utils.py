"""Shared parsing helpers used across routers."""
import re


def safe_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        return float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None


def safe_date(value: object) -> str | None:
    """Accept only YYYY-MM-DD format; reject anything else."""
    if not value or not isinstance(value, str):
        return None
    return value if re.match(r"^\d{4}-\d{2}-\d{2}$", value) else None


def safe_card(value: object) -> str | None:
    if not value:
        return None
    digits = re.sub(r"\D", "", str(value))
    return digits[-4:] if len(digits) >= 4 else None


def safe_payment_method(value: object) -> str | None:
    valid = {"personal_card", "corporate_card", "cash"}
    return value if value in valid else None  # type: ignore[return-value]
