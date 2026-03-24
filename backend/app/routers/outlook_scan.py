"""Outlook receipt scanning endpoint — metadata only."""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user
from app.database import get_supabase_admin
from app.services.outlook_scanner import scan_outlook_metadata

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/outlook-scan", tags=["outlook"])


class ScanRequest(BaseModel):
    months: int = 6


@router.post("/scan")
async def scan_outlook(
    body: ScanRequest,
    current_user: dict = Depends(get_current_user),
):
    """Scan Outlook for receipt and invoice emails (metadata only)."""
    user_id = current_user["user"]["id"]
    admin = get_supabase_admin()

    user_row = (
        admin.table("users")
        .select("microsoft_outlook_token")
        .eq("id", user_id)
        .single()
        .execute()
    )

    if not user_row.data or not user_row.data.get("microsoft_outlook_token"):
        raise HTTPException(
            status_code=400,
            detail="Microsoft account not connected. Connect in Settings first.",
        )

    token_data = user_row.data["microsoft_outlook_token"]
    access_token = token_data.get("access_token")

    if not access_token:
        raise HTTPException(
            status_code=400,
            detail="Microsoft token expired. Reconnect in Settings.",
        )

    results = await scan_outlook_metadata(access_token=access_token, months=body.months)
    return {"results": results, "count": len(results)}
