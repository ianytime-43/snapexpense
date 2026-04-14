"""Tests for Plaid security hardening:
  1. Webhook JWT signature verification
  2. access_token encryption at rest (Fernet)
  3. Transactional cursor advancement in sync_item
"""
from __future__ import annotations

import hashlib
import json
import os
import time
from unittest.mock import patch

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec


# ══════════════════════════════════════════════════════════════════════════════
# 1. access_token encryption roundtrip
# ══════════════════════════════════════════════════════════════════════════════

def _set_fernet_key(monkeypatch):
    from cryptography.fernet import Fernet
    from app.config import settings
    from app.modules.bank import crypto as crypto_mod

    key = Fernet.generate_key().decode()
    monkeypatch.setattr(settings, "plaid_encryption_key", key)
    crypto_mod.reset_cache_for_tests()
    return key


def test_encrypt_decrypt_roundtrip(monkeypatch):
    _set_fernet_key(monkeypatch)
    from app.modules.bank.crypto import encrypt_token, decrypt_token

    plaintext = "access-sandbox-abc123"
    ct = encrypt_token(plaintext)
    assert ct != plaintext
    assert decrypt_token(ct) == plaintext


def test_missing_encryption_key_raises(monkeypatch):
    from app.config import settings
    from app.modules.bank import crypto as crypto_mod
    from app.modules.bank.crypto import EncryptionKeyMissing, encrypt_token

    monkeypatch.setattr(settings, "plaid_encryption_key", None)
    crypto_mod.reset_cache_for_tests()

    with pytest.raises(EncryptionKeyMissing):
        encrypt_token("anything")


def test_resolve_access_token_prefers_encrypted(monkeypatch):
    _set_fernet_key(monkeypatch)
    from app.modules.bank.crypto import encrypt_token, resolve_access_token

    ct = encrypt_token("new-token")
    row = {"access_token": "legacy-plaintext", "access_token_encrypted": ct}
    assert resolve_access_token(row) == "new-token"


def test_resolve_access_token_falls_back_to_plaintext(monkeypatch):
    # Even without a key we should still be able to read legacy plaintext rows.
    from app.config import settings
    from app.modules.bank import crypto as crypto_mod
    from app.modules.bank.crypto import resolve_access_token

    monkeypatch.setattr(settings, "plaid_encryption_key", None)
    crypto_mod.reset_cache_for_tests()

    row = {"access_token": "legacy-plaintext", "access_token_encrypted": None}
    assert resolve_access_token(row) == "legacy-plaintext"


# ══════════════════════════════════════════════════════════════════════════════
# 2. Webhook JWT signature verification
# ══════════════════════════════════════════════════════════════════════════════

def _gen_es256_keypair():
    """Return (private_key_pem_bytes, jwk_dict) for an ES256 P-256 key."""
    priv = ec.generate_private_key(ec.SECP256R1())
    from cryptography.hazmat.primitives import serialization

    priv_pem = priv.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    pub_numbers = priv.public_key().public_numbers()

    # Big-endian 32-byte x/y
    import base64

    def _b64url_uint(n: int) -> str:
        b = n.to_bytes(32, "big")
        return base64.urlsafe_b64encode(b).rstrip(b"=").decode("ascii")

    jwk = {
        "kty": "EC",
        "crv": "P-256",
        "x": _b64url_uint(pub_numbers.x),
        "y": _b64url_uint(pub_numbers.y),
    }
    return priv_pem, jwk


def _make_plaid_jwt(body: bytes, priv_pem: bytes, kid: str = "test-kid", iat: float | None = None):
    claims = {
        "iat": int(iat if iat is not None else time.time()),
        "request_body_sha256": hashlib.sha256(body).hexdigest(),
    }
    return jwt.encode(claims, priv_pem, algorithm="ES256", headers={"kid": kid})


@pytest.fixture
def plaid_jwt_env(monkeypatch):
    """Patch get_plaid_client / _get_signing_key so verify_webhook uses a test key."""
    from app.modules.bank import webhook_verify as wv

    priv_pem, jwk = _gen_es256_keypair()
    wv.reset_cache_for_tests()

    def _fake_get_signing_key(kid):
        return jwk

    monkeypatch.setattr(wv, "_get_signing_key", _fake_get_signing_key)
    yield priv_pem, jwk
    wv.reset_cache_for_tests()


