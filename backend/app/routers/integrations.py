"""Accounting software integration endpoints."""
import logging
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from ..auth import get_current_user
from ..database import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/integrations", tags=["integrations"])

class ConnectRequest(BaseModel):
    platform: str
    access_token: str = ""
    refresh_token: str = ""
    company_name: str = ""

@router.get("/connections")
def list_connections(current_user: dict = Depends(get_current_user)):
    user_id = current_user["user"]["id"]
    admin = get_supabase_admin()
    result = admin.table("integration_connections").select("platform, company_name, connected_at, last_synced_at").eq("user_id", user_id).execute()
    return {"connections": result.data or []}

@router.post("/connect")
def connect_platform(body: ConnectRequest, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user"]["id"]
    admin = get_supabase_admin()
    data = {"user_id": user_id, "platform": body.platform, "access_token": body.access_token, "refresh_token": body.refresh_token, "company_name": body.company_name}
    admin.table("integration_connections").upsert(data, on_conflict="user_id,platform").execute()
    return {"ok": True}

@router.delete("/disconnect/{platform}")
def disconnect_platform(platform: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user"]["id"]
    admin = get_supabase_admin()
    admin.table("integration_connections").delete().eq("user_id", user_id).eq("platform", platform).execute()
    admin.table("category_mappings").delete().eq("user_id", user_id).eq("platform", platform).execute()
    return {"ok": True}

@router.get("/mappings/{platform}")
def get_mappings(platform: str, current_user: dict = Depends(get_current_user)):
    user_id = current_user["user"]["id"]
    admin = get_supabase_admin()
    result = admin.table("category_mappings").select("*").eq("user_id", user_id).eq("platform", platform).execute()
    if not result.data:
        from ..modules.integrations.quickbooks import QuickBooksAdapter
        defaults = QuickBooksAdapter().get_default_mappings()
        return {"mappings": [{"snap_category": k, "platform_category": v} for k, v in defaults.items()], "is_default": True}
    return {"mappings": result.data, "is_default": False}
