"""Natural language search endpoint."""
import logging
from datetime import datetime
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from ..auth import get_current_user
from ..database import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/search", tags=["search"])

class SearchRequest(BaseModel):
    query: str

@router.post("/natural")
def natural_search(body: SearchRequest, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    from ..modules.intel.nl_search import parse_natural_query
    filters = parse_natural_query(body.query, datetime.now().strftime("%Y-%m-%d"))

    if not filters:
        return {"results": [], "filters": {}, "error": "Could not parse query"}

    # Build Supabase query from filters
    q = admin.table("expenses").select("*").eq("user_id", user_id)

    if filters.get("merchant"):
        q = q.ilike("merchant_name", f"%{filters['merchant']}%")
    if filters.get("category"):
        q = q.eq("category", filters["category"])
    if filters.get("min_amount"):
        q = q.gte("amount_total", filters["min_amount"])
    if filters.get("max_amount"):
        q = q.lte("amount_total", filters["max_amount"])
    if filters.get("start_date"):
        q = q.gte("expense_date", filters["start_date"])
    if filters.get("end_date"):
        q = q.lte("expense_date", filters["end_date"])
    if filters.get("expense_tag"):
        q = q.eq("expense_tag", filters["expense_tag"])
    if filters.get("status"):
        q = q.eq("status", filters["status"])
    if filters.get("location"):
        q = q.ilike("location_jurisdiction", f"%{filters['location']}%")

    sort_by = filters.get("sort_by", "date_desc")
    if sort_by == "amount_desc": q = q.order("amount_total", desc=True)
    elif sort_by == "amount_asc": q = q.order("amount_total")
    elif sort_by == "date_asc": q = q.order("expense_date")
    else: q = q.order("expense_date", desc=True)

    limit = min(filters.get("limit", 50), 100)
    q = q.limit(limit)

    result = q.execute()
    return {"results": result.data or [], "filters": filters, "count": len(result.data or [])}
