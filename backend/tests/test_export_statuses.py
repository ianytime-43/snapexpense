"""Tests for export status filtering.

Drafts must be excluded by default. Callers may opt-in explicitly via
`?statuses=draft,confirmed`. Unknown statuses raise 400.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.routers.export import (
    DEFAULT_EXPORT_STATUSES,
    EXPORT_STATUSES,
    _fetch_expenses,
    _parse_statuses,
)


# ── _parse_statuses ───────────────────────────────────────────────────────────


def test_parse_none_returns_default_excluding_draft():
    out = _parse_statuses(None)
    assert out == set(DEFAULT_EXPORT_STATUSES)
    assert "draft" not in out


def test_parse_empty_string_returns_default():
    assert _parse_statuses("") == set(DEFAULT_EXPORT_STATUSES)


def test_parse_explicit_includes_draft():
    out = _parse_statuses("draft,confirmed")
    assert out == {"draft", "confirmed"}


def test_parse_only_draft():
    assert _parse_statuses("draft") == {"draft"}


def test_parse_whitespace_and_commas_tolerated():
    assert _parse_statuses(" confirmed , submitted ") == {"confirmed", "submitted"}


def test_parse_unknown_raises_400():
    with pytest.raises(HTTPException) as ei:
        _parse_statuses("confirmed,bogus")
    assert ei.value.status_code == 400
    assert "bogus" in ei.value.detail.lower()


def test_export_statuses_set_contains_all_four():
    assert EXPORT_STATUSES == {"draft", "confirmed", "submitted", "reimbursed"}


# ── _fetch_expenses status filter ─────────────────────────────────────────────


class _FakeTable:
    def __init__(self, rows):
        self._rows = rows

    def select(self, *_a, **_k):
        return self

    def eq(self, *_a, **_k):
        return self

    def execute(self):
        return type("R", (), {"data": list(self._rows)})()


class _FakeAdmin:
    def __init__(self, rows):
        self._rows = rows

    def table(self, _name):
        return _FakeTable(self._rows)


def _rows():
    return [
        {"id": "1", "status": "draft", "expense_date": "2026-01-15"},
        {"id": "2", "status": "confirmed", "expense_date": "2026-01-16"},
        {"id": "3", "status": "submitted", "expense_date": "2026-01-17"},
        {"id": "4", "status": "reimbursed", "expense_date": "2026-01-18"},
    ]


def test_fetch_default_excludes_drafts():
    admin = _FakeAdmin(_rows())
    out = _fetch_expenses(admin, "u1", "2026-01-01", "2026-02-01")
    ids = {e["id"] for e in out}
    assert "1" not in ids
    assert ids == {"2", "3", "4"}


def test_fetch_with_draft_opt_in_includes_drafts():
    admin = _FakeAdmin(_rows())
    out = _fetch_expenses(
        admin, "u1", "2026-01-01", "2026-02-01",
        statuses={"draft", "confirmed"},
    )
    ids = {e["id"] for e in out}
    assert ids == {"1", "2"}


def test_fetch_explicit_only_draft():
    admin = _FakeAdmin(_rows())
    out = _fetch_expenses(
        admin, "u1", "2026-01-01", "2026-02-01",
        statuses={"draft"},
    )
    assert [e["id"] for e in out] == ["1"]
