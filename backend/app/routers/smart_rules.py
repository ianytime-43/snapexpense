"""Smart Rules router — CRUD + test + apply-to-existing."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field

from ..auth import get_current_user
from ..database import get_supabase_admin
from ..modules.smart_rules.matcher import (
    VALID_CATEGORIES,
    apply_rule_to_expense,
    list_active_rules,
    match_rule,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/smart-rules", tags=["smart-rules"])


class RuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    merchant_pattern: str = Field(min_length=1, max_length=200)
    category: Optional[str] = None
    is_tax_deductible: bool = False
    is_active: bool = True
    priority: int = 100


class RuleUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: Optional[str] = None
    merchant_pattern: Optional[str] = None
    category: Optional[str] = None
    is_tax_deductible: Optional[bool] = None
    is_active: Optional[bool] = None
    priority: Optional[int] = None


class RuleTestBody(BaseModel):
    merchant: str
    amount: Optional[float] = None


def _validate_category(cat: Optional[str]) -> None:
    if cat and cat not in VALID_CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid category. Allowed: {sorted(VALID_CATEGORIES)}",
        )


@router.get("")
@router.get("/")
def list_rules(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()
    try:
        result = (
            admin.table("smart_rules")
            .select("*")
            .eq("user_id", user_id)
            .order("priority")
            .execute()
        )
        return {"rules": result.data or []}
    except Exception as exc:
        logger.exception("list_rules failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to list rules") from exc


@router.post("", status_code=201)
@router.post("/", status_code=201)
def create_rule(body: RuleCreate, current_user: dict = Depends(get_current_user)):
    _validate_category(body.category)
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()
    payload = {
        "user_id": user_id,
        "name": body.name,
        "merchant_pattern": body.merchant_pattern,
        "category": body.category,
        "is_tax_deductible": body.is_tax_deductible,
        "is_active": body.is_active,
        "priority": body.priority,
    }
    result = admin.table("smart_rules").insert(payload).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create rule")
    return result.data[0]


@router.patch("/{rule_id}")
def update_rule(
    rule_id: str,
    body: RuleUpdate,
    current_user: dict = Depends(get_current_user),
):
    _validate_category(body.category)
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    existing = (
        admin.table("smart_rules")
        .select("id")
        .eq("id", rule_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Rule not found")

    patch = {k: v for k, v in body.model_dump(exclude_unset=True).items()}
    if not patch:
        return existing.data[0]
    from datetime import datetime, timezone
    patch["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = (
        admin.table("smart_rules")
        .update(patch)
        .eq("id", rule_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update rule")
    return result.data[0]


@router.delete("/{rule_id}", status_code=204)
def delete_rule(rule_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()
    existing = (
        admin.table("smart_rules")
        .select("id")
        .eq("id", rule_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not existing.data:
        raise HTTPException(status_code=404, detail="Rule not found")
    admin.table("smart_rules").delete().eq("id", rule_id).eq("user_id", user_id).execute()
    return None


@router.post("/test")
def test_rule(body: RuleTestBody, current_user: dict = Depends(get_current_user)):
    """Preview which rule would match a given merchant string."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()
    rules = list_active_rules(admin, user_id)
    matched = match_rule(rules, body.merchant)
    return {
        "matched": matched is not None,
        "rule": matched,
        "checked_count": len(rules),
    }


@router.post("/apply-to-existing")
def apply_to_existing(current_user: dict = Depends(get_current_user)):
    """Re-run active rules over uncategorized existing expenses. Returns update count."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()
    rules = list_active_rules(admin, user_id)
    if not rules:
        return {"updated": 0, "rules_evaluated": 0}

    try:
        exp_result = (
            admin.table("expenses")
            .select("id, merchant_name, category, deduction_pct")
            .eq("user_id", user_id)
            .execute()
        )
        expenses = exp_result.data or []
    except Exception as exc:
        logger.exception("apply_to_existing fetch failed: %s", exc)
        raise HTTPException(status_code=500, detail="Failed to load expenses") from exc

    updated = 0
    for exp in expenses:
        # Only touch expenses with no category yet (or 'other').
        cur_cat = exp.get("category")
        if cur_cat and cur_cat != "other":
            continue
        merchant = exp.get("merchant_name") or ""
        rule = match_rule(rules, merchant)
        if not rule:
            continue
        patch: dict = {"applied_rule_id": rule.get("id")}
        if rule.get("category"):
            patch["category"] = rule["category"]
        if rule.get("is_tax_deductible") and exp.get("deduction_pct") in (None, 0):
            patch["deduction_pct"] = 100
        try:
            admin.table("expenses").update(patch).eq("id", exp["id"]).eq("user_id", user_id).execute()
            updated += 1
        except Exception as exc:
            logger.warning("apply_to_existing update failed expense=%s: %s", exp.get("id"), exc)

    return {"updated": updated, "rules_evaluated": len(rules)}
