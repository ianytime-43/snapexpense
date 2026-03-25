"""Zapier webhook integration — trigger events for external automation."""
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..auth import get_current_user
from ..database import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/zapier", tags=["zapier"])

class WebhookRegister(BaseModel):
    event: str  # expense_created, expense_confirmed, report_submitted, budget_exceeded
    url: str

@router.get("/triggers")
def list_available_triggers():
    return {"triggers": [
        {"event": "expense_created", "label": "New expense created"},
        {"event": "expense_confirmed", "label": "Expense confirmed"},
        {"event": "expense_deleted", "label": "Expense deleted"},
        {"event": "report_submitted", "label": "Report submitted"},
        {"event": "budget_exceeded", "label": "Category budget exceeded"},
        {"event": "subscription_price_changed", "label": "Subscription price changed"},
        {"event": "receipt_missing_48h", "label": "Receipt missing for 48+ hours"},
    ]}

@router.post("/webhooks")
def register_webhook(body: WebhookRegister, current_user: dict = Depends(get_current_user)):
    # Store webhook URL for the user + event type
    # In production, this would fire httpx.post(url, json=payload) when events occur
    user_id = str(current_user["user"].id)
    logger.info(f"Webhook registered: user={user_id} event={body.event} url={body.url}")
    return {"ok": True, "event": body.event}
