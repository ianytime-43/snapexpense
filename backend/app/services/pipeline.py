"""
Shared receipt processing pipeline.
Called by both the direct-upload router and the email-ingest router.
"""
import hashlib
import logging
from datetime import datetime

from supabase import Client

from ..utils import safe_card, safe_date, safe_float, safe_payment_method
from .ai_parser import parse_receipt
from .calendar_matcher import get_calendar_match
from .currency_converter import get_historical_rate
from .location_tagger import tag_expense_location
from .merchant_aliases import resolve_merchant
from .ocr import run_ocr
from .outlook_matcher import get_outlook_match
from .storage import upload_receipt_image

logger = logging.getLogger(__name__)


def _ensure_user_row(admin, user_id: str) -> None:
    """
    Guarantee a row exists in public.users for this auth user.
    If missing, look up the email from auth.users and insert it.
    This is required so calendar token lookups don't silently return None.
    """
    try:
        result = (
            admin.table("users")
            .select("id")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        if result and result.data:
            return  # row already exists
    except Exception as exc:
        logger.warning("_ensure_user_row check failed — user=%s: %s", user_id, exc)
        return

    # Row missing — fetch email from auth and create it
    try:
        auth_resp = admin.auth.admin.get_user_by_id(user_id)
        email = auth_resp.user.email if auth_resp and auth_resp.user else None
        if not email:
            logger.warning("_ensure_user_row: no email found for user=%s", user_id)
            return
        admin.table("users").insert({"id": user_id, "email": email}).execute()
        logger.info("Created public.users row for user=%s", user_id)
    except Exception as exc:
        logger.warning("_ensure_user_row insert failed — user=%s: %s", user_id, exc)


def process_receipt_bytes(
    admin: Client,
    user_id: str,
    file_bytes: bytes,
    filename: str,
    content_type: str,
    source: str,
) -> tuple[str, str]:
    """
    Full pipeline: upload → OCR → AI parse → save expense + receipt + line items.
    Returns (expense_id, image_url).
    Raises on storage failure. OCR/parse failures are non-fatal (empty draft created).
    """
    image_hash = hashlib.sha256(file_bytes).hexdigest()

    # Upload to Supabase Storage (raises on failure)
    image_url = upload_receipt_image(admin, user_id, file_bytes, filename, content_type)

    # OCR
    ocr_text, ocr_confidence = "", 0.0
    try:
        ocr_text, ocr_confidence = run_ocr(file_bytes)
        logger.info("OCR ok — user=%s len=%d conf=%.2f", user_id, len(ocr_text), ocr_confidence)
    except Exception as exc:
        logger.warning("OCR failed — user=%s %s: %s", user_id, type(exc).__name__, exc)

    # AI parsing
    parsed: dict = {}
    if ocr_text.strip():
        try:
            parsed = parse_receipt(ocr_text)
            logger.info(
                "AI parse ok — merchant=%r amount=%s",
                parsed.get("merchant_name"),
                parsed.get("amount_total"),
            )
        except Exception as exc:
            logger.warning("AI parse failed — user=%s %s: %s", user_id, type(exc).__name__, exc)

    # Resolve raw OCR merchant name to clean display name via alias table
    if parsed.get("merchant_name"):
        resolved_name, resolved_category = resolve_merchant(admin, parsed["merchant_name"])
        if resolved_name != parsed["merchant_name"]:
            parsed = {**parsed, "merchant_name": resolved_name}
        # Only use alias category if AI didn't extract one
        if resolved_category and not parsed.get("category"):
            parsed = {**parsed, "category": resolved_category}

    # Ensure public.users row exists (needed for calendar token lookup)
    _ensure_user_row(admin, user_id)

    # Calendar matching — non-fatal if it fails
    cal_match: dict | None = None
    expense_date_str = safe_date(parsed.get("expense_date"))
    expense_time_str = parsed.get("expense_time")
    expense_dt: datetime | None = None
    if expense_date_str:
        try:
            dt_str = expense_date_str
            if expense_time_str:
                dt_str += f"T{expense_time_str}"
            expense_dt = datetime.fromisoformat(dt_str)
        except ValueError:
            pass

    if expense_dt:
        _match_kwargs = dict(
            merchant_name=parsed.get("merchant_name"),
            merchant_address=parsed.get("merchant_address"),
            category=parsed.get("category"),
            amount_total=safe_float(parsed.get("amount_total")),
        )
        try:
            cal_match = get_calendar_match(
                admin, user_id, expense_dt, **_match_kwargs
            )
            if cal_match:
                logger.info(
                    "Google calendar match — expense=%s action=%s confidence=%.3f",
                    expense_date_str, cal_match.get("action"), cal_match.get("confidence", 0),
                )
        except Exception as exc:
            logger.warning("Google calendar match failed — user=%s: %s", user_id, exc)

        # Outlook fallback — only runs if Google returned no match
        if not cal_match:
            try:
                cal_match = get_outlook_match(
                    admin, user_id, expense_dt, **_match_kwargs
                )
                if cal_match:
                    logger.info(
                        "Outlook calendar match — expense=%s action=%s confidence=%.3f",
                        expense_date_str, cal_match.get("action"), cal_match.get("confidence", 0),
                    )
            except Exception as exc:
                logger.warning("Outlook calendar match failed — user=%s: %s", user_id, exc)

    # Location tagging
    cal_event_location = None
    if cal_match:
        cal_event_location = cal_match.get("event_location")
    location_name, location_jurisdiction = tag_expense_location(
        cal_event_location,
        parsed.get("merchant_address"),
    )

    # Build expense record
    expense_data: dict = {
        "user_id": user_id,
        "status": "draft",
        "merchant_name": parsed.get("merchant_name"),
        "merchant_address": parsed.get("merchant_address"),
        "expense_date": expense_date_str,
        "expense_time": expense_time_str,
        "amount_total": safe_float(parsed.get("amount_total")),
        "amount_tax": safe_float(parsed.get("amount_tax")),
        "amount_tip": safe_float(parsed.get("amount_tip")),
        "currency": parsed.get("currency") or "USD",
        "payment_method": safe_payment_method(parsed.get("payment_method")),
        "card_last_four": safe_card(parsed.get("card_last_four")),
        "category": parsed.get("category"),
        "location_name": location_name,
        "location_jurisdiction": location_jurisdiction,
    }

    # Currency conversion — convert to user's default currency (CAD)
    DEFAULT_CURRENCY = "CAD"
    exp_currency = expense_data.get("currency", "USD")
    amount_total = expense_data.get("amount_total")
    if amount_total and exp_currency and exp_currency.upper() != DEFAULT_CURRENCY:
        exp_date_str = expense_data.get("expense_date")
        try:
            from datetime import date as date_type
            exp_date = date_type.fromisoformat(exp_date_str) if exp_date_str else date_type.today()
            rate = get_historical_rate(exp_currency, DEFAULT_CURRENCY, exp_date)
            if rate:
                expense_data["converted_amount"] = round(amount_total * rate, 2)
                expense_data["conversion_rate"] = round(rate, 6)
                expense_data["converted_currency"] = DEFAULT_CURRENCY
        except Exception as exc:
            logger.warning("Currency conversion failed: %s", exc)

    # Apply calendar match results
    if cal_match:
        expense_data["calendar_event_id"] = cal_match.get("event_id")
        expense_data["calendar_event_title"] = cal_match.get("event_title")
        expense_data["calendar_match_confidence"] = cal_match.get("confidence")
        if cal_match["action"] == "auto_apply":
            expense_data["client_name"] = cal_match.get("client_name")
            expense_data["business_purpose"] = cal_match.get("business_purpose")
        else:  # suggest
            expense_data["calendar_suggested_client"] = cal_match.get("client_name")
            expense_data["calendar_suggested_purpose"] = cal_match.get("business_purpose")

    expense_result = admin.table("expenses").insert(expense_data).execute()
    expense_id: str = expense_result.data[0]["id"]

    # Save receipt record
    admin.table("receipts").insert({
        "user_id": user_id,
        "expense_id": expense_id,
        "image_url": image_url,
        "receipt_role": "itemized",
        "source": source,
        "image_hash": image_hash,
        "ocr_raw_text": ocr_text or None,
        "ocr_confidence": ocr_confidence if ocr_text else None,
        "is_duplicate": False,
    }).execute()

    # Save calendar attendees
    if cal_match and cal_match.get("attendees"):
        attendee_rows = [
            {"expense_id": expense_id, "email": a["email"]}
            for a in cal_match["attendees"]
            if a.get("email")
        ]
        if attendee_rows:
            try:
                admin.table("attendees").insert(attendee_rows).execute()
            except Exception as exc:
                logger.warning("Could not save attendees — expense=%s: %s", expense_id, exc)

    # Save line items
    line_items = parsed.get("line_items") or []
    if isinstance(line_items, list):
        items = [
            {
                "expense_id": expense_id,
                "description": str(item["description"]),
                "quantity": safe_float(item.get("quantity")),
                "unit_price": safe_float(item.get("unit_price")),
                "total_price": safe_float(item.get("total_price")),
                "sort_order": idx,
            }
            for idx, item in enumerate(line_items)
            if isinstance(item, dict) and item.get("description")
        ]
        if items:
            admin.table("expense_line_items").insert(items).execute()

    return expense_id, image_url
