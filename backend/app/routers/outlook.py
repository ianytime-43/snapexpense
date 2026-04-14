"""
Microsoft Outlook Calendar OAuth 2.0 router.

Endpoints:
  GET    /api/outlook/connect     → {auth_url}
  GET    /api/outlook/callback    → redirects to frontend (no auth required)
  GET    /api/outlook/status      → {connected, email}
  DELETE /api/outlook/disconnect  → {disconnected: true}

Uses Microsoft Identity Platform v2.0 (common tenant — works for personal
Microsoft accounts and Azure AD / work accounts alike).
"""
import hashlib
import hmac
import logging
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from ..auth import get_current_user
from ..config import settings
from ..database import get_supabase_admin
from ..services.calendar_matching import stamp_expiry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/outlook", tags=["outlook"])

MS_AUTH_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/authorize"
MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"
GRAPH_ME_URL = "https://graph.microsoft.com/v1.0/me"
MS_SCOPE = "https://graph.microsoft.com/Calendars.Read https://graph.microsoft.com/User.Read offline_access"


# ── HMAC state helpers (same approach as Google calendar router) ───────────────

def _sign_state(user_id: str) -> str:
    secret = settings.supabase_service_role_key[:32].encode()
    sig = hmac.new(secret, f"outlook:{user_id}".encode(), hashlib.sha256).hexdigest()
    return f"{user_id}:{sig}"


def _verify_state(state: str) -> str:
    """Returns user_id if valid, raises HTTPException otherwise."""
    try:
        user_id, sig = state.rsplit(":", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid OAuth state")
    expected = _sign_state(user_id).split(":")[-1]
    if not hmac.compare_digest(sig, expected):
        raise HTTPException(status_code=400, detail="OAuth state signature mismatch")
    return user_id


# ── routes ────────────────────────────────────────────────────────────────────

@router.get("/connect")
def outlook_connect(current_user: dict = Depends(get_current_user)):
    """Return the Microsoft OAuth URL the frontend should redirect to."""
    if not settings.microsoft_oauth_client_id:
        raise HTTPException(status_code=503, detail="Outlook Calendar not configured")

    user_id = str(current_user["user"].id)
    state = _sign_state(user_id)

    params = {
        "client_id": settings.microsoft_oauth_client_id,
        "redirect_uri": settings.microsoft_oauth_redirect_uri,
        "response_type": "code",
        "scope": MS_SCOPE,
        "response_mode": "query",
        "state": state,
    }
    auth_url = MS_AUTH_URL + "?" + urlencode(params)
    return {"auth_url": auth_url}


@router.get("/callback")
def outlook_callback(
    code: str = Query(...),
    state: str = Query(...),
):
    """
    Microsoft redirects here after the user grants access.
    No Authorization header — verified via HMAC state.
    """
    if not settings.microsoft_oauth_client_id:
        return RedirectResponse(url=f"{settings.frontend_url}/settings?outlook=error")

    user_id = _verify_state(state)

    # Exchange authorisation code for tokens
    try:
        token_resp = httpx.post(
            MS_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.microsoft_oauth_client_id,
                "client_secret": settings.microsoft_oauth_client_secret,
                "redirect_uri": settings.microsoft_oauth_redirect_uri,
                "grant_type": "authorization_code",
                "scope": MS_SCOPE,
            },
            timeout=10.0,
        )
        token_resp.raise_for_status()
        token_data = token_resp.json()
    except Exception as exc:
        logger.error("Outlook token exchange failed — user=%s: %s", user_id, exc)
        return RedirectResponse(url=f"{settings.frontend_url}/settings?outlook=error")

    # Fetch the Microsoft account email/UPN to show in Settings
    outlook_email: str | None = None
    try:
        me_resp = httpx.get(
            GRAPH_ME_URL,
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
            timeout=10.0,
        )
        me_resp.raise_for_status()
        me_data = me_resp.json()
        # Prefer mail (SMTP address) over userPrincipalName (may be alias@tenant)
        outlook_email = me_data.get("mail") or me_data.get("userPrincipalName")
    except Exception:
        pass  # email display is non-critical

    token_to_save = stamp_expiry({**token_data})
    if outlook_email:
        token_to_save["outlook_email"] = outlook_email

    admin = get_supabase_admin()
    admin.table("users").update(
        {"outlook_calendar_token": token_to_save}
    ).eq("id", user_id).execute()

    return RedirectResponse(url=f"{settings.frontend_url}/settings?outlook=connected")


@router.get("/status")
def outlook_status(current_user: dict = Depends(get_current_user)):
    """Return whether the user has a connected Outlook Calendar and their email."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    try:
        result = (
            admin.table("users")
            .select("outlook_calendar_token")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
    except Exception:
        return {"connected": False, "email": None}

    if not result or not result.data:
        return {"connected": False, "email": None}

    token_data = result.data.get("outlook_calendar_token")
    if not token_data or not token_data.get("refresh_token"):
        return {"connected": False, "email": None}

    return {"connected": True, "email": token_data.get("outlook_email")}


@router.delete("/disconnect")
def outlook_disconnect(current_user: dict = Depends(get_current_user)):
    """Remove the stored Outlook Calendar token."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()
    admin.table("users").update(
        {"outlook_calendar_token": None}
    ).eq("id", user_id).execute()
    return {"disconnected": True}
