"""Bank transaction import, matching, and coverage endpoints.

Includes:
  - CSV import + manual matching (legacy)
  - Plaid integration: link tokens, public-token exchange, sync, item management
  - Per-transaction actions: match / convert / dismiss
"""
import csv
import io
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile, File
from pydantic import BaseModel

from ..auth import get_current_user
from ..database import get_supabase_admin
from ..modules.intel.transaction_matcher import match_transactions
from ..modules.bank import client as plaid_client
from ..modules.bank import service as plaid_service
from ..modules.bank.matching import rank_candidates
from ..modules.bank.models import (
    LinkTokenResponse,
    ExchangeTokenRequest,
    ExchangeTokenResponse,
    SyncRequest,
    SyncResponse,
    MatchRequest,
    ConvertRequest,
    CandidatesResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/bank", tags=["bank"])


def _user_id(user) -> str:
    """Compatibility shim — get_current_user returns either a dict or a Supabase user."""
    if isinstance(user, dict) and "user" in user:
        return str(user["user"].id)
    return str(getattr(user, "id", user))


class TransactionIn(BaseModel):
    external_id: Optional[str] = None
    amount: float
    currency: str = "CAD"
    merchant_name: Optional[str] = None
    transaction_date: Optional[str] = None
    account_name: Optional[str] = None


class ImportRequest(BaseModel):
    transactions: list[TransactionIn]


class ManualMatchRequest(BaseModel):
    transaction_id: str
    expense_id: str


# ── POST /bank/import ─────────────────────────────────────────────────────────

@router.post("/import")
async def import_transactions(
    body: ImportRequest,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_admin),
):
    """Import a list of bank transactions (manual upload; Plaid integration ready).
    Runs fuzzy matching against the user's existing expenses and stores results."""
    user_id = _user_id(user)

    # Fetch user expenses for matching
    exp_res = (
        supabase.table("expenses")
        .select("id, amount_total, currency, merchant_name, expense_date")
        .eq("user_id", user_id)
        .execute()
    )
    expenses = exp_res.data or []

    tx_dicts = [t.model_dump() for t in body.transactions]
    matched = match_transactions(tx_dicts, expenses)

    rows = []
    for tx in matched:
        row = {
            "user_id": user_id,
            "external_id": tx.get("external_id"),
            "amount": tx["amount"],
            "currency": tx.get("currency", "CAD"),
            "merchant_name": tx.get("merchant_name"),
            "transaction_date": tx.get("transaction_date"),
            "account_name": tx.get("account_name"),
            "match_confidence": tx.get("match_confidence"),
        }
        matched_exp = tx.get("matched_expense")
        if matched_exp:
            row["matched_expense_id"] = matched_exp["id"]
        rows.append(row)

    # Upsert — on conflict (user_id, external_id) skip; nulls inserted for rows without external_id
    result = (
        supabase.table("bank_transactions")
        .upsert(rows, on_conflict="user_id,external_id", ignore_duplicates=True)
        .execute()
    )

    return {
        "imported": len(rows),
        "auto_matched": sum(1 for r in rows if r.get("matched_expense_id")),
    }


# ── POST /bank/import-csv ─────────────────────────────────────────────────────

@router.post("/import-csv")
async def import_csv(
    file: UploadFile = File(...),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_admin),
):
    """Import bank transactions from a CSV file.
    Expected columns (case-insensitive): date, amount, merchant/description, currency, account."""
    content = await file.read()
    text = content.decode("utf-8-sig")  # handle BOM
    reader = csv.DictReader(io.StringIO(text))

    # Normalise header names
    def _col(row: dict, *candidates: str) -> Optional[str]:
        for c in candidates:
            for k in row:
                if k.strip().lower() == c.lower():
                    return row[k].strip() or None
        return None

    transactions = []
    for row in reader:
        amount_str = _col(row, "amount", "debit", "credit") or "0"
        try:
            amount = float(amount_str.replace(",", "").replace("$", "").replace("(", "-").replace(")", ""))
        except ValueError:
            continue
        transactions.append(
            TransactionIn(
                external_id=_col(row, "id", "transaction_id", "ref"),
                amount=amount,
                currency=_col(row, "currency", "ccy") or "CAD",
                merchant_name=_col(row, "merchant", "description", "desc", "payee", "name"),
                transaction_date=_col(row, "date", "transaction_date", "posted_date"),
                account_name=_col(row, "account", "account_name"),
            )
        )

    return await import_transactions(
        ImportRequest(transactions=transactions), user=user, supabase=supabase
    )


# ── GET /bank/transactions ────────────────────────────────────────────────────

@router.get("/transactions")
async def list_transactions(
    unmatched_only: bool = False,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_admin),
):
    """List bank transactions with match status. Optionally filter to unmatched only."""
    try:
        result = (
            supabase.table("bank_transactions")
            .select("*, expenses(id, merchant_name, amount_total, expense_date, status)")
            .eq("user_id", _user_id(user))
            .order("transaction_date", desc=True)
            .execute()
        )
    except Exception:
        return []
    data = result.data or []
    if unmatched_only:
        data = [t for t in data if t.get("matched_expense_id") is None]
    return data


