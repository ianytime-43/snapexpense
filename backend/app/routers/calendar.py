"""
Google Calendar OAuth 2.0 router.

Endpoints:
  GET  /api/calendar/connect     → {auth_url}
  GET  /api/calendar/callback    → redirects to frontend (no auth required)
  GET  /api/calendar/status      → {connected, email}
  DELETE /api/calendar/disconnect → {disconnected: true}
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

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/calendar", tags=["calendar"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"
CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"


# ── HMAC state helpers ────────────────────────────────────────────────────────

def _sign_state(user_id: str) -> str:
    secret = settings.supabase_service_role_key[:32].encode()
    sig = hmac.new(secret, user_id.encode(), hashlib.sha256).hexdigest()
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
def calendar_connect(current_user: dict = Depends(get_current_user)):
    """Return the Google OAuth URL the frontend should redirect to."""
    if not settings.google_oauth_client_id:
        raise HTTPException(status_code=503, detail="Google Calendar not configured")

    user_id = str(current_user["user"].id)
    state = _sign_state(user_id)

    params = {
        "client_id": settings.google_oauth_client_id,
        "redirect_uri": settings.google_oauth_redirect_uri,
        "response_type": "code",
        "scope": CALENDAR_SCOPE,
        "access_type": "offline",
        "prompt": "consent",
        "state": state,
    }
    auth_url = GOOGLE_AUTH_URL + "?" + urlencode(params)
    return {"auth_url": auth_url}


@router.get("/callback")
def calendar_callback(
    code: str = Query(...),
    state: str = Query(...),
):
    """
    Google redirects here after the user grants access.
    No Authorization header — verified via HMAC state.
    """
    if not settings.google_oauth_client_id:
        return RedirectResponse(url=f"{settings.frontend_url}/settings?calendar=error")

    user_id = _verify_state(state)

    # Exchange authorisation code for tokens
    try:
        token_resp = httpx.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
                "redirect_uri": settings.google_oauth_redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=10.0,
        )
        token_resp.raise_for_status()
        token_data = token_resp.json()
    except Exception as exc:
        logger.error("Calendar token exchange failed — user=%s: %s", user_id, exc)
        return RedirectResponse(url=f"{settings.frontend_url}/settings?calendar=error")

    # Fetch the Google account email to show in Settings
    google_email: str | None = None
    try:
        info_resp = httpx.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {token_data['access_token']}"},
            timeout=10.0,
        )
        info_resp.raise_for_status()
        google_email = info_resp.json().get("email")
    except Exception:
        pass  # email display is non-critical

    token_to_save = {**token_data}
    if google_email:
        token_to_save["google_email"] = google_email

    admin = get_supabase_admin()
    admin.table("users").update(
        {"google_calendar_token": token_to_save}
    ).eq("id", user_id).execute()

    return RedirectResponse(url=f"{settings.frontend_url}/settings?calendar=connected")


@router.get("/status")
def calendar_status(current_user: dict = Depends(get_current_user)):
    """Return whether the user has a connected Google Calendar and their email."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    try:
        result = (
            admin.table("users")
            .select("google_calendar_token")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
    except Exception:
        return {"connected": False, "email": None}

    if not result or not result.data:
        return {"connected": False, "email": None}

    token_data = result.data.get("google_calendar_token")
    if not token_data or not token_data.get("refresh_token"):
        return {"connected": False, "email": None}

    return {"connected": True, "email": token_data.get("google_email")}


@router.delete("/disconnect")
def calendar_disconnect(current_user: dict = Depends(get_current_user)):
    """Remove the stored Google Calendar token."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()
    admin.table("users").update(
        {"google_calendar_token": None}
    ).eq("id", user_id).execute()
    return {"disconnected": True}
