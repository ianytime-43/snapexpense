"""Plaid business logic: link tokens, exchange, sync, and persistence."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

from ...config import settings
from .client import get_plaid_client
from .crypto import encrypt_token, resolve_access_token, EncryptionKeyMissing
from .matching import auto_match

logger = logging.getLogger(__name__)


def create_link_token(user_id: str) -> dict:
    """Create a Plaid Link token for the given user."""
    client = get_plaid_client()
    from plaid.model.link_token_create_request import LinkTokenCreateRequest
    from plaid.model.link_token_create_request_user import LinkTokenCreateRequestUser
    from plaid.model.products import Products
    from plaid.model.country_code import CountryCode

    req = LinkTokenCreateRequest(
        user=LinkTokenCreateRequestUser(client_user_id=str(user_id)),
        client_name="SnapExpense",
        products=[Products("transactions")],
        country_codes=[CountryCode("US"), CountryCode("CA")],
        language="en",
        webhook=settings.plaid_webhook_url or None,
    )
    resp = client.link_token_create(req)
    return {"link_token": resp["link_token"], "expiration": str(resp.get("expiration"))}


def exchange_public_token(
    user_id: str,
    public_token: str,
    institution_name: Optional[str],
    institution_id: Optional[str],
    supabase,
) -> dict:
    """Exchange a public_token for an access_token and persist a plaid_items row."""
    client = get_plaid_client()
    from plaid.model.item_public_token_exchange_request import ItemPublicTokenExchangeRequest

    resp = client.item_public_token_exchange(
        ItemPublicTokenExchangeRequest(public_token=public_token)
    )
    access_token = resp["access_token"]
    item_id = resp["item_id"]

    row = {
        "user_id": user_id,
        "item_id": item_id,
        # Legacy plaintext column — kept populated during rollout for backward
        # compatibility until migration 032 drops it. Prefer the encrypted one.
        "access_token": access_token,
        "institution_id": institution_id,
        "institution_name": institution_name,
        "status": "active",
    }
    # Best-effort encrypted dual-write. If the key isn't configured we log and
    # continue with plaintext only so dev environments don't break — but in
    # production PLAID_ENCRYPTION_KEY MUST be set.
    try:
        row["access_token_encrypted"] = encrypt_token(access_token)
    except EncryptionKeyMissing:
        logger.warning(
            "PLAID_ENCRYPTION_KEY not set — storing access_token plaintext only. "
            "Set PLAID_ENCRYPTION_KEY before production."
        )
    supabase.table("plaid_items").upsert(row, on_conflict="item_id").execute()
    return {"item_id": item_id, "institution_name": institution_name}


def list_items(user_id: str, supabase) -> list[dict]:
    res = (
        supabase.table("plaid_items")
        .select("id, item_id, institution_name, status, last_sync_at, created_at")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return res.data or []


def remove_item(user_id: str, item_row_id: str, supabase) -> bool:
    """Remove a Plaid item (locally + try to revoke at Plaid)."""
    item_res = (
        supabase.table("plaid_items")
        .select("item_id, access_token, access_token_encrypted")
        .eq("id", item_row_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not item_res.data:
        return False

    # Best-effort revoke at Plaid
    try:
        client = get_plaid_client()
        from plaid.model.item_remove_request import ItemRemoveRequest
        access_token = resolve_access_token(item_res.data)
        client.item_remove(ItemRemoveRequest(access_token=access_token))
    except Exception as e:
        logger.warning(f"Plaid item_remove failed (continuing): {e}")

    supabase.table("plaid_items").delete().eq("id", item_row_id).eq("user_id", user_id).execute()
    return True


def sync_item(user_id: str, item_row_id: str, supabase) -> dict:
    """Pull new transactions for a single Plaid item using transactions/sync.
    Persists added/modified transactions, marks removed ones, and runs auto-match.
    """
    item_res = (
        supabase.table("plaid_items")
        .select("id, item_id, access_token, access_token_encrypted, cursor")
        .eq("id", item_row_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not item_res.data:
        return {"added": 0, "modified": 0, "removed": 0, "auto_matched": 0}

    item = item_res.data
    access_token = resolve_access_token(item)
    starting_cursor = item.get("cursor") or ""
    cursor = starting_cursor
    client = get_plaid_client()
    from plaid.model.transactions_sync_request import TransactionsSyncRequest

    added: list[dict] = []
    modified: list[dict] = []
    removed: list[dict] = []
    has_more = True

    while has_more:
        req = TransactionsSyncRequest(access_token=access_token, cursor=cursor or "")
        resp = client.transactions_sync(req)
        added.extend(resp["added"])
        modified.extend(resp["modified"])
        removed.extend(resp["removed"])
        cursor = resp["next_cursor"]
        has_more = resp["has_more"]

    # Fetch user's expenses once for matching
    exp_res = (
        supabase.table("expenses")
        .select("id, amount_total, currency, merchant_name, expense_date")
        .eq("user_id", user_id)
        .execute()
    )
    expenses = exp_res.data or []

    auto_matched_count = 0
    rows_to_upsert = []
    for tx in added + modified:
        tx_dict = _plaid_tx_to_dict(tx)
        match = auto_match(tx_dict, expenses, threshold=0.9)
        row = {
            "user_id": user_id,
            "plaid_item_id": item["id"],
            "plaid_transaction_id": tx_dict["plaid_transaction_id"],
            "plaid_account_id": tx_dict["plaid_account_id"],
            "external_id": tx_dict["plaid_transaction_id"],
            "amount": tx_dict["amount"],
            "currency": tx_dict["currency"],
            "merchant_name": tx_dict["merchant_name"],
            "transaction_date": tx_dict["transaction_date"],
            "category": tx_dict["category"],
            "pending": tx_dict["pending"],
            "raw_json": tx_dict["raw_json"],
            "status": "matched" if match else "unmatched",
            "matched_expense_id": match["id"] if match else None,
            "match_confidence": match["score"] if match else None,
        }
        if match:
            auto_matched_count += 1
        rows_to_upsert.append(row)

    # ── Transactional-ish cursor advancement ─────────────────────────────────
    # Supabase PostgREST does not expose multi-statement transactions, so we
    # can't atomically wrap "upsert rows + advance cursor". Compromise:
    #   1. Write rows first; cursor is only advanced AFTER successful write.
    #   2. If the upsert raises, we leave cursor at its previous value and
    #      re-raise so the caller can mark the item errored. Plaid replays the
    #      same window on the next sync. This is idempotent because
    #      `plaid_transaction_id` has a unique constraint (migration 030).
    #   3. If the cursor update fails AFTER a successful upsert, the next sync
    #      will replay the same window and upsert will no-op on conflict — no
    #      data loss, just a duplicate round-trip.
    # TODO: when Supabase RPC exposes a proper plaid_sync_commit(item_id, rows,
    #       next_cursor) stored procedure, replace this with a single atomic
    #       call.
    try:
        if rows_to_upsert:
            supabase.table("bank_transactions").upsert(
                rows_to_upsert, on_conflict="plaid_transaction_id"
            ).execute()

        # Mark removed transactions
        removed_ids = [
            r["transaction_id"]
            for r in removed
            if hasattr(r, "transaction_id")
            or (isinstance(r, dict) and r.get("transaction_id"))
        ]
        if removed_ids:
            supabase.table("bank_transactions").delete().in_(
                "plaid_transaction_id", removed_ids
            ).eq("user_id", user_id).execute()
    except Exception:
        # Leave cursor at starting_cursor so Plaid replays on next sync.
        logger.exception(
            "sync_item: upsert failed for item %s; cursor NOT advanced "
            "(will replay on next sync, dedup via plaid_transaction_id)",
            item["id"],
        )
        raise

    # Save cursor + last sync (only reached if upsert succeeded)
    supabase.table("plaid_items").update(
        {
            "cursor": cursor,
            "last_sync_at": datetime.now(timezone.utc).isoformat(),
            "status": "active",
            "error_message": None,
        }
    ).eq("id", item["id"]).execute()

    return {
        "added": len(added),
        "modified": len(modified),
        "removed": len(removed),
        "auto_matched": auto_matched_count,
    }


def sync_all_items(user_id: str, supabase) -> dict:
    """Sync every connected item for this user. Aggregates counts."""
    items = list_items(user_id, supabase)
    totals = {"added": 0, "modified": 0, "removed": 0, "auto_matched": 0}
    for it in items:
        try:
            result = sync_item(user_id, it["id"], supabase)
            for k, v in result.items():
                totals[k] += v
        except Exception as e:
            logger.error(f"sync failed for item {it['id']}: {e}")
            supabase.table("plaid_items").update(
                {"status": "error", "error_message": str(e)[:500]}
            ).eq("id", it["id"]).execute()
    return totals


# ── helpers ──────────────────────────────────────────────────────────────────


def _plaid_tx_to_dict(tx) -> dict:
    """Normalise a Plaid Transaction model into our dict shape.
    Plaid amounts are positive for debits (money out of the account)."""
    # Plaid SDK models support both attribute access and dict-like get
    def g(obj, key, default=None):
        if isinstance(obj, dict):
            return obj.get(key, default)
        return getattr(obj, key, default)

    raw = tx.to_dict() if hasattr(tx, "to_dict") else dict(tx)
    # JSON-safe (dates → strings)
    raw_json = _json_safe(raw)

    date_val = g(tx, "date")
    if hasattr(date_val, "isoformat"):
        date_val = date_val.isoformat()

    iso_currency = g(tx, "iso_currency_code") or g(tx, "unofficial_currency_code") or "USD"
    category_list = g(tx, "category") or []
    category = ", ".join(category_list) if isinstance(category_list, list) else str(category_list)

    merchant = g(tx, "merchant_name") or g(tx, "name")

    return {
        "plaid_transaction_id": g(tx, "transaction_id"),
        "plaid_account_id": g(tx, "account_id"),
        "amount": float(g(tx, "amount") or 0),
        "currency": iso_currency,
        "merchant_name": merchant,
        "transaction_date": date_val,
        "category": category,
        "pending": bool(g(tx, "pending") or False),
        "raw_json": raw_json,
    }


def _json_safe(obj):
    """Recursively convert dates/Decimals to JSON-friendly types."""
    from decimal import Decimal
    from datetime import date

    if isinstance(obj, dict):
        return {k: _json_safe(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_json_safe(v) for v in obj]
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    return obj
