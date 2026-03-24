"""Expense splitting endpoint."""

import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import get_current_user
from ..database import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/expenses", tags=["splits"])


class SplitRequest(BaseModel):
    business_percentage: float  # 0-100
    business_tag: str = "business"  # or "work"


@router.post("/{expense_id}/split")
def split_expense(
    expense_id: str,
    body: SplitRequest,
    current_user: dict = Depends(get_current_user),
):
    """Split an expense into business and personal portions."""
    user_id = current_user["user"]["id"]
    admin = get_supabase_admin()

    # Get original expense
    result = admin.table("expenses").select("*").eq("id", expense_id).eq("user_id", user_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Expense not found")

    original = result.data
    if original.get("split_from_id"):
        raise HTTPException(status_code=400, detail="Cannot split an already-split expense")

    biz_pct = body.business_percentage / 100
    personal_pct = 1 - biz_pct
    total = float(original.get("amount_total") or 0)
    tax = float(original.get("amount_tax") or 0)
    tip = float(original.get("amount_tip") or 0)

    # Create business portion
    biz_data = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "split_from_id": expense_id,
        "split_percentage": round(body.business_percentage, 2),
        "expense_tag": body.business_tag,
        "amount_total": round(total * biz_pct, 2),
        "amount_tax": round(tax * biz_pct, 2),
        "amount_tip": round(tip * biz_pct, 2),
        "merchant_name": original.get("merchant_name"),
        "expense_date": original.get("expense_date"),
        "expense_time": original.get("expense_time"),
        "category": original.get("category"),
        "currency": original.get("currency", "CAD"),
        "payment_method": original.get("payment_method"),
        "status": "draft",
        "business_purpose": original.get("business_purpose"),
        "client_name": original.get("client_name"),
        "location_jurisdiction": original.get("location_jurisdiction"),
    }

    # Create personal portion
    personal_data = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "split_from_id": expense_id,
        "split_percentage": round(100 - body.business_percentage, 2),
        "expense_tag": "personal",
        "amount_total": round(total * personal_pct, 2),
        "amount_tax": round(tax * personal_pct, 2),
        "amount_tip": round(tip * personal_pct, 2),
        "merchant_name": original.get("merchant_name"),
        "expense_date": original.get("expense_date"),
        "expense_time": original.get("expense_time"),
        "category": original.get("category"),
        "currency": original.get("currency", "CAD"),
        "payment_method": original.get("payment_method"),
        "status": "draft",
        "location_jurisdiction": original.get("location_jurisdiction"),
    }

    # Insert both
    admin.table("expenses").insert(biz_data).execute()
    admin.table("expenses").insert(personal_data).execute()

    # Delete original
    admin.table("expenses").delete().eq("id", expense_id).execute()

    return {
        "business": biz_data,
        "personal": personal_data,
    }
