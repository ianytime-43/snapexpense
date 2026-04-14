"""Outlook receipt scanning endpoint — metadata only."""

import logging

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.auth import get_current_user
from app.config import settings
from app.database import get_supabase_admin
from app.services.outlook_scanner import scan_outlook_metadata

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/outlook-scan", tags=["outlook"])

MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
MS_REFRESH_SCOPE = (
    "https://graph.microsoft.com/Mail.Read "
    "https://graph.microsoft.com/Calendars.Read "
    "offline_access User.Read"
)


async def _refresh_microsoft_token(refresh_token: str) -> dict | None:
    """Refresh an expired Microsoft access token. Returns full token response or None."""
    if not (settings.microsoft_oauth_client_id and settings.microsoft_oauth_client_secret):
        return None
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                MS_TOKEN_URL,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": settings.microsoft_oauth_client_id,
                    "client_secret": settings.microsoft_oauth_client_secret,
                    "scope": MS_REFRESH_SCOPE,
                },
                timeout=10,
            )
            if resp.status_code == 200:
                return resp.json()
            logger.warning(
                "Microsoft token refresh failed: %s %s",
                resp.status_code, resp.text[:200],
            )
            return None
    except Exception as exc:
        logger.warning("Microsoft token refresh error: %s", exc)
        return None


class ScanRequest(BaseModel):
    months: int = 6


@router.post("/scan")
async def scan_outlook(
    body: ScanRequest,
    current_user: dict = Depends(get_current_user),
):
    """Scan Outlook for receipt and invoice emails (metadata only)."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    # NOTE: column is `outlook_calendar_token` — same JSONB used by the calendar
    # OAuth callback. Older code referenced a non-existent `microsoft_outlook_token`.
    user_row = (
        admin.table("users")
        .select("outlook_calendar_token")
        .eq("id", user_id)
        .single()
        .execute()
    )

    if not user_row.data or not user_row.data.get("outlook_calendar_token"):
        raise HTTPException(
            status_code=400,
            detail="Microsoft account not connected. Connect in Settings first.",
        )

    token_data = user_row.data["outlook_calendar_token"]
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")

    if not access_token:
        raise HTTPException(
            status_code=400,
            detail="Microsoft token expired. Reconnect in Settings.",
        )

    results = await scan_outlook_metadata(access_token=access_token, months=body.months)

    # If the scanner reports a 401, try refreshing the token once.
    if (
        results
        and len(results) == 1
        and results[0].get("email_id") == "error"
        and "401" in str(results[0].get("subject", ""))
    ):
        if not refresh_token:
            raise HTTPException(
                status_code=400,
                detail="Microsoft token expired. Please disconnect and reconnect Outlook in Settings.",
            )
        refreshed = await _refresh_microsoft_token(refresh_token)
        if not refreshed or not refreshed.get("access_token"):
            raise HTTPException(
                status_code=400,
                detail="Microsoft token expired. Please disconnect and reconnect Outlook in Settings.",
            )
        # Persist refreshed token (preserve refresh_token if MS didn't rotate it)
        merged = {**token_data, **refreshed}
        if "refresh_token" not in refreshed:
            merged["refresh_token"] = refresh_token
        try:
            admin.table("users").update(
                {"outlook_calendar_token": merged}
            ).eq("id", user_id).execute()
        except Exception as exc:
            logger.warning("Could not persist refreshed Outlook token: %s", exc)

        results = await scan_outlook_metadata(
            access_token=refreshed["access_token"], months=body.months
        )

    return {"results": results, "count": len(results)}
