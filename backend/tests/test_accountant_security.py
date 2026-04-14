"""Tests for accountant share token hardening (2026-04-14).

Covers:
  * create → plaintext token returned once
  * list endpoint never exposes plaintext or hash
  * resolve with correct token → succeeds and logs
  * resolve with wrong token → 401
  * resolve with expired token → 401
  * resolve with revoked token → 401
  * rate limit trips at 31st request / minute
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.database import get_supabase_admin
from app.routers import accountant as accountant_router


# ── Fake Supabase ─────────────────────────────────────────────────────────────

class _Result:
    def __init__(self, data):
        self.data = data


class _Table:
    def __init__(self, store, name):
        self._store = store
        self._name = name
        self._filters = []
        self._op = None
        self._payload = None
        self._select = None
        self._order_desc = False
        self._single = False

    def select(self, cols="*"):
        self._select = cols
        return self

    def insert(self, row):
        self._op = "insert"
        self._payload = row
        return self

    def upsert(self, row, on_conflict=None):
        self._op = "upsert"
        self._payload = row
        self._on_conflict = on_conflict
        return self

    def update(self, patch):
        self._op = "update"
        self._payload = patch
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def in_(self, col, values):
        self._filters.append((col, ("in", list(values))))
        return self

    def order(self, *_a, **kw):
        self._order_desc = kw.get("desc", False)
        return self

    def maybe_single(self):
        self._single = True
        return self

    def single(self):
        self._single = True
        return self

    def _rows(self):
        rows = self._store.setdefault(self._name, [])
        out = list(rows)
        for col, val in self._filters:
            if isinstance(val, tuple) and val[0] == "in":
                out = [r for r in out if r.get(col) in val[1]]
            else:
                out = [r for r in out if r.get(col) == val]
        return out

    def _project(self, rows):
        if not self._select or self._select == "*":
            return rows
        cols = [c.strip() for c in self._select.split(",")]
        return [{k: r.get(k) for k in cols} for r in rows]

    def execute(self):
        rows = self._store.setdefault(self._name, [])

        if self._op == "insert":
            payload = self._payload if isinstance(self._payload, list) else [self._payload]
            for p in payload:
                p.setdefault("id", str(uuid.uuid4()))
                rows.append(p)
            return _Result(payload if isinstance(self._payload, list) else [payload[0]])

        if self._op == "upsert":
            conflict = (self._on_conflict or "").split(",") if self._on_conflict else []
            p = dict(self._payload)
            if conflict:
                # find existing row matching all conflict cols
                idx = None
                for i, r in enumerate(rows):
                    if all(r.get(c) == p.get(c) for c in conflict):
                        idx = i
                        break
                if idx is not None:
                    p.setdefault("id", rows[idx].get("id", str(uuid.uuid4())))
                    rows[idx] = p
                else:
                    p.setdefault("id", str(uuid.uuid4()))
                    rows.append(p)
            else:
                p.setdefault("id", str(uuid.uuid4()))
                rows.append(p)
            return _Result([p])

        if self._op == "update":
            matched = self._rows()
            for r in matched:
                for i, existing in enumerate(rows):
                    if existing is r:
                        rows[i] = {**existing, **self._payload}
            return _Result(matched)

        if self._op == "delete":
            matched = self._rows()
            self._store[self._name] = [r for r in rows if r not in matched]
            return _Result(matched)

        # Default: select
        out = self._rows()
        out = self._project(out)
        if self._single:
            return _Result(out[0] if out else None)
        return _Result(out)


class FakeAdmin:
    def __init__(self):
        self.store: dict[str, list[dict]] = {}

    def table(self, name):
        return _Table(self.store, name)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def fake_admin():
    return FakeAdmin()


@pytest.fixture
def app(fake_admin, monkeypatch):
    # Reset the in-memory rate-limit buckets between tests.
    accountant_router._rate_buckets.clear()

    # Override get_supabase_admin everywhere it's used.
    def _get_admin():
        return fake_admin

    # Patch the reference imported at router module-load time.
    monkeypatch.setattr(accountant_router, "get_supabase_admin", _get_admin)

    app = FastAPI()
    app.include_router(accountant_router.router)

    user_id = str(uuid.uuid4())

    class _User:
        id = user_id

    app.dependency_overrides[get_current_user] = lambda: {"user": _User(), "token": "t"}
    app.dependency_overrides[get_supabase_admin] = _get_admin

    app.state.user_id = user_id
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


# ── Tests ─────────────────────────────────────────────────────────────────────

def test_invite_returns_plaintext_once(client, fake_admin):
    resp = client.post("/accountant/invite", json={"accountant_email": "cpa@example.com"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"], "plaintext token must be returned on create"
    assert len(body["access_token"]) >= 32
    assert "access_token_notice" in body
    assert body["accountant_email"] == "cpa@example.com"
    assert body["expires_at"]

    # DB should contain only the hash, never the plaintext.
    stored = fake_admin.store["accountant_access"][0]
    assert "token_hash" in stored
    assert "access_token" not in stored
    assert stored["token_hash"] != body["access_token"]


def test_list_does_not_expose_token(client):
    created = client.post("/accountant/invite", json={"accountant_email": "cpa@example.com"}).json()
    plaintext = created["access_token"]

    resp = client.get("/accountant/access-list")
    assert resp.status_code == 200
    rows = resp.json()
    assert len(rows) == 1
    row = rows[0]
    assert "access_token" not in row
    assert "token_hash" not in row
    # No field should leak the plaintext.
    assert plaintext not in str(row)


def test_view_with_correct_token_succeeds(client):
    created = client.post("/accountant/invite", json={"accountant_email": "cpa@example.com"}).json()
    plaintext = created["access_token"]

    resp = client.get(f"/accountant/view/{plaintext}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["accountant_email"] == "cpa@example.com"
    assert "expenses" in body


def test_view_with_wrong_token_401(client):
    client.post("/accountant/invite", json={"accountant_email": "cpa@example.com"})
    resp = client.get("/accountant/view/definitely-not-the-real-token-xxxxxxxxxx")
    assert resp.status_code == 401


def test_view_with_expired_token_401(client, fake_admin):
    created = client.post(
        "/accountant/invite",
        json={"accountant_email": "cpa@example.com", "expires_in_days": 1},
    ).json()
    plaintext = created["access_token"]

    # Backdate expires_at.
    past = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
    fake_admin.store["accountant_access"][0]["expires_at"] = past

    resp = client.get(f"/accountant/view/{plaintext}")
    assert resp.status_code == 401
    assert "expired" in resp.json()["detail"].lower()


def test_view_with_revoked_token_401(client, fake_admin):
    created = client.post("/accountant/invite", json={"accountant_email": "cpa@example.com"}).json()
    plaintext = created["access_token"]

    # Revoke via endpoint.
    resp = client.delete(f"/accountant/shares/{fake_admin.store['accountant_access'][0]['id']}")
    assert resp.status_code == 200

    resp = client.get(f"/accountant/view/{plaintext}")
    assert resp.status_code == 401
    assert "revoked" in resp.json()["detail"].lower()


def test_rate_limit_trips_after_30_requests(client):
    created = client.post("/accountant/invite", json={"accountant_email": "cpa@example.com"}).json()
    plaintext = created["access_token"]

    # 30 requests should all succeed; the 31st must 429.
    for i in range(30):
        r = client.get(f"/accountant/view/{plaintext}")
        assert r.status_code == 200, f"request {i} unexpectedly failed"
    r = client.get(f"/accountant/view/{plaintext}")
    assert r.status_code == 429


def test_access_log_records_use(client, fake_admin):
    created = client.post("/accountant/invite", json={"accountant_email": "cpa@example.com"}).json()
    plaintext = created["access_token"]
    client.get(f"/accountant/view/{plaintext}")

    logs = fake_admin.store.get("accountant_access_log", [])
    assert len(logs) == 1
    assert logs[0]["path"].endswith("/view/" + plaintext)
    assert logs[0]["status_code"] == 200
