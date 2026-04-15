"""
Mailgun inbound email webhook.

Mailgun POSTs multipart/form-data to POST /api/email/inbound whenever an
email arrives at a user's forwarding address (e.g. abc12345@in.snapexpense.com).

Key form fields sent by Mailgun:
  recipient     — the address the mail was sent TO (our user's forwarding address)
  sender        — envelope sender
  from          — From header
  subject       — Subject header
  body-plain    — plain-text body
  body-html     — HTML body (may contain inline receipt)
  attachment-count — integer, number of attached files
  attachment-1 … attachment-N — the actual file uploads

We always return 200. Non-200 responses cause Mailgun to retry for 8 hours.
"""
import hashlib
import hmac
import logging
import time

from fastapi import APIRouter, HTTPException, Request

from ..config import settings
from ..database import get_supabase_admin
from ..services import ai_parser, pipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/email", tags=["email"])

# MIME types we'll attempt to OCR
RECEIPT_MIME_TYPES = {
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/tiff",
    "application/pdf",
}

# Mailgun replay window: reject webhooks older than this.
_MAILGUN_MAX_SKEW_SECONDS = 15 * 60


def _verify_mailgun_signature(timestamp: str, token: str, signature: str) -> tuple[bool, str]:
    """Verify the Mailgun HMAC-SHA256 signature.

    Returns (ok, reason). Reason is "" when ok.

    - In production (APP_ENV=production) a missing signing key means the
      webhook is REJECTED (fail-closed).
    - In dev/staging a missing signing key logs a loud warning but allows
      the request through so local testing still works.
    """
    signing_key = (settings.mailgun_signing_key or "").strip()
    is_prod = (settings.app_env or "").lower() == "production"

    if not signing_key:
        if is_prod:
            logger.error(
                "MAILGUN SECURITY: MAILGUN_SIGNING_KEY is not set in production — "
                "rejecting inbound webhook. Set MAILGUN_SIGNING_KEY in Railway."
            )
            return False, "signing key not configured"
        logger.warning(
            "MAILGUN SECURITY: MAILGUN_SIGNING_KEY is not set (APP_ENV=%r) — "
            "allowing unsigned webhook in non-prod only. DO NOT ship this to prod.",
            settings.app_env,
        )
        return True, ""

    if not timestamp or not token or not signature:
        return False, "missing signature fields"

    # Replay protection: timestamp must be recent.
    try:
        ts = int(timestamp)
    except (TypeError, ValueError):
        return False, "timestamp not an integer"
    now = int(time.time())
    if abs(now - ts) > _MAILGUN_MAX_SKEW_SECONDS:
        return False, "timestamp outside replay window"

    expected = hmac.new(
        signing_key.encode("utf-8"),
        f"{timestamp}{token}".encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()

    if not hmac.compare_digest(expected, signature):
        return False, "signature mismatch"

    return True, ""


@router.post("/inbound")
async def inbound_email(request: Request):
    """Mailgun inbound webhook — always returns 200."""
    admin = get_supabase_admin()

    try:
        form = await request.form()
    except Exception as exc:
        logger.error("Failed to parse Mailgun form data: %s", exc)
        return {"status": "error"}

    # Signature check MUST run before any DB work / persistence.
    sig_timestamp = str(form.get("timestamp") or "").strip()
    sig_token = str(form.get("token") or "").strip()
    sig_signature = str(form.get("signature") or "").strip()
    ok, reason = _verify_mailgun_signature(sig_timestamp, sig_token, sig_signature)
    if not ok:
        logger.warning("EMAIL INGEST: rejected unsigned/invalid webhook — %s", reason)
        raise HTTPException(status_code=401, detail=f"invalid webhook signature: {reason}")

    recipient = str(form.get("recipient") or "").strip().lower()
    sender = str(form.get("sender") or form.get("from") or "").strip()
    subject = str(form.get("subject") or "").strip()
    body_text = str(form.get("body-plain") or form.get("body-html") or "").strip()
    attachment_count = int(form.get("attachment-count") or 0)

    logger.info(
        "EMAIL INGEST: recipient=%r sender=%r subject=%r attachments=%d",
        recipient, sender, subject, attachment_count,
    )

    if not recipient:
        return {"status": "ignored", "reason": "no recipient"}

    # ── Find user by forwarding address ──────────────────────────────────────
    try:
        user_row = (
            admin.table("user_forwarding_addresses")
            .select("user_id")
            .eq("forwarding_address", recipient)
            .maybe_single()
            .execute()
        )
    except Exception as exc:
        logger.error("DB lookup failed for recipient %r: %s", recipient, exc)
        return {"status": "error"}

    if not user_row.data:
        logger.info("EMAIL INGEST: no user for address %r — ignoring", recipient)
        return {"status": "ignored", "reason": "unknown recipient"}

    user_id = str(user_row.data["user_id"])
    logger.info("EMAIL INGEST: matched user_id=%s", user_id)

    # ── Identify vendor from sender domain ───────────────────────────────────
    vendor_id = None
    if "@" in sender:
        sender_domain = sender.split("@")[-1].rstrip(">").lower()
        try:
            vendor_row = (
                admin.table("vendor_registry")
                .select("id, vendor_name")
                .contains("sender_domains", f'["{sender_domain}"]')
                .eq("is_active", True)
                .order("priority", desc=True)
                .limit(1)
                .execute()
            )
            if vendor_row.data:
                vendor_id = vendor_row.data[0]["id"]
                logger.info("EMAIL INGEST: matched vendor=%s", vendor_row.data[0]["vendor_name"])
        except Exception as exc:
            # Non-fatal: vendor lookup enriches the record but isn't required.
            logger.warning("EMAIL INGEST: vendor lookup failed for domain=%s: %s", sender_domain, exc)

    # ── Save raw email record ────────────────────────────────────────────────
    forwarded_email_id = None
    try:
        email_result = admin.table("forwarded_emails").insert({
            "user_id": user_id,
            "from_address": sender,
            "subject": subject,
            "body_text": body_text[:10_000] if body_text else None,
            "vendor_id": vendor_id,
            "processing_status": "parsing",
        }).execute()
        forwarded_email_id = email_result.data[0]["id"] if email_result.data else None
    except Exception as exc:
        logger.warning("EMAIL INGEST: could not save forwarded_email record: %s", exc)

    # ── Process attachments ──────────────────────────────────────────────────
    expense_id = None

    for i in range(1, attachment_count + 1):
        attachment = form.get(f"attachment-{i}")
        if attachment is None or not hasattr(attachment, "read"):
            continue

        content_type = (getattr(attachment, "content_type", None) or "").lower()
        filename = getattr(attachment, "filename", None) or f"attachment-{i}"

        if content_type not in RECEIPT_MIME_TYPES:
            logger.info("EMAIL INGEST: skipping attachment %d type=%r", i, content_type)
            continue

        logger.info("EMAIL INGEST: processing attachment %d — %r (%s)", i, filename, content_type)

        try:
            file_bytes = await attachment.read()
        except TypeError:
            file_bytes = attachment.read()  # type: ignore[call-arg]

        if not file_bytes:
            continue

        # Dedup check
        image_hash = hashlib.sha256(file_bytes).hexdigest()
        try:
            dup = (
                admin.table("receipts")
                .select("expense_id")
                .eq("image_hash", image_hash)
                .eq("user_id", user_id)
                .maybe_single()
                .execute()
            )
            if dup and dup.data and dup.data.get("expense_id"):
                logger.info("EMAIL INGEST: attachment %d is duplicate — skipping", i)
                expense_id = dup.data["expense_id"]
                continue
        except Exception as exc:
            # Non-fatal: fall through to upload if dedup lookup fails.
            logger.warning("EMAIL INGEST: dedup lookup failed for attachment %d: %s", i, exc)

        try:
            expense_id, _ = pipeline.process_receipt_bytes(
                admin, user_id, file_bytes, filename, content_type, "email_forward"
            )
            logger.info("EMAIL INGEST: created expense %s from attachment %d", expense_id, i)
            break  # First valid attachment wins
        except Exception as exc:
            logger.error("EMAIL INGEST: pipeline failed for attachment %d: %s", i, exc)

    # ── Fallback: parse email body text if no attachment produced an expense ─
    if not expense_id and body_text.strip():
        logger.info("EMAIL INGEST: no attachment expense — trying body text")
        try:
            parsed = ai_parser.parse_receipt(body_text[:4_000])
            if parsed.get("amount_total") or parsed.get("merchant_name"):
                expense_result = admin.table("expenses").insert({
                    "user_id": user_id,
                    "status": "draft",
                    "merchant_name": parsed.get("merchant_name"),
                    "expense_date": parsed.get("expense_date"),
                    "amount_total": parsed.get("amount_total"),
                    "amount_tax": parsed.get("amount_tax"),
                    "amount_tip": parsed.get("amount_tip"),
                    "currency": parsed.get("currency") or "USD",
                    "category": parsed.get("category"),
                }).execute()
                expense_id = expense_result.data[0]["id"]
                logger.info("EMAIL INGEST: created expense %s from body text", expense_id)
        except Exception as exc:
            logger.warning("EMAIL INGEST: body text parsing failed: %s", exc)

    # ── Update forwarded_email status ────────────────────────────────────────
    if forwarded_email_id:
        try:
            admin.table("forwarded_emails").update({
                "expense_id": expense_id,
                "processing_status": "matched" if expense_id else "failed",
            }).eq("id", forwarded_email_id).execute()
        except Exception as exc:
            # Non-fatal: processing result already returned; status update is for history.
            logger.warning("EMAIL INGEST: status update failed for forwarded_email=%s: %s", forwarded_email_id, exc)

    return {"status": "ok", "expense_id": expense_id}