# ── POST /bank/match ──────────────────────────────────────────────────────────

@router.post("/match")
async def manual_match(
    body: ManualMatchRequest,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_admin),
):
    """Manually link a bank transaction to an expense."""
    # Verify the transaction belongs to this user
    tx_res = (
        supabase.table("bank_transactions")
        .select("id, user_id")
        .eq("id", body.transaction_id)
        .eq("user_id", _user_id(user))
        .single()
        .execute()
    )
    if not tx_res.data:
        raise HTTPException(status_code=404, detail="Transaction not found")

    # Verify the expense belongs to this user
    exp_res = (
        supabase.table("expenses")
        .select("id, user_id")
        .eq("id", body.expense_id)
        .eq("user_id", _user_id(user))
        .single()
        .execute()
    )
    if not exp_res.data:
        raise HTTPException(status_code=404, detail="Expense not found")

    result = (
        supabase.table("bank_transactions")
        .update({"matched_expense_id": body.expense_id, "match_confidence": 1.0})
        .eq("id", body.transaction_id)
        .execute()
    )
    return result.data[0] if result.data else {}


# ── POST /bank/unmatch ────────────────────────────────────────────────────────

@router.post("/unmatch/{transaction_id}")
async def unmatch_transaction(
    transaction_id: str,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_admin),
):
    """Remove the match link from a bank transaction."""
    result = (
        supabase.table("bank_transactions")
        .update({"matched_expense_id": None, "match_confidence": None})
        .eq("id", transaction_id)
        .eq("user_id", _user_id(user))
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return {"ok": True}


# ── GET /bank/coverage ────────────────────────────────────────────────────────

@router.get("/coverage")
async def get_coverage(
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_admin),
):
    """Receipt coverage statistics.
    Returns: total transactions, matched count, coverage %, unmatched expense count."""
    tx_res = (
        supabase.table("bank_transactions")
        .select("id, matched_expense_id")
        .eq("user_id", _user_id(user))
        .execute()
    )
    transactions = tx_res.data or []

    total_tx = len(transactions)
    matched_tx = sum(1 for t in transactions if t.get("matched_expense_id"))
    unmatched_tx = total_tx - matched_tx

    # Expenses without a linked bank transaction ("extra receipts")
    matched_expense_ids = {
        t["matched_expense_id"] for t in transactions if t.get("matched_expense_id")
    }
    exp_res = (
        supabase.table("expenses")
        .select("id")
        .eq("user_id", _user_id(user))
        .execute()
    )
    all_expenses = exp_res.data or []
    extra_receipts = sum(1 for e in all_expenses if e["id"] not in matched_expense_ids)

    coverage_pct = round((matched_tx / total_tx * 100), 1) if total_tx > 0 else 0.0

    return {
        "total_transactions": total_tx,
        "matched": matched_tx,
        "unmatched_transactions": unmatched_tx,
        "extra_receipts": extra_receipts,
        "coverage_pct": coverage_pct,
    }


# ╔══════════════════════════════════════════════════════════════════════════╗
# ║                       PLAID INTEGRATION ENDPOINTS                        ║
# ╚══════════════════════════════════════════════════════════════════════════╝


@router.get("/status")
def plaid_status(user=Depends(get_current_user), supabase=Depends(get_supabase_admin)):
    """Whether Plaid is configured and how many items the user has connected."""
    items = []
    if plaid_client.is_configured():
        items = plaid_service.list_items(_user_id(user), supabase)
    return {
        "configured": plaid_client.is_configured(),
        "items": items,
    }


@router.post("/link-token", response_model=LinkTokenResponse)
def create_link_token(user=Depends(get_current_user)):
    """Create a Plaid Link token for the frontend."""
    if not plaid_client.is_configured():
        raise HTTPException(status_code=503, detail="Plaid not configured")
    try:
        return plaid_service.create_link_token(_user_id(user))
    except Exception as e:
        logger.exception("link_token failed")
        raise HTTPException(status_code=502, detail=f"Plaid error: {e}")


@router.post("/exchange-token", response_model=ExchangeTokenResponse)
def exchange_token(
    body: ExchangeTokenRequest,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_admin),
):
    """Exchange a public_token for an access_token; persist the item."""
    if not plaid_client.is_configured():
        raise HTTPException(status_code=503, detail="Plaid not configured")
    try:
        return plaid_service.exchange_public_token(
            _user_id(user),
            body.public_token,
            body.institution_name,
            body.institution_id,
            supabase,
        )
    except Exception as e:
        logger.exception("exchange_token failed")
        raise HTTPException(status_code=502, detail=f"Plaid error: {e}")


@router.post("/sync", response_model=SyncResponse)
def sync(
    body: SyncRequest = SyncRequest(),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_admin),
):
    """Sync transactions for one item (if item_id given) or all of the user's items."""
    if not plaid_client.is_configured():
        raise HTTPException(status_code=503, detail="Plaid not configured")
    try:
        if body.item_id:
            return plaid_service.sync_item(_user_id(user), body.item_id, supabase)
        return plaid_service.sync_all_items(_user_id(user), supabase)
    except Exception as e:
        logger.exception("sync failed")
        raise HTTPException(status_code=502, detail=f"Plaid sync error: {e}")


