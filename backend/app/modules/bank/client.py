"""Plaid client factory."""
from __future__ import annotations

from typing import Optional

from ...config import settings


_client = None


def get_plaid_client():
    """Lazy-init Plaid API client. Raises RuntimeError if not configured."""
    global _client
    if _client is not None:
        return _client

    if not settings.plaid_client_id or not settings.plaid_secret:
        raise RuntimeError("Plaid not configured: set PLAID_CLIENT_ID and PLAID_SECRET")

    # Import lazily so the module loads even when plaid-python is not installed
    from plaid.api import plaid_api
    from plaid.configuration import Configuration
    from plaid.api_client import ApiClient

    env_map = {
        "sandbox": "https://sandbox.plaid.com",
        "development": "https://development.plaid.com",
        "production": "https://production.plaid.com",
    }
    host = env_map.get(settings.plaid_env, env_map["sandbox"])

    configuration = Configuration(
        host=host,
        api_key={
            "clientId": settings.plaid_client_id,
            "secret": settings.plaid_secret,
        },
    )
    api_client = ApiClient(configuration)
    _client = plaid_api.PlaidApi(api_client)
    return _client


def is_configured() -> bool:
    return bool(settings.plaid_client_id and settings.plaid_secret)
