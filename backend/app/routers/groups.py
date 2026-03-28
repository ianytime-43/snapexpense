"""
Expense groups (trips) router.
Prefix: /groups
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import get_current_user
from ..database import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/groups", tags=["groups"])


class GroupCreate(BaseModel):
    title: str
    trip_date_start: Optional[str] = None
    trip_date_end: Optional[str] = None


class GroupUpdate(BaseModel):
    title: Optional[str] = None
    trip_date_start: Optional[str] = None
    trip_date_end: Optional[str] = None


class AddExpensesBody(BaseModel):
    expense_ids: list[str]


def _compute_group_summary(group: dict) -> dict:
    """Compute expense_count and total_amount from nested expenses."""
    expenses = group.get("expenses") or []
    expense_count = len(expenses)
    total_amount = sum(float(e.get("amount_total") or 0) for e in expenses)
    result = {k: v for k, v in group.items() if k != "expenses"}
    result["expense_count"] = expense_count
    result["total_amount"] = round(total_amount, 2)
    return result


@router.get("")
def list_groups(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()
    try:
        result = (
            admin.table("expense_groups")
            .select("*, expenses(id, amount_total)")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        groups = result.data or []
        return [_compute_group_summary(g) for g in groups]
    except Exception as exc:
        logger.error("list_groups error: %s", exc)
        raise HTTPException(500, "Failed to load groups")


@router.post("")
def create_group(body: GroupCreate, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()
    try:
        data = {
            "user_id": user_id,
            "title": body.title,
            "trip_date_start": body.trip_date_start,
            "trip_date_end": body.trip_date_end,
        }
        result = admin.table("expense_groups").insert(data).execute()
        if not result.data:
            raise HTTPException(500, "Failed to create group")
        group = result.data[0]
        group["expense_count"] = 0
        group["total_amount"] = 0.0
        return group
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("create_group error: %s", exc)
        raise HTTPException(500, "Failed to create group")


@router.patch("/{group_id}")
def update_group(
    group_id: str,
    body: GroupUpdate,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    # Verify ownership
    existing = (
        admin.table("expense_groups")
        .select("id, user_id")
        .eq("id", group_id)
        .maybe_single()
        .execute()
    )
    if not existing or not existing.data:
        raise HTTPException(404, "Group not found")
    if existing.data["user_id"] != user_id:
        raise HTTPException(403, "Not your group")

    update_data = {}
    if body.title is not None:
        update_data["title"] = body.title
    if body.trip_date_start is not None:
        update_data["trip_date_start"] = body.trip_date_start
    if body.trip_date_end is not None:
        update_data["trip_date_end"] = body.trip_date_end

    if not update_data:
        raise HTTPException(400, "No fields to update")

    result = (
        admin.table("expense_groups")
        .update(update_data)
        .eq("id", group_id)
        .execute()
    )
    return result.data[0] if result.data else {}


@router.delete("/{group_id}")
def delete_group(group_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    existing = (
        admin.table("expense_groups")
        .select("id, user_id")
        .eq("id", group_id)
        .maybe_single()
        .execute()
    )
    if not existing or not existing.data:
        raise HTTPException(404, "Group not found")
    if existing.data["user_id"] != user_id:
        raise HTTPException(403, "Not your group")

    admin.table("expense_groups").delete().eq("id", group_id).execute()
    return {"deleted": True}


@router.get("/{group_id}")
def get_group(group_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()
    try:
        result = (
            admin.table("expense_groups")
            .select("*, expenses(*, receipts(*))")
            .eq("id", group_id)
            .maybe_single()
            .execute()
        )
        if not result or not result.data:
            raise HTTPException(404, "Group not found")
        group = result.data
        if group["user_id"] != user_id:
            raise HTTPException(403, "Not your group")

        expenses = group.get("expenses") or []
        group["expense_count"] = len(expenses)
        group["total_amount"] = round(sum(float(e.get("amount_total") or 0) for e in expenses), 2)
        return group
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("get_group error: %s", exc)
        raise HTTPException(500, "Failed to load group")


@router.post("/{group_id}/expenses")
def add_expenses_to_group(
    group_id: str,
    body: AddExpensesBody,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    # Verify group ownership
    existing = (
        admin.table("expense_groups")
        .select("id, user_id")
        .eq("id", group_id)
        .maybe_single()
        .execute()
    )
    if not existing or not existing.data:
        raise HTTPException(404, "Group not found")
    if existing.data["user_id"] != user_id:
        raise HTTPException(403, "Not your group")

    # Verify ownership of each expense
    for expense_id in body.expense_ids:
        exp_check = (
            admin.table("expenses")
            .select("id, user_id")
            .eq("id", expense_id)
            .maybe_single()
            .execute()
        )
        if not exp_check or not exp_check.data:
            raise HTTPException(404, f"Expense {expense_id} not found")
        if exp_check.data["user_id"] != user_id:
            raise HTTPException(403, f"Expense {expense_id} not yours")

    # Patch each expense
    count = 0
    for expense_id in body.expense_ids:
        admin.table("expenses").update({"group_id": group_id}).eq("id", expense_id).execute()
        count += 1

    return {"added": count}


@router.delete("/{group_id}/expenses/{expense_id}")
def remove_expense_from_group(
    group_id: str,
    expense_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    # Verify group ownership
    existing = (
        admin.table("expense_groups")
        .select("id, user_id")
        .eq("id", group_id)
        .maybe_single()
        .execute()
    )
    if not existing or not existing.data:
        raise HTTPException(404, "Group not found")
    if existing.data["user_id"] != user_id:
        raise HTTPException(403, "Not your group")

    # Verify expense ownership
    exp_check = (
        admin.table("expenses")
        .select("id, user_id")
        .eq("id", expense_id)
        .maybe_single()
        .execute()
    )
    if not exp_check or not exp_check.data:
        raise HTTPException(404, "Expense not found")
    if exp_check.data["user_id"] != user_id:
        raise HTTPException(403, "Not your expense")

    admin.table("expenses").update({"group_id": None}).eq("id", expense_id).execute()
    return {"removed": True}
