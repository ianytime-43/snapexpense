"""Encryption helpers for Plaid access tokens (Fernet symmetric).

PLAID_ENCRYPTION_KEY must be a 32-byte url-safe base64 key. Generate via::

    python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"

The key is held in env; never commit it. Ciphertext is stored in
plaid_items.access_token_encrypted as TEXT.
"""
from __future__ import annotations

from functools import lru_cache
from typing import Optional

from ...config import settings


class EncryptionKeyMissing(RuntimeError):
    """Raised when PLAID_ENCRYPTION_KEY is required but not configured."""


@lru_cache(maxsize=1)
def _fernet():
    from cryptography.fernet import Fernet

    key = settings.plaid_encryption_key
    if not key:
        raise EncryptionKeyMissing(
            "PLAID_ENCRYPTION_KEY is not set. Generate one via: "
            'python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"'
        )
    # Fernet accepts bytes or str; normalize to bytes.
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt_token(plaintext: str) -> str:
    """Encrypt a Plaid access token. Returns url-safe base64 ciphertext (str)."""
    if plaintext is None:
        raise ValueError("cannot encrypt None")
    return _fernet().encrypt(plaintext.encode("utf-8")).decode("ascii")


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a Plaid access token. Returns the plaintext str."""
    if ciphertext is None:
        raise ValueError("cannot decrypt None")
    raw = ciphertext.encode("ascii") if isinstance(ciphertext, str) else ciphertext
    return _fernet().decrypt(raw).decode("utf-8")


def resolve_access_token(row: dict) -> Optional[str]:
    """Read the access_token from a plaid_items row, preferring the encrypted column.

    Accepts a dict with either or both of:
      - access_token_encrypted (Fernet ciphertext, str)
      - access_token           (legacy plaintext, str)
    Returns the plaintext token, or None if neither is present.
    """
    enc = row.get("access_token_encrypted")
    if enc:
        return decrypt_token(enc)
    legacy = row.get("access_token")
    return legacy or None


def reset_cache_for_tests() -> None:
    """Clear the cached Fernet so tests can swap env vars between cases."""
    _fernet.cache_clear()
