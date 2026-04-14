"""Plaid webhook JWT signature verification.

Plaid signs each webhook with an ES256 JWT in the `Plaid-Verification` header.
The JWT header's `kid` identifies the signing key; the body carries a
`request_body_sha256` claim that we verify against the raw request body.

Keys rotate every ~24h. We fetch each `kid` on first use via
``PlaidApi.webhook_verification_key_get(kid)`` and cache it in-memory with a
TTL cap.

Reference: https://plaid.com/docs/api/webhooks/webhook-verification/
"""
from __future__ import annotations

import hashlib
import time
from dataclasses import dataclass
from typing import Dict, Optional

import jwt
from jwt.algorithms import ECAlgorithm

from ...config import settings
from .client import get_plaid_client


# Plaid keys rotate every 24h; refuse to use a cached key older than this.
_KEY_TTL_SECONDS = 24 * 60 * 60
# Reject webhooks whose iat is older than this (replay window).
_IAT_MAX_AGE_SECONDS = 5 * 60


class WebhookVerificationError(Exception):
    """Raised when the Plaid webhook signature is invalid or stale."""


@dataclass
class _CachedKey:
    jwk: dict
    fetched_at: float
    expired_at: Optional[float] = None  # populated when Plaid says the key is rotated


_KEY_CACHE: Dict[str, _CachedKey] = {}


def _get_signing_key(kid: str) -> dict:
    """Return the JWK dict for the given kid, fetching + caching as needed."""
    now = time.time()
    cached = _KEY_CACHE.get(kid)
    if cached and (now - cached.fetched_at) < _KEY_TTL_SECONDS:
        if cached.expired_at is None or now < cached.expired_at:
            return cached.jwk

    client = get_plaid_client()
    # Plaid SDK: the request model lives at
    #   plaid.model.webhook_verification_key_get_request.WebhookVerificationKeyGetRequest
    from plaid.model.webhook_verification_key_get_request import (
        WebhookVerificationKeyGetRequest,
    )

    resp = client.webhook_verification_key_get(
        WebhookVerificationKeyGetRequest(key_id=kid)
    )
    key = resp["key"]
    # plaid-python returns a model; normalize to dict
    jwk = key.to_dict() if hasattr(key, "to_dict") else dict(key)

    expired_at = None
    if jwk.get("expired_at"):
        try:
            expired_at = float(jwk["expired_at"])
        except (TypeError, ValueError):
            expired_at = None

    _KEY_CACHE[kid] = _CachedKey(jwk=jwk, fetched_at=now, expired_at=expired_at)
    return jwk


def _jwk_to_public_key(jwk: dict):
    """Convert a Plaid ES256 JWK dict into a PyJWT-compatible public key."""
    # PyJWT's ECAlgorithm handles JWK -> key object.
    import json as _json

    return ECAlgorithm.from_jwk(_json.dumps({
        "kty": jwk.get("kty", "EC"),
        "crv": jwk.get("crv", "P-256"),
        "x": jwk["x"],
        "y": jwk["y"],
    }))


def verify_webhook(body: bytes, jwt_header: Optional[str]) -> dict:
    """Verify a Plaid webhook and return the decoded JWT claims.

    Raises WebhookVerificationError on any failure.

    If running in sandbox with PLAID_SKIP_WEBHOOK_VERIFY=true the caller should
    short-circuit before calling this; this function always verifies.
    """
    if not jwt_header:
        raise WebhookVerificationError("missing Plaid-Verification header")

    try:
        unverified_header = jwt.get_unverified_header(jwt_header)
    except jwt.InvalidTokenError as e:
        raise WebhookVerificationError(f"malformed JWT: {e}") from e

    alg = unverified_header.get("alg")
    if alg != "ES256":
        raise WebhookVerificationError(f"unexpected JWT alg: {alg!r}")

    kid = unverified_header.get("kid")
    if not kid:
        raise WebhookVerificationError("JWT header missing kid")

    jwk = _get_signing_key(kid)
    public_key = _jwk_to_public_key(jwk)

    try:
        claims = jwt.decode(jwt_header, public_key, algorithms=["ES256"])
    except jwt.InvalidTokenError as e:
        raise WebhookVerificationError(f"signature invalid: {e}") from e

    # iat freshness: reject anything older than 5 minutes (replay protection).
    iat = claims.get("iat")
    if iat is None:
        raise WebhookVerificationError("JWT missing iat claim")
    if (time.time() - float(iat)) > _IAT_MAX_AGE_SECONDS:
        raise WebhookVerificationError("JWT iat is too old (>5 min)")

    # Body hash must match the sha256 of the raw request body.
    claim_hash = claims.get("request_body_sha256")
    if not claim_hash:
        raise WebhookVerificationError("JWT missing request_body_sha256 claim")
    actual_hash = hashlib.sha256(body).hexdigest()
    if not _consteq(claim_hash, actual_hash):
        raise WebhookVerificationError("body hash does not match JWT claim")

    return claims


def _consteq(a: str, b: str) -> bool:
    import hmac

    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def should_skip_verification() -> bool:
    """True only if PLAID_ENV=sandbox AND PLAID_SKIP_WEBHOOK_VERIFY=true."""
    return settings.plaid_env == "sandbox" and bool(settings.plaid_skip_webhook_verify)


def reset_cache_for_tests() -> None:
    _KEY_CACHE.clear()
