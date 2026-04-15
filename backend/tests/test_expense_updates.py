"""Tests for ExpenseUpdate whitelist: ensures newly-added fields are persisted
and unknown fields trigger 422 (root-cause guard).

Previously ExpenseUpdate whitelisted only 15 fields. UI-submitted fields such
as expense_tag, deduction_pct, group_id, alcohol_total, document_type, due_date,
and location_jurisdiction were silently dropped by Pydantic. This test pins
the correct behavior.
"""
from __future__ import annotations

import uuid

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.auth import get_current_user
from app.database import get_supabase_admin
from app.routers import expenses as expenses_router


# ── Minimal fake Supabase that supports select/eq/maybe_single + update ───────


class _Res:
    def __init__(self, data):
        self.data = data


class _ExpTable:
    def __init__(self, store):
        self._store = store
        self._filters: list[tuple] = []
        self._op: str | None = None
        self._patch: dict | None = None
        self._single = False

    def select(self, *_a, **_k):
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def order(self, *_a, **_k):
        return self

    def maybe_single(self):
        self._single = True
        return self

    def update(self, patch):
        self._op = "update"
        self._patch = dict(patch)
        return self

    def delete(self):
        self._op = "delete"
        return self

    def insert(self, row):
        self._op = "insert"
        self._patch = dict(row)
        return self

    def _rows(self):
        out = list(self._store["expenses"])
        for col, val in self._filters:
            out = [r for r in out if r.get(col) == val]
        return out

    def execute(self):
        rows = self._rows()
        if self._op == "update":
            for r in rows:
                r.update(self._patch or {})
            return _Res(rows)
        if self._op == "insert":
            row = self._patch or {}
            row.setdefault("id", str(uuid.uuid4()))
            self._store["expenses"].append(row)
            return _Res([row])
        if self._single:
            return _Res(rows[0] if rows else None)
        return _Res(rows)


class FakeAdmin:
    def __init__(self):
        self.store = {"expenses": []}

    def table(self, name):
        # Expense updates only hit expenses + vendor_memory (on status=confirmed).
        if name == "expenses":
            return _ExpTable(self.store)
        # Return an inert table for other names.
        return _ExpTable({"_": []})


# ── Fixtures ──────────────────────────────────────────────────────────────────


@pytest.fixture
def fake_admin():
    return FakeAdmin()


@pytest.fixture
def user_id():
    return str(uuid.uuid4())


@pytest.fixture
def app(fake_admin, user_id, monkeypatch):
    monkeypatch.setattr(expenses_router, "get_supabase_admin", lambda: fake_admin)

    app = FastAPI()
    app.include_router(expenses_router.router)

    class _User:
        id = user_id

    app.dependency_overrides[get_current_user] = lambda: {"user": _User(), "token": "t"}
    app.dependency_overrides[get_supabase_admin] = lambda: fake_admin
    return app


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def seeded_expense(fake_admin, user_id):
    exp_id = str(uuid.uuid4())
    fake_admin.store["expenses"].append(
        {"id": exp_id, "user_id": user_id, "merchant_name": "Seed", "status": "draft"}
    )
    return exp_id


# ── Tests: newly-whitelisted fields round-trip ────────────────────────────────


@pytest.mark.parametrize(
    "field,value",
    [
        ("expense_tag", "business"),
        ("expense_tag", "personal"),
        ("deduction_pct", 0.5),
        ("group_id", str(uuid.uuid4())),
        ("alcohol_total", 12.5),
        ("document_type", "invoice"),
        ("due_date", "2026-05-01"),
        ("location_jurisdiction", "CA-ON"),
    ],
)
def test_patch_new_field_persists(client, fake_admin, seeded_expense, field, value):
    resp = client.patch(f"/expenses/{seeded_expense}", json={field: value})
    assert resp.status_code == 200, resp.text

    stored = next(r for r in fake_admin.store["expenses"] if r["id"] == seeded_expense)
    assert stored[field] == value, f"{field}={value!r} not persisted (got {stored.get(field)!r})"


def test_patch_unknown_field_rejected_422(client, seeded_expense):
    resp = client.patch(
        f"/expenses/{seeded_expense}",
        json={"some_bogus_field": "should-be-rejected"},
    )
    assert resp.status_code == 422, resp.text
    # Pydantic v2 "extra_forbidden" error should be visible.
    body = resp.json()
    assert any(
        "extra_forbidden" in (err.get("type", "") or "")
        or "extra" in (err.get("type", "") or "")
        for err in body.get("detail", [])
    ), body


def test_patch_invalid_expense_tag_rejected(client, seeded_expense):
    resp = client.patch(f"/expenses/{seeded_expense}", json={"expense_tag": "bogus"})
    assert resp.status_code == 422


def test_patch_invalid_document_type_rejected(client, seeded_expense):
    resp = client.patch(f"/expenses/{seeded_expense}", json={"document_type": "bogus"})
    assert resp.status_code == 422
