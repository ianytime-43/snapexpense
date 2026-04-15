"""Tests for the public accountant share endpoint (/accountant/public).

Covers:
  * create share returns plaintext token once + scope metadata
  * public endpoint with correct token returns masked owner + filtered expenses
  * token is rejected if missing / wrong / expired / revoked
  * requested date range outside share window is rejected
  * include_receipts/invoices/mileage flags filter output
  * public rate limit trips at 61st request / minute
  * owner email is masked in response
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.database import get_supabase_admin
from app.routers import accountant as accountant_router

# Reuse the more feature-rich fake from the security tests.
from tests.test_accountant_security import FakeAdmin, _Table


# Extend _Table with range filters for this suite's needs.
def _gte(self, col, val):
    self._filters.append((col, ("gte", val)))
    return self


def _lte(self, col, val):
    self._filters.append((col, ("lte", val)))
    return self


def _rows_with_ranges(self):
    rows = self._store.setdefault(self._name, [])
    out = list(rows)
    for col, val in self._filters:
        if isinstance(val, tuple) and val[0] == "in":
            out = [r for r in out if r.get(col) in val[1]]
        elif isinstance(val, tuple) and val[0] == "gte":
            out = [r for r in out if r.get(col) is not None and r.get(col) >= val[1]]
        elif isinstance(val, tuple) and val[0] == "lte":
            out = [r for r in out if r.get(col) is not None and r.get(col) <= val[1]]
        else:
            out = [r for r in out if r.get(col) == val]
    return out


_Table.gte = _gte
_Table.lte = _lte
_Table._rows = _rows_with_ranges


@pytest.fixture
def fake_admin():
    return FakeAdmin()


@pytest.fixture
def app(fake_admin, monkeypatch):
    accountant_router._rate_buckets.clear()
    accountant_router._public_rate_buckets.clear()

    def _get_admin():
        return fake_admin

    monkeypatch.setattr(accountant_router, "get_supabase_admin", _get_admin)

    app = FastAPI()
    app.include_router(accountant_router.router)

    user_id = str(uuid.uuid4())

    class _User:
        id = user_id

    app.dependency_overrides[get_current_user] = lambda: {"user": _User(), "token": "t"}
    app.dependency_overrides[get_supabase_admin] = _get_admin

    app.state.user_id = user_id

    # Seed an owner user row so email masking has something to mask.
    fake_admin.store["users"] = [{"id": user_id, "email": "thomas@example.com"}]
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


def _seed_expenses(fake_admin, user_id: str):
    today = date.today()
    fake_admin.store["expenses"] = [
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "merchant_name": "Uber",
            "expense_date": (today - timedelta(days=5)).isoformat(),
            "amount_total": 42.0,
            "tax_total": 4.2,
            "expense_tag": "business",
            "doc_type": "receipt",
        },
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "merchant_name": "Acme Invoice",
            "expense_date": (today - timedelta(days=10)).isoformat(),
            "amount_total": 1000.0,
            "tax_total": 130.0,
            "expense_tag": "business",
            "doc_type": "invoice",
        },
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "merchant_name": "Personal lunch",
            "expense_date": (today - timedelta(days=3)).isoformat(),
            "amount_total": 25.0,
            "tax_total": 2.5,
            "expense_tag": "personal",
            "doc_type": "receipt",
        },
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "merchant_name": "Outside window",
            "expense_date": (today - timedelta(days=400)).isoformat(),
            "amount_total": 9.0,
            "tax_total": 0,
            "expense_tag": "business",
            "doc_type": "receipt",
        },
    ]


def _create_share(client, **overrides):
    today = date.today()
    payload = {
        "label": "Q1 2026",
        "date_from": (today - timedelta(days=30)).isoformat(),
        "date_to": today.isoformat(),
        "expires_in_days": 30,
        "include_receipts": True,
        "include_invoices": True,
        "include_mileage": False,
    }
    payload.update(overrides)
    resp = client.post("/accountant/shares", json=payload)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_create_share_returns_plaintext_once(client, fake_admin):
    body = _create_share(client)
    assert body["access_token"] and len(body["access_token"]) >= 32
    assert body["label"] == "Q1 2026"
    assert body["date_from"] and body["date_to"]
    assert body["expires_at"]

    stored = fake_admin.store["accountant_access"][0]
    assert "access_token" not in stored
    assert stored["token_hash"] and stored["token_hash"] != body["access_token"]


def test_public_view_with_correct_token(client, fake_admin, app):
    _seed_expenses(fake_admin, app.state.user_id)
    share = _create_share(client)
    token = share["access_token"]

    resp = client.get(
        "/accountant/public",
        params={"token": token, "date_from": share["date_from"], "date_to": share["date_to"]},
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()

    # Masked email.
    assert data["share"]["owner_email_masked"].startswith("t")
    assert "@example.com" in data["share"]["owner_email_masked"]
    assert "thomas@" not in data["share"]["owner_email_masked"]

    # Personal + out-of-window excluded. Receipt + invoice included.
    merchants = {e["merchant_name"] for e in data["expenses"]}
    assert "Uber" in merchants
    assert "Acme Invoice" in merchants
    assert "Personal lunch" not in merchants
    assert "Outside window" not in merchants

    # Totals.
    assert data["totals"]["count"] == 2
    assert data["totals"]["grand_total"] == pytest.approx(1042.0)
    assert data["totals"]["tax_total"] == pytest.approx(134.2)


def test_public_view_invalid_token_401(client):
    _create_share(client)
    resp = client.get(
        "/accountant/public",
        params={"token": "not-a-real-token-aaaaaaaaaaaaaaaaaa"},
    )
    assert resp.status_code == 401


def test_public_view_missing_token_422(client):
    resp = client.get("/accountant/public")
    # FastAPI returns 422 for missing required query param.
    assert resp.status_code == 422


def test_public_view_revoked_401(client, fake_admin):
    share = _create_share(client)
    share_id = fake_admin.store["accountant_access"][0]["id"]
    client.delete(f"/accountant/shares/{share_id}")

    resp = client.get("/accountant/public", params={"token": share["access_token"]})
    assert resp.status_code == 401
    assert "revoked" in resp.json()["detail"].lower()


def test_public_view_expired_401(client, fake_admin):
    share = _create_share(client)
    past = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    fake_admin.store["accountant_access"][0]["expires_at"] = past

    resp = client.get("/accountant/public", params={"token": share["access_token"]})
    assert resp.status_code == 401
    assert "expired" in resp.json()["detail"].lower()


def test_public_view_rejects_range_outside_share(client, fake_admin, app):
    _seed_expenses(fake_admin, app.state.user_id)
    share = _create_share(client)

    bad_from = (date.today() - timedelta(days=365)).isoformat()
    resp = client.get(
        "/accountant/public",
        params={"token": share["access_token"], "date_from": bad_from, "date_to": share["date_to"]},
    )
    assert resp.status_code == 400
    assert "outside" in resp.json()["detail"].lower()


def test_include_flags_filter_invoices(client, fake_admin, app):
    _seed_expenses(fake_admin, app.state.user_id)
    share = _create_share(client, include_receipts=False, include_invoices=True)

    resp = client.get(
        "/accountant/public",
        params={"token": share["access_token"], "date_from": share["date_from"], "date_to": share["date_to"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    merchants = {e["merchant_name"] for e in data["expenses"]}
    assert merchants == {"Acme Invoice"}


def test_mileage_included_when_flag_set(client, fake_admin, app):
    user_id = app.state.user_id
    _seed_expenses(fake_admin, user_id)
    fake_admin.store["mileage_trips"] = [
        {
            "id": str(uuid.uuid4()),
            "user_id": user_id,
            "trip_date": (date.today() - timedelta(days=4)).isoformat(),
            "distance_km": 12.5,
            "trip_tag": "business",
        }
    ]
    share = _create_share(client, include_mileage=True)

    resp = client.get(
        "/accountant/public",
        params={"token": share["access_token"], "date_from": share["date_from"], "date_to": share["date_to"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["mileage"] is not None
    assert data["mileage"]["count"] == 1
    assert data["mileage"]["total_km"] == pytest.approx(12.5)


def test_public_rate_limit_at_60_per_min(client, fake_admin, app):
    _seed_expenses(fake_admin, app.state.user_id)
    share = _create_share(client)
    token = share["access_token"]
    params = {"token": token, "date_from": share["date_from"], "date_to": share["date_to"]}

    for i in range(60):
        r = client.get("/accountant/public", params=params)
        assert r.status_code == 200, f"request {i} failed: {r.text}"
    r = client.get("/accountant/public", params=params)
    assert r.status_code == 429


def test_create_share_rejects_bad_range(client):
    today = date.today()
    resp = client.post(
        "/accountant/shares",
        json={
            "date_from": today.isoformat(),
            "date_to": (today - timedelta(days=5)).isoformat(),
        },
    )
    assert resp.status_code == 400


def test_create_share_requires_at_least_one_content_type(client):
    today = date.today()
    resp = client.post(
        "/accountant/shares",
        json={
            "date_from": (today - timedelta(days=10)).isoformat(),
            "date_to": today.isoformat(),
            "include_receipts": False,
            "include_invoices": False,
            "include_mileage": False,
        },
    )
    assert resp.status_code == 400


def test_access_log_records_public_view(client, fake_admin, app):
    _seed_expenses(fake_admin, app.state.user_id)
    share = _create_share(client)
    client.get(
        "/accountant/public",
        params={"token": share["access_token"], "date_from": share["date_from"], "date_to": share["date_to"]},
    )
    logs = fake_admin.store.get("accountant_access_log", [])
    assert len(logs) == 1
    assert logs[0]["status_code"] == 200