def test_valid_jwt_passes(plaid_jwt_env):
    from app.modules.bank.webhook_verify import verify_webhook

    priv_pem, _ = plaid_jwt_env
    body = b'{"webhook_type":"TRANSACTIONS","item_id":"item-1"}'
    token = _make_plaid_jwt(body, priv_pem)

    claims = verify_webhook(body, token)
    assert claims["request_body_sha256"] == hashlib.sha256(body).hexdigest()


def test_invalid_signature_rejected(plaid_jwt_env):
    from app.modules.bank.webhook_verify import verify_webhook, WebhookVerificationError

    _, _ = plaid_jwt_env
    # Sign with a DIFFERENT key — verification should fail.
    other_priv, _ = _gen_es256_keypair()
    body = b'{"hello":"world"}'
    token = _make_plaid_jwt(body, other_priv)

    with pytest.raises(WebhookVerificationError):
        verify_webhook(body, token)


def test_stale_iat_rejected(plaid_jwt_env):
    from app.modules.bank.webhook_verify import verify_webhook, WebhookVerificationError

    priv_pem, _ = plaid_jwt_env
    body = b'{"x":1}'
    # 10 minutes ago — outside the 5-minute window
    token = _make_plaid_jwt(body, priv_pem, iat=time.time() - 600)

    with pytest.raises(WebhookVerificationError, match="iat"):
        verify_webhook(body, token)


def test_wrong_body_hash_rejected(plaid_jwt_env):
    from app.modules.bank.webhook_verify import verify_webhook, WebhookVerificationError

    priv_pem, _ = plaid_jwt_env
    # Sign a hash for one body, but deliver a different body.
    signed_body = b'{"signed":true}'
    delivered_body = b'{"signed":false}'
    token = _make_plaid_jwt(signed_body, priv_pem)

    with pytest.raises(WebhookVerificationError, match="body hash"):
        verify_webhook(delivered_body, token)


def test_missing_header_rejected():
    from app.modules.bank.webhook_verify import verify_webhook, WebhookVerificationError

    with pytest.raises(WebhookVerificationError, match="missing"):
        verify_webhook(b"{}", None)


def test_skip_verification_only_in_sandbox(monkeypatch):
    from app.config import settings
    from app.modules.bank.webhook_verify import should_skip_verification

    monkeypatch.setattr(settings, "plaid_env", "sandbox")
    monkeypatch.setattr(settings, "plaid_skip_webhook_verify", True)
    assert should_skip_verification() is True

    monkeypatch.setattr(settings, "plaid_env", "production")
    # Even with flag set, production must never skip
    assert should_skip_verification() is False


# ══════════════════════════════════════════════════════════════════════════════
# 3. Transactional-ish cursor advancement
# ══════════════════════════════════════════════════════════════════════════════

class _FakeSyncResp(dict):
    """Minimal stand-in for plaid.transactions_sync response."""

    def __init__(self, added=None, modified=None, removed=None, cursor="c-next", has_more=False):
        super().__init__(
            added=added or [],
            modified=modified or [],
            removed=removed or [],
            next_cursor=cursor,
            has_more=has_more,
        )


class _FakeClient:
    def __init__(self, resp):
        self._resp = resp

    def transactions_sync(self, _req):
        return self._resp


class _FakePlaidItemsTable:
    """Tracks update() calls on plaid_items so we can assert cursor behavior."""

    def __init__(self, items_row):
        self.row = items_row
        self.updates: list[dict] = []
        self._filtered = [items_row]

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def single(self):
        return self

    def update(self, patch):
        self.updates.append(patch)
        return self

    def execute(self):
        return type("R", (), {"data": self._filtered[0] if self._filtered else None})()


class _FakeTxTable:
    """Mock bank_transactions table. ``fail_upsert=True`` raises on upsert."""

    def __init__(self, fail_upsert=False):
        self.fail_upsert = fail_upsert
        self.upserted = None

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def execute(self):
        return type("R", (), {"data": []})()

    def upsert(self, rows, **_k):
        if self.fail_upsert:
            raise RuntimeError("simulated DB failure")
        self.upserted = rows
        return self

    def delete(self):
        return self

    def in_(self, *_a, **_k):
        return self