@router.delete("/items/{item_row_id}")
def remove_item(
    item_row_id: str,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_admin),
):
    """Disconnect a connected institution."""
    ok = plaid_service.remove_item(_user_id(user), item_row_id, supabase)
    if not ok:
        raise HTTPException(status_code=404, detail="Item not found")
    return {"ok": True}


@router.post("/webhook")
async def plaid_webhook(request: Request, supabase=Depends(get_supabase_admin)):
    """Plaid webhook endpoint (no auth — verifies via Plaid signature in production).
    For sandbox we simply trigger a sync for the affected item."""
    payload = await request.json()
    logger.info(f"Plaid webhook: {payload.get('webhook_type')} / {payload.get('webhook_code')}")
    item_id = payload.get("item_id")
    if not item_id:
        return {"ok": True}

    # Find the matching plaid_items row → sync it
    res = (
        supabase.table("plaid_items")
        .select("id, user_id")
        .eq("item_id", item_id)
        .single()
        .execute()
    )
    if not res.data:
        return {"ok": True, "note": "unknown item"}

    try:
        plaid_service.sync_item(res.data["user_id"], res.data["id"], supabase)
    except Exception as e:
        logger.error(f"webhook sync failed: {e}")
    return {"ok": True}


# ── per-transaction actions ──────────────────────────────────────────────────


def _get_tx_or_404(tx_id: str, user_id: str, supabase) -> dict:
    res = (
        supabase.table("bank_transactions")
        .select("*")
        .eq("id", tx_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Transaction not found")
    return res.data


@router.get("/transactions/{tx_id}/candidates", response_model=CandidatesResponse)
def transaction_candidates(
    tx_id: str,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_admin),
):
    """Top 3 expense match candidates for a transaction."""
    user_id = _user_id(user)
    tx = _get_tx_or_404(tx_id, user_id, supabase)

    exp_res = (
        supabase.table("expenses")
        .select("id, merchant_name, amount_total, currency, expense_date")
        .eq("user_id", user_id)
        .execute()
    )
    expenses = exp_res.data or []
    top = rank_candidates(tx, expenses, top_n=3)
    return {
        "candidates": [
            {
                "id": c["id"],
                "merchant_name": c.get("merchant_name"),
                "amount_total": c.get("amount_total"),
                "expense_date": c.get("expense_date"),
                "score": c["score"],
            }
            for c in top
        ]
    }


@router.post("/transactions/{tx_id}/match")
def match_to_expense(
    tx_id: str,
    body: MatchRequest,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_admin),
):
    """Manually link a bank transaction to an expense."""
    user_id = _user_id(user)
    _get_tx_or_404(tx_id, user_id, supabase)

    exp_res = (
        supabase.table("expenses")
        .select("id")
        .eq("id", body.expense_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not exp_res.data:
        raise HTTPException(status_code=404, detail="Expense not found")

    supabase.table("bank_transactions").update(
        {
            "matched_expense_id": body.expense_id,
            "match_confidence": 1.0,
            "status": "matched",
        }
    ).eq("id", tx_id).eq("user_id", user_id).execute()
    return {"ok": True}


@router.post("/transactions/{tx_id}/convert")
def convert_to_expense(
    tx_id: str,
    body: ConvertRequest = ConvertRequest(),
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_admin),
):
    """Convert an unmatched transaction into a new expense (no receipt yet)."""
    user_id = _user_id(user)
    tx = _get_tx_or_404(tx_id, user_id, supabase)

    expense_row = {
        "user_id": user_id,
        "merchant_name": tx.get("merchant_name"),
        "amount_total": abs(float(tx.get("amount") or 0)),
        "currency": tx.get("currency") or "CAD",
        "expense_date": tx.get("transaction_date"),
        "status": "draft",
        "expense_tag": body.expense_tag or "business",
        "notes": body.notes or "Imported from bank transaction",
    }
    ins = supabase.table("expenses").insert(expense_row).execute()
    if not ins.data:
        raise HTTPException(status_code=500, detail="Failed to create expense")
    new_expense_id = ins.data[0]["id"]

    supabase.table("bank_transactions").update(
        {
            "matched_expense_id": new_expense_id,
            "match_confidence": 1.0,
            "status": "converted",
        }
    ).eq("id", tx_id).eq("user_id", user_id).execute()

    return {"ok": True, "expense_id": new_expense_id}


@router.post("/transactions/{tx_id}/dismiss")
def dismiss_transaction(
    tx_id: str,
    user=Depends(get_current_user),
    supabase=Depends(get_supabase_admin),
):
    """Mark a transaction as personal/ignore — hidden from unmatched list."""
    user_id = _user_id(user)
    _get_tx_or_404(tx_id, user_id, supabase)
    supabase.table("bank_transactions").update({"status": "dismissed"}).eq("id", tx_id).eq(
        "user_id", user_id
    ).execute()
    return {"ok": True}
