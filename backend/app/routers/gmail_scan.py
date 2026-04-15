"""
Gmail receipt scanning endpoint.

Launch posture (pre-CASA): METADATA-ONLY.
We use the `https://www.googleapis.com/auth/gmail.metadata` OAuth scope, which
permits reading only the Subject / From / Date headers via format=metadata.
Reading message bodies or attachments requires `gmail.readonly` + a CASA
assessment ($500-$25K) — deferred to Wave 2.

The `/scan` endpoint lists receipt-likely emails (metadata only). The `/import`
endpoint is intentionally disabled: users should forward the email to their
Mailgun address for auto-import until full access is unlocked.
"""

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import httpx

from ..auth import get_current_user
from ..config import settings
from ..database import get_supabase_admin
from ..services.gmail_scanner import scan_gmail_metadata

logger = logging.getLogger(__name__)

GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


async def _refresh_google_token(refresh_token: str) -> str | None:
    """Refresh an expired Google access token using the refresh token."""
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(GOOGLE_TOKEN_URL, data={
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": settings.google_oauth_client_id,
                "client_secret": settings.google_oauth_client_secret,
            }, timeout=10)
            if resp.status_code == 200:
                data = resp.json()
                return data.get("access_token")
            else:
                logger.warning(f"Token refresh failed: {resp.status_code} {resp.text[:200]}")
                return None
    except Exception as e:
        logger.warning(f"Token refresh error: {e}")
        return None
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
    refresh_token = token_data.get("refresh_token")

    if not access_token:
        raise HTTPException(status_code=400, detail="Google token expired. Reconnect in Settings.")

    # Try scanning with current token
    results = await scan_gmail_metadata(
        access_token=access_token,
        months=body.months,
    )

    # If got a 401 error, try refreshing the token
    if results and len(results) == 1 and results[0].get("email_id") == "error" and "401" in results[0].get("subject", ""):
        if refresh_token:
            new_token = await _refresh_google_token(refresh_token)
            if new_token:
                # Save refreshed token
                token_data["access_token"] = new_token
                admin.table("users").update({"google_calendar_token": token_data}).eq("id", user_id).execute()
                # Retry with new token
                results = await scan_gmail_metadata(access_token=new_token, months=body.months)
            else:
                raise HTTPException(400, "Google token expired. Please disconnect and reconnect Google in Settings.")
        else:
            raise HTTPException(400, "Google token expired. Please disconnect and reconnect Google in Settings.")

    return {"results": results, "count": len(results)}


class ImportRequest(BaseModel):
    email_id: str
    subject: str = ""
    sender: str = ""
    date: str = ""


