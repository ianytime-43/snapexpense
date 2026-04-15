import logging
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator

from ..auth import get_current_user
from ..database import get_supabase_admin

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/expenses", tags=["expenses"])

VALID_STATUSES = {"draft", "confirmed", "submitted", "reimbursed"}
VALID_PAYMENT_METHODS = {"personal_card", "corporate_card", "cash"}


class ExpenseUpdate(BaseModel):
    status: Optional[str] = None
    merchant_name: Optional[str] = None
    merchant_address: Optional[str] = None
    expense_date: Optional[str] = None
    expense_time: Optional[str] = None
    amount_total: Optional[float] = None
    amount_tax: Optional[float] = None
    amount_tip: Optional[float] = None
    currency: Optional[str] = None
    payment_method: Optional[str] = None
    card_last_four: Optional[str] = None
    category: Optional[str] = None
    business_purpose: Optional[str] = None
    client_name: Optional[str] = None
    project_name: Optional[str] = None
    notes: Optional[str] = None

    @field_validator(
        "merchant_name",
        "merchant_address",
        "expense_date",
        "expense_time",
        "currency",
        "card_last_four",
        "category",
        "business_purpose",
        "client_name",
        "project_name",
        "notes",
        mode="before",
    )
    @classmethod
    def empty_str_to_none(cls, v: object) -> object:
        if v == "":
            return None
        return v

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_STATUSES:
            raise ValueError(f"status must be one of {VALID_STATUSES}")
        return v

    @field_validator("payment_method")
    @classmethod
    def validate_payment_method(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_PAYMENT_METHODS:
            return None
        return v


@router.get("/by-jurisdiction")
def expenses_by_jurisdiction(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user"].id
    admin = get_supabase_admin()
    try:
        result = admin.table("expenses").select("*").eq("user_id", user_id).execute()
    except Exception:
        result = type("obj", (object,), {"data": []})()
    groups: dict = defaultdict(list)
    for exp in [e for e in (result.data or []) if e.get("location_jurisdiction") is not None]:
        groups[exp["location_jurisdiction"]].append(exp)
    return [
        {
            "jurisdiction": j,
            "expenses": exps,
            "total_amount": sum(e["amount_total"] or 0 for e in exps),
            "count": len(exps),
        }
        for j, exps in sorted(groups.items())
    ]


@router.get("")
def list_expenses(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user"].id
    admin = get_supabase_admin()
    result = (
        admin.table("expenses")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data


@router.get("/{expense_id}")
def get_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user"].id
    admin = get_supabase_admin()
    result = (
        admin.table("expenses")
        .select("*, receipts(*), attendees(*)")
        .eq("id", expense_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Expense not found")
    return result.data


@router.patch("/{expense_id}")
def update_expense(
    expense_id: str,
    update: ExpenseUpdate,
    current_user: dict = Depends(get_current_user),
):
    user_id = current_user["user"].id
    admin = get_supabase_admin()

    # Verify ownership
    check = (
        admin.table("expenses")
        .select("id")
        .eq("id", expense_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=404, detail="Expense not found")

    update_data = {k: v for k, v in update.model_dump().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = (
        admin.table("expenses").update(update_data).eq("id", expense_id).execute()
    )
    updated = result.data[0] if result.data else {}

    # Learn vendor preferences when expense is confirmed
    if update.status == "confirmed":
        try:
            from app.modules.intel.vendor_memory import learn_vendor
            learn_vendor(
                admin, user_id,
                merchant_name=updated.get("merchant_name", ""),
                category=updated.get("category"),
                expense_tag=updated.get("expense_tag"),
                tax_rate=updated.get("tax_rate_applied"),
                payment_method=updated.get("payment_method"),
            )
        except Exception as exc:
            # Non-fatal: vendor memory learning is a background optimization.
            logger.warning("Vendor memory learn failed for user=%s: %s", user_id, exc)

    return updated


@router.delete("/{expense_id}")
def delete_expense(expense_id: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user"].id
    admin = get_supabase_admin()

    check = (
        admin.table("expenses")
        .select("id")
        .eq("id", expense_id)
        .eq("user_id", user_id)
        .maybe_single()
        .execute()
    )
    if not check.data:
        raise HTTPException(status_code=404, detail="Expense not found")

    admin.table("expenses").delete().eq("id", expense_id).execute()
    return {"deleted": True}
