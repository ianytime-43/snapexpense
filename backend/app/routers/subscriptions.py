"""Recurring expense detection and subscriptions management."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from ..auth import get_current_user
from ..database import get_supabase_admin
from ..modules.intel.recurring_detector import detect_recurring

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/subscriptions", tags=["subscriptions"])


class SubscriptionCreate(BaseModel):
    merchant_name: str
    amount: Optional[float] = None
    currency: str = "CAD"
    frequency: str = "monthly"
    expense_tag: str = "business"
    last_seen_date: Optional[str] = None
    next_expected_date: Optional[str] = None
    previous_amount: Optional[float] = None


@router.get("/detect")
def detect_subscriptions(
    current_user: dict = Depends(get_current_user),
):
    """Scan expense history and return detected recurring patterns."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()
    try:
        results = detect_recurring(admin, user_id)
        return {"subscriptions": results, "count": len(results)}
    except Exception as exc:
        logger.exception("Error detecting recurring expenses: %s", exc)
        raise HTTPException(status_code=500, detail="Detection failed") from exc


@router.get("")
def list_subscriptions(
    current_user: dict = Depends(get_current_user),
):
    """List saved recurring expenses for the current user."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()
    result = (
        admin.table("recurring_expenses")
        .select("*")
        .eq("user_id", user_id)
        .eq("is_active", True)
        .order("amount", desc=True)
        .execute()
    )
    return {"subscriptions": result.data or []}


@router.post("", status_code=201)
def save_subscription(
    body: SubscriptionCreate,
    current_user: dict = Depends(get_current_user),
):
    """Save a detected subscription to the recurring_expenses table."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    # Upsert by user_id + merchant_name to avoid duplicates
    existing = (
        admin.table("recurring_expenses")
        .select("id")
        .eq("user_id", user_id)
        .eq("merchant_name", body.merchant_name)
        .execute()
    )

    payload = {
        "user_id": user_id,
        "merchant_name": body.merchant_name,
        "amount": body.amount,
        "currency": body.currency,
        "frequency": body.frequency,
        "expense_tag": body.expense_tag,
        "last_seen_date": body.last_seen_date,
        "next_expected_date": body.next_expected_date,
        "previous_amount": body.previous_amount,
        "is_active": True,
    }

    if existing.data:
        record_id = existing.data[0]["id"]
        result = (
            admin.table("recurring_expenses")
            .update(payload)
            .eq("id", record_id)
            .execute()
        )
    else:
        result = admin.table("recurring_expenses").insert(payload).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save subscription")

    return result.data[0]


@router.delete("/{subscription_id}", status_code=204)
def delete_subscription(
    subscription_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Remove (soft-delete) a saved subscription."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    # Verify ownership
    existing = (
        admin.table("recurring_expenses")
        .select("id")
        .eq("id", subscription_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Subscription not found")

    admin.table("recurring_expenses").update({"is_active": False}).eq("id", subscription_id).execute()
    return None
