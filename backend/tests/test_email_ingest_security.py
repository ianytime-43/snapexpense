"""Security tests for the Mailgun inbound webhook (signature verification)."""
import hashlib
import hmac
import time

import pytest
from fastapi import HTTPException

from app.routers import email_ingest


SIGNING_KEY = "test-signing-key-abcdef"


def _sign(timestamp: str, token: str, key: str = SIGNING_KEY) -> str:
    return hmac.new(
        key.encode("utf-8"),
        f"{timestamp}{token}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


@pytest.fixture(autouse=True)
def _reset_settings(monkeypatch):
    # Default to production + valid key; individual tests override.
    monkeypatch.setattr(email_ingest.settings, "mailgun_signing_key", SIGNING_KEY)
    monkeypatch.setattr(email_ingest.settings, "app_env", "production")


def test_valid_signature_passes():
    ts = str(int(time.time()))
    token = "abc-123-token"
    sig = _sign(ts, token)
    ok, reason = email_ingest._verify_mailgun_signature(ts, token, sig)
    assert ok is True
    assert reason == ""


def test_invalid_signature_rejected():
    ts = str(int(time.time()))
    token = "abc-123-token"
    ok, reason = email_ingest._verify_mailgun_signature(ts, token, "deadbeef" * 8)
    assert ok is False
    assert "mismatch" in reason


def test_stale_timestamp_rejected():
    ts = str(int(time.time()) - 60 * 60)  # 1 hour old
    token = "abc-123-token"
    sig = _sign(ts, token)
    ok, reason = email_ingest._verify_mailgun_signature(ts, token, sig)
    assert ok is False
    assert "replay" in reason


def test_future_timestamp_outside_skew_rejected():
    ts = str(int(time.time()) + 60 * 60)
    token = "abc-123-token"
    sig = _sign(ts, token)
    ok, reason = email_ingest._verify_mailgun_signature(ts, token, sig)
    assert ok is False
    assert "replay" in reason


def test_missing_fields_rejected():
    ok, reason = email_ingest._verify_mailgun_signature("", "", "")
    assert ok is False
    assert "missing" in reason


def test_missing_key_in_production_rejected(monkeypatch):
    monkeypatch.setattr(email_ingest.settings, "mailgun_signing_key", None)
    monkeypatch.setattr(email_ingest.settings, "app_env", "production")
    ts = str(int(time.time()))
    ok, reason = email_ingest._verify_mailgun_signature(ts, "tok", "sig")
    assert ok is False
    assert "not configured" in reason


def test_missing_key_in_dev_allowed(monkeypatch):
    monkeypatch.setattr(email_ingest.settings, "mailgun_signing_key", "")
    monkeypatch.setattr(email_ingest.settings, "app_env", "development")
    ok, reason = email_ingest._verify_mailgun_signature("", "", "")
    assert ok is True
    assert reason == ""


def test_non_integer_timestamp_rejected():
    token = "tok"
    sig = _sign("not-a-number", token)
    ok, reason = email_ingest._verify_mailgun_signature("not-a-number", token, sig)
    assert ok is False
    assert "integer" in reason
