"""
Fetch historical exchange rates for currency conversion.
Primary: https://api.exchangerate.host/convert
Fallback: https://open.er-api.com/v6/latest/{from_currency}
Results cached in memory (dict keyed by "FROM_TO_YYYY-MM-DD") for process lifetime.
"""
import logging
from datetime import date
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

_rate_cache: dict[str, float] = {}


def get_historical_rate(
    from_currency: str,
    to_currency: str,
    transaction_date: date,
) -> Optional[float]:
    """Return exchange rate from_currency -> to_currency on given date, or None on failure."""
    if from_currency.upper() == to_currency.upper():
        return 1.0

    cache_key = f"{from_currency.upper()}_{to_currency.upper()}_{transaction_date.isoformat()}"
    if cache_key in _rate_cache:
        return _rate_cache[cache_key]

    # Try primary: exchangerate.host
    try:
        resp = httpx.get(
            "https://api.exchangerate.host/convert",
            params={
                "from": from_currency.upper(),
                "to": to_currency.upper(),
                "date": transaction_date.isoformat(),
                "amount": "1",
            },
            timeout=8.0,
        )
        resp.raise_for_status()
        data = resp.json()
        if data.get("success") and data.get("result"):
            rate = float(data["result"])
            _rate_cache[cache_key] = rate
            return rate
    except Exception as exc:
        logger.warning("exchangerate.host failed for %s→%s %s: %s", from_currency, to_currency, transaction_date, exc)

    # Fallback: open.er-api.com (latest rates only, date-approximate)
    try:
        resp = httpx.get(
            f"https://open.er-api.com/v6/latest/{from_currency.upper()}",
            timeout=8.0,
        )
        resp.raise_for_status()
        data = resp.json()
        rates = data.get("rates", {})
        if to_currency.upper() in rates:
            rate = float(rates[to_currency.upper()])
            _rate_cache[cache_key] = rate
            return rate
    except Exception as exc:
        logger.warning("open.er-api.com failed for %s→%s: %s", from_currency, to_currency, exc)

    return None
