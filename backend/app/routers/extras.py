"""Extra features: warranties, templates, forecasting, alerts."""
import logging
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional
from ..auth import get_current_user
from ..database import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(tags=["extras"])

# --- Templates ---
class TemplateCreate(BaseModel):
    name: str
    merchant_name: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    expense_tag: str = "business"

@router.get("/templates")
def list_templates(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user"]["id"]
    admin = get_supabase_admin()
    result = admin.table("expense_templates").select("*").eq("user_id", user_id).order("use_count", desc=True).execute()
    return {"templates": result.data or []}

@router.post("/templates")
def create_template(body: TemplateCreate, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user"]["id"]
    admin = get_supabase_admin()
    data = {"user_id": user_id, **body.model_dump()}
    result = admin.table("expense_templates").insert(data).execute()
    return result.data[0] if result.data else {}

@router.post("/templates/{template_id}/use")
def use_template(template_id: str, current_user: dict = Depends(get_current_user)):
    """Create an expense from a template."""
    user_id = current_user["user"]["id"]
    admin = get_supabase_admin()
    template = admin.table("expense_templates").select("*").eq("id", template_id).eq("user_id", user_id).single().execute()
    if not template.data:
        from fastapi import HTTPException
        raise HTTPException(404, "Template not found")
    t = template.data
    from datetime import date
    expense = {
        "user_id": user_id, "merchant_name": t.get("merchant_name"), "amount_total": t.get("amount"),
        "category": t.get("category"), "expense_tag": t.get("expense_tag", "business"),
        "expense_date": date.today().isoformat(), "status": "draft", "currency": "CAD",
    }
    result = admin.table("expenses").insert(expense).execute()
    admin.table("expense_templates").update({"use_count": t.get("use_count", 0) + 1}).eq("id", template_id).execute()
    return {"expense_id": result.data[0]["id"]} if result.data else {}

# --- Warranties ---
@router.get("/warranties")
def list_warranties(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user"]["id"]
    admin = get_supabase_admin()
    result = admin.table("warranties").select("*").eq("user_id", user_id).order("warranty_expires").execute()
    return {"warranties": result.data or []}

# --- Alerts ---
@router.get("/alerts/missing-receipts")
def missing_receipt_alerts(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user"]["id"]
    admin = get_supabase_admin()
    from ..modules.intel.missing_receipt_alerts import get_missing_receipt_summary
    return get_missing_receipt_summary(admin, user_id)

# --- Spend Forecast ---
@router.get("/forecast")
def spend_forecast(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user"]["id"]
    admin = get_supabase_admin()
    from datetime import datetime, timedelta
    from collections import defaultdict

    # Get last 6 months of expenses by category
    start = (datetime.now() - timedelta(days=180)).strftime("%Y-%m-%d")
    expenses = admin.table("expenses").select("amount_total, category, expense_date").eq("user_id", user_id).gte("expense_date", start).execute()

    cat_monthly = defaultdict(list)
    for e in (expenses.data or []):
        cat = e.get("category") or "Other"
        cat_monthly[cat].append(float(e.get("amount_total") or 0))

    forecasts = []
    for cat, amounts in cat_monthly.items():
        avg = sum(amounts) / max(len(amounts), 1)
        quarterly = avg * 3 / max(len(set(e.get("expense_date", "")[:7] for e in (expenses.data or []) if e.get("category") == cat)), 1) * 3
        forecasts.append({"category": cat, "monthly_avg": round(avg, 2), "quarterly_estimate": round(quarterly, 2)})

    return {"forecasts": sorted(forecasts, key=lambda f: f["monthly_avg"], reverse=True)}