@router.post("/import")
async def import_gmail_receipt(
    body: ImportRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Auto-import from Gmail body is disabled at launch (metadata-only scope).

    To import a receipt, the user should forward the email to their SnapExpense
    Mailgun address — the inbound pipeline handles parsing. We return 501 here
    rather than silently failing so the frontend can show a clear hint.
    """
    # Avoid unused-parameter warnings while keeping the signature stable for
    # future Wave 2 re-enablement.
    _ = body
    _ = current_user
    raise HTTPException(
        status_code=501,
        detail=(
            "Gmail auto-import is not available at launch (metadata-only scope). "
            "Forward the email to your SnapExpense address to import it."
        ),
    )


# The body-fetch path below is retained (dead) for reference when CASA is
# complete and the import endpoint is re-enabled. It is NOT reachable.
async def _disabled_legacy_import_body(body, current_user):  # pragma: no cover
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    user_row = admin.table("users").select("google_calendar_token").eq("id", user_id).single().execute()
    if not user_row.data or not user_row.data.get("google_calendar_token"):
        raise HTTPException(status_code=400, detail="Google account not connected.")

    token_data = user_row.data["google_calendar_token"]
    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(status_code=400, detail="Google token expired.")

    import httpx
    import re

    try:
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"https://gmail.googleapis.com/gmail/v1/users/me/messages/{body.email_id}",
                params={"format": "full"},
                headers={"Authorization": f"Bearer {access_token}"},
                timeout=15,
            )
            if resp.status_code != 200:
                raise HTTPException(500, f"Gmail API error: {resp.status_code}")

            msg = resp.json()

            # Extract plain text body
            email_text = _extract_email_text(msg)

            if not email_text:
                email_text = body.subject  # Fallback to subject line

        # Run through AI parser
        from ..services.ai_parser import parse_receipt
        parsed = parse_receipt(email_text[:4000])

        # Use email metadata as fallback
        if not parsed.get("expense_date") and body.date:
            try:
                from datetime import datetime
                dt = datetime.fromisoformat(body.date.replace("Z", "+00:00"))
                parsed["expense_date"] = dt.strftime("%Y-%m-%d")
            except Exception:
                # Guard: unparseable email date — fall through, AI may have extracted a date.
                pass

        if not parsed.get("merchant_name") and body.sender:
            # Extract sender name from "Name <email>" format
            match = re.match(r'^([^<]+)', body.sender)
            if match:
                parsed["merchant_name"] = match.group(1).strip()

        # Resolve merchant alias
        from ..services.merchant_aliases import resolve_merchant
        if parsed.get("merchant_name"):
            display, cat = resolve_merchant(admin, parsed["merchant_name"])
            if display:
                parsed["merchant_name"] = display
            if cat and not parsed.get("category"):
                parsed["category"] = cat

        # Check for existing similar expense before creating
        if parsed.get("amount_total") and parsed.get("merchant_name"):
            existing = admin.table("expenses").select("id, merchant_name, amount_total, expense_date").eq("user_id", user_id).execute()
            for e in (existing.data or []):
                if (abs(float(e.get("amount_total") or 0) - float(parsed["amount_total"])) < 0.01
                        and (e.get("merchant_name") or "").upper()[:8] == (parsed["merchant_name"] or "").upper()[:8]):
                    return {"status": "duplicate", "expense_id": e["id"], "message": f"Similar expense already exists: {e.get('merchant_name')} ${e.get('amount_total')}"}

        # Create expense
        expense_data = {
            "user_id": user_id,
            "status": "draft",
            "merchant_name": parsed.get("merchant_name"),
            "merchant_address": parsed.get("merchant_address"),
            "expense_date": parsed.get("expense_date"),
            "expense_time": parsed.get("expense_time"),
            "amount_total": parsed.get("amount_total"),
            "amount_tax": parsed.get("amount_tax"),
            "amount_tip": parsed.get("amount_tip"),
            "currency": parsed.get("currency", "CAD"),
            "payment_method": parsed.get("payment_method"),
            "category": parsed.get("category"),
            "document_type": parsed.get("document_type", "receipt"),
            "alcohol_total": parsed.get("alcohol_total"),
            "notes": f"Imported from Gmail: {body.subject[:100]}",
        }

        # Remove None values
        expense_data = {k: v for k, v in expense_data.items() if v is not None}

        result = admin.table("expenses").insert(expense_data).execute()
        expense_id = result.data[0]["id"] if result.data else None

        # Flag expenses with missing amounts for review
        if not expense_data.get("amount_total") or expense_data.get("amount_total") == 0:
            try:
                admin.table("expenses").update({
                    "notes": "Needs review: amount could not be extracted from email. Please update manually."
                }).eq("id", expense_id).execute()
            except Exception as exc:
                # Non-fatal: the expense was created; flagging note is a nice-to-have.
                logger.warning("Gmail scan: review-flag note update failed for expense=%s: %s", expense_id, exc)

        return {"status": "ok", "expense_id": expense_id, "parsed": parsed}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Gmail import failed: {e}")
        raise HTTPException(500, f"Import failed: {str(e)[:200]}")


def _extract_email_text(msg: dict) -> str:
    """Extract plain text from Gmail message payload."""
    import base64

    payload = msg.get("payload", {})

    # Simple message (no parts)
    if payload.get("mimeType") == "text/plain" and payload.get("body", {}).get("data"):
        return base64.urlsafe_b64decode(payload["body"]["data"]).decode("utf-8", errors="ignore")

    # Multipart message
    parts = payload.get("parts", [])
    for part in parts:
        if part.get("mimeType") == "text/plain" and part.get("body", {}).get("data"):
            return base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8", errors="ignore")

    # Try HTML as fallback
    for part in parts:
        if part.get("mimeType") == "text/html" and part.get("body", {}).get("data"):
            import re
            html = base64.urlsafe_b64decode(part["body"]["data"]).decode("utf-8", errors="ignore")
            # Strip HTML tags
            return re.sub(r'<[^>]+>', ' ', html)

    # Nested multipart
    for part in parts:
        if "parts" in part:
            for subpart in part["parts"]:
                if subpart.get("mimeType") == "text/plain" and subpart.get("body", {}).get("data"):
                    return base64.urlsafe_b64decode(subpart["body"]["data"]).decode("utf-8", errors="ignore")

    return ""
