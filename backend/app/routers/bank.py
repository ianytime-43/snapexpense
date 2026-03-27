"""Bank transaction import, matching, and coverage endpoints."""
import csv
import io
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from pydantic import BaseModel

from ..auth import get_current_user
from ..database import get_supabase_admin
from ..modules.intel.transaction_matcher import match_transactions

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/bank", tags=["bank"])


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
    user_id = user.id

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
            .eq("user_id", user.id)
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
        .eq("user_id", user.id)
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
        .eq("user_id", user.id)
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
        .eq("user_id", user.id)
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
        .eq("user_id", user.id)
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
        .eq("user_id", user.id)
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
