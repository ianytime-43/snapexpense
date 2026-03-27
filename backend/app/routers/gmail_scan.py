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
    Import a Gmail email as an expense.
    Fetches the email body, runs it through AI parser, creates expense.
    """
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    # Get user's Google OAuth token
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
            # Fetch full email
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
