"""Shared fixtures for backend tests.

Provides a fake Supabase admin client that simulates query chains, plus
helpers for stubbing external services without hitting real APIs.
"""
import os
import sys
from pathlib import Path

# Ensure backend/ is on sys.path so `import app...` works when pytest is invoked
# from either the repo root or the backend/ directory.
BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# Default env vars so app.config.Settings doesn't blow up on import.
os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key")

import pytest


class FakeQuery:
    """Chainable mock that records filter calls and returns canned data on .execute()."""

    def __init__(self, table_data: list[dict]):
        self._data = list(table_data)
        self._filters: list[tuple] = []

    def select(self, *_args, **_kwargs):
        return self

    def eq(self, col, val):
        self._data = [r for r in self._data if r.get(col) == val]
        return self

    def neq(self, col, val):
        self._data = [r for r in self._data if r.get(col) != val]
        return self

    def gte(self, col, val):
        self._data = [r for r in self._data if r.get(col) and r.get(col) >= val]
        return self

    def lte(self, col, val):
        self._data = [r for r in self._data if r.get(col) and r.get(col) <= val]
        return self

    def or_(self, _expr):
        return self

    def order(self, *_a, **_k):
        return self

    def limit(self, _n):
        return self

    def maybe_single(self):
        self._single = True
        return self

    def single(self):
        self._single = True
        return self

    def insert(self, row):
        self._inserted = row
        return self

    def update(self, patch):
        for r in self._data:
            r.update(patch)
        self._patch = patch
        return self

    def delete(self):
        return self

    def execute(self):
        if getattr(self, "_single", False):
            data = self._data[0] if self._data else None
            return type("R", (), {"data": data, "count": len(self._data)})()
        return type("R", (), {"data": self._data, "count": len(self._data)})()


class FakeAdmin:
    """Stand-in for a Supabase admin client."""

    def __init__(self, tables: dict[str, list[dict]] | None = None):
        self.tables = tables or {}

    def table(self, name):
        return FakeQuery(self.tables.get(name, []))


@pytest.fixture
def fake_admin():
    return FakeAdmin


@pytest.fixture
def empty_admin():
    return FakeAdmin()