class _FakeSupabase:
    def __init__(self, items_table, tx_table, expenses=None):
        self._items = items_table
        self._tx = tx_table
        self._expenses = expenses or []

    def table(self, name):
        if name == "plaid_items":
            return self._items
        if name == "bank_transactions":
            return self._tx
        if name == "expenses":
            exp = self

            class _ExpTable:
                def select(self_, *_a, **_k):
                    return self_
                def eq(self_, *_a, **_k):
                    return self_
                def execute(self_):
                    return type("R", (), {"data": exp._expenses})()

            return _ExpTable()
        raise AssertionError(f"unexpected table {name}")


class _FakeTx:
    """Plaid-like transaction object."""

    def __init__(self, tid="tx-1", amount=10.0, name="STARBUCKS", date="2026-04-10"):
        self.transaction_id = tid
        self.account_id = "acc-1"
        self.amount = amount
        self.iso_currency_code = "USD"
        self.unofficial_currency_code = None
        self.category = ["Food"]
        self.merchant_name = name
        self.name = name
        self.date = date
        self.pending = False

    def to_dict(self):
        return {
            "transaction_id": self.transaction_id,
            "amount": self.amount,
            "merchant_name": self.merchant_name,
            "date": self.date,
        }


def test_sync_item_cursor_advances_when_upsert_succeeds(monkeypatch):
    from app.modules.bank import service as svc
    from app.modules.bank import crypto as crypto_mod
    from app.config import settings
    from cryptography.fernet import Fernet

    # Set an encryption key + stub resolve_access_token path
    monkeypatch.setattr(settings, "plaid_encryption_key", Fernet.generate_key().decode())
    crypto_mod.reset_cache_for_tests()

    items_row = {
        "id": "row-1",
        "item_id": "item-abc",
        "access_token": "access-sandbox-xyz",
        "access_token_encrypted": None,
        "cursor": "c-start",
    }
    items_table = _FakePlaidItemsTable(items_row)
    tx_table = _FakeTxTable(fail_upsert=False)
    fake_sb = _FakeSupabase(items_table, tx_table)

    fake_resp = _FakeSyncResp(added=[_FakeTx()], cursor="c-new", has_more=False)
    monkeypatch.setattr(svc, "get_plaid_client", lambda: _FakeClient(fake_resp))

    result = svc.sync_item("user-1", "row-1", fake_sb)

    assert result["added"] == 1
    assert tx_table.upserted is not None and len(tx_table.upserted) == 1
    # Cursor advance should be the LAST update on plaid_items
    cursor_updates = [u for u in items_table.updates if "cursor" in u]
    assert cursor_updates, "cursor update should happen on success"
    assert cursor_updates[-1]["cursor"] == "c-new"


def test_sync_item_cursor_stays_when_upsert_fails(monkeypatch):
    from app.modules.bank import service as svc
    from app.modules.bank import crypto as crypto_mod
    from app.config import settings
    from cryptography.fernet import Fernet

    monkeypatch.setattr(settings, "plaid_encryption_key", Fernet.generate_key().decode())
    crypto_mod.reset_cache_for_tests()

    items_row = {
        "id": "row-1",
        "item_id": "item-abc",
        "access_token": "access-sandbox-xyz",
        "access_token_encrypted": None,
        "cursor": "c-start",
    }
    items_table = _FakePlaidItemsTable(items_row)
    tx_table = _FakeTxTable(fail_upsert=True)  # simulate mid-sync DB failure
    fake_sb = _FakeSupabase(items_table, tx_table)

    fake_resp = _FakeSyncResp(added=[_FakeTx()], cursor="c-new", has_more=False)
    monkeypatch.setattr(svc, "get_plaid_client", lambda: _FakeClient(fake_resp))

    with pytest.raises(RuntimeError, match="simulated DB failure"):
        svc.sync_item("user-1", "row-1", fake_sb)

    # Cursor must NOT have been advanced
    cursor_updates = [u for u in items_table.updates if "cursor" in u]
    assert cursor_updates == [], (
        "cursor must not advance when upsert fails; got %r" % (items_table.updates,)
    )
    # And nothing got persisted to bank_transactions
    assert tx_table.upserted is None
