"""
Gmail receipt scanning endpoint.
Uses metadata-only scope — reads subject + sender, NOT email body.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import get_current_user
from ..database import get_supabase_admin
from ..services.gmail_scanner import scan_gmail_metadata

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/gmail", tags=["gmail"])


class ScanRequest(BaseModel):
    months: int = 6


@router.post("/scan")
async def scan_gmail(
    body: ScanRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Scan Gmail for receipt and invoice emails.
    Returns metadata (subject, sender, date) — does not read email content.
    """
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    # Get user's Google OAuth token
    user_row = admin.table("users").select("google_calendar_token").eq("id", user_id).single().execute()

    if not user_row.data or not user_row.data.get("google_calendar_token"):
        raise HTTPException(status_code=400, detail="Google account not connected. Connect in Settings first.")

    token_data = user_row.data["google_calendar_token"]
    access_token = token_data.get("access_token")

    if not access_token:
        raise HTTPException(status_code=400, detail="Google token expired. Reconnect in Settings.")

    results = await scan_gmail_metadata(
        access_token=access_token,
        months=body.months,
    )

    return {"results": results, "count": len(results)}
