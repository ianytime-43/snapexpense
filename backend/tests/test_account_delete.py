"""Tests for /account/delete — verifies every user-scoped table is cleared."""
from types import SimpleNamespace

import pytest

from app.routers import account


class RecordingAdmin:
    """Tracks every delete call against user-scoped tables."""

    def __init__(self, tables: dict[str, list[dict]]):
        self.tables = {k: list(v) for k, v in tables.items()}
        self.auth = SimpleNamespace(admin=SimpleNamespace(delete_user=self._delete_user))
        self.deleted_auth_user: str | None = None

    def _delete_user(self, user_id):
        self.deleted_auth_user = user_id

    def table(self, name):
        return _Table(self, name)


class _Table:
    def __init__(self, admin: RecordingAdmin, name: str):
        self.admin = admin
        self.name = name
        self._mode = None  # "select" | "delete" | "insert"
        self._filters: list[tuple] = []
        self._in: tuple[str, list] | None = None
        self._select = "*"

    def select(self, cols="*"):
        self._mode = "select"
        self._select = cols
        return self

    def insert(self, _row):
        self._mode = "insert"
        return self

    def delete(self):
        self._mode = "delete"
        return self

    def eq(self, col, val):
        self._filters.append((col, val))
        return self

    def in_(self, col, vals):
        self._in = (col, list(vals))
        return self

    def execute(self):
        rows = self.admin.tables.get(self.name, [])

        def matches(r):
            for c, v in self._filters:
                if r.get(c) != v:
                    return False
            if self._in is not None:
                col, vals = self._in
                if r.get(col) not in vals:
                    return False
            return True

        if self._mode == "select":
            matched = [r for r in rows if matches(r)]
            return SimpleNamespace(data=matched, count=len(matched))
        if self._mode == "delete":
            kept = [r for r in rows if not matches(r)]
            self.admin.tables[self.name] = kept
            return SimpleNamespace(data=None, count=0)
        if self._mode == "insert":
            return SimpleNamespace(data=[{"id": "new"}], count=1)
        return SimpleNamespace(data=None, count=0)


def _make_fake_user(user_id: str):
    user = SimpleNamespace(id=user_id)
    return {"user": user}


def test_delete_clears_all_user_scoped_tables(monkeypatch):
    user_id = "11111111-1111-1111-1111-111111111111"
    other_user = "22222222-2222-2222-2222-222222222222"

    tables = {
        "expenses": [
            {"id": "e1", "user_id": user_id},
            {"id": "e2", "user_id": user_id},
            {"id": "e3", "user_id": other_user},  # must survive
        ],
        "receipts": [
            {"id": "r1", "user_id": user_id, "expense_id": "e1"},
            {"id": "r2", "user_id": other_user, "expense_id": "e3"},
        ],
        "attendees": [
            {"id": "a1", "expense_id": "e1"},
            {"id": "a2", "expense_id": "e3"},
        ],
        "expense_line_items": [
            {"id": "l1", "expense_id": "e2"},
        ],
        "bank_transactions": [{"id": "b1", "user_id": user_id}],
        "plaid_items": [{"id": "p1", "user_id": user_id}],
        "recurring_expenses": [{"id": "s1", "user_id": user_id}],
        "accountant_access": [{"id": "ac1", "user_id": user_id}],
        "integration_connections": [{"id": "i1", "user_id": user_id}],
        "category_mappings": [{"id": "cm1", "user_id": user_id}],
        "vendor_memory": [{"id": "vm1", "user_id": user_id}],
        "expense_groups": [{"id": "g1", "user_id": user_id}],
        "forwarded_emails": [{"id": "f1", "user_id": user_id}],
        "notifications": [{"id": "n1", "user_id": user_id}],
        "trips": [{"id": "t1", "user_id": user_id}],
        "budgets": [{"id": "bg1", "user_id": user_id}],
        "warranties": [{"id": "w1", "user_id": user_id}],
        "expense_templates": [{"id": "et1", "user_id": user_id}],
        "expense_reports": [{"id": "er1", "user_id": user_id}],
        "calendar_events_cache": [{"id": "cec1", "user_id": user_id}],
        "user_forwarding_addresses": [{"id": "ufa1", "user_id": user_id}],
        "users": [{"id": user_id, "email": "x@y.z"}, {"id": other_user}],
    }

    admin = RecordingAdmin(tables)
    monkeypatch.setattr(account, "get_supabase_admin", lambda: admin)

    result = account.delete_my_account(current_user=_make_fake_user(user_id))
    assert result == {"message": "Account deleted successfully"}

    # The user-scoped rows are gone across every table we declared above.
    user_scoped_with_user_id = [
        "bank_transactions", "plaid_items", "recurring_expenses",
        "accountant_access", "integration_connections", "category_mappings",
        "vendor_memory", "expense_groups", "forwarded_emails", "notifications",
        "trips", "budgets", "warranties", "expense_templates", "expense_reports",
        "calendar_events_cache", "user_forwarding_addresses", "expenses",
    ]
    for t in user_scoped_with_user_id:
        assert not any(r.get("user_id") == user_id for r in admin.tables.get(t, [])), (
            f"{t} still has rows for {user_id}: {admin.tables.get(t)}"
        )

    # Other user's rows must survive.
    assert any(r["id"] == "e3" for r in admin.tables["expenses"])
    assert any(r["id"] == "r2" for r in admin.tables["receipts"])
    assert any(r["id"] == other_user for r in admin.tables["users"])

    # Expense-scoped children for the deleted user are gone.
    assert not any(r.get("expense_id") in {"e1", "e2"} for r in admin.tables["attendees"])
    assert not any(r.get("expense_id") in {"e1", "e2"} for r in admin.tables["expense_line_items"])
    assert not any(r.get("expense_id") in {"e1", "e2"} for r in admin.tables["receipts"])

    # Profile row removed.
    assert not any(r.get("id") == user_id for r in admin.tables["users"])

    # Auth user was deleted last.
    assert admin.deleted_auth_user == user_id


def test_delete_continues_on_per_table_failure(monkeypatch):
    """A failure on one table must not abort the rest of the deletion."""
    user_id = "33333333-3333-3333-3333-333333333333"
    admin = RecordingAdmin({
        "expenses": [{"id": "e1", "user_id": user_id}],
        "receipts": [],
        "attendees": [],
        "expense_line_items": [],
        "vendor_memory": [{"id": "vm1", "user_id": user_id}],
        "users": [{"id": user_id}],
    })

    # Force vendor_memory.delete() to raise.
    original_table = admin.table

    def flaky_table(name):
        t = original_table(name)
        if name == "vendor_memory":
            original_execute = t.execute

            def bad():
                if t._mode == "delete":
                    raise RuntimeError("simulated DB outage")
                return original_execute()

            t.execute = bad
        return t

    admin.table = flaky_table
    monkeypatch.setattr(account, "get_supabase_admin", lambda: admin)

    result = account.delete_my_account(current_user=_make_fake_user(user_id))
    assert result["message"] == "Account deleted successfully"
    # Expenses still gone despite the vendor_memory failure.
    assert admin.tables["expenses"] == []
    # Auth user still removed.
    assert admin.deleted_auth_user == user_id
