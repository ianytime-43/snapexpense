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
    latitude: float | None = None,
    longitude: float | None = None,
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

    # Vendor memory lookup — auto-fill from learned preferences
    try:
        from app.modules.intel.vendor_memory import lookup_vendor
        vendor_prefs = lookup_vendor(admin, user_id, parsed.get("merchant_name", ""))
        if vendor_prefs and vendor_prefs["times_seen"] >= 2:
            # Auto-fill category if not already set by AI parser
            if vendor_prefs.get("category") and not parsed.get("category"):
                parsed["category"] = vendor_prefs["category"]
            # Auto-fill tag (stored on expense_data, built below)
            if vendor_prefs.get("expense_tag"):
                parsed["_vendor_expense_tag"] = vendor_prefs["expense_tag"]
            logger.info(f"Vendor memory applied for {parsed.get('merchant_name')} (seen {vendor_prefs['times_seen']}x)")
    except Exception as e:
        logger.warning(f"Vendor memory lookup failed: {e}")

    # Smart rules — pattern-based auto-categorization (after vendor memory, before save).
    # Rule only applies when no category has been determined yet.
    smart_rule_matched: dict | None = None
    try:
        from app.modules.smart_rules import list_active_rules, match_rule
        _rules = list_active_rules(admin, user_id)
        smart_rule_matched = match_rule(_rules, parsed.get("merchant_name", ""))
        if smart_rule_matched:
            if smart_rule_matched.get("category") and not parsed.get("category"):
                parsed["category"] = smart_rule_matched["category"]
            logger.info(
                "Smart rule matched — rule=%s merchant=%r",
                smart_rule_matched.get("name"), parsed.get("merchant_name"),
            )
    except Exception as e:
        logger.warning(f"Smart rule lookup failed: {e}")

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
            # Guard: unparseable date/time string — fall through, expense_dt stays None.
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
        "document_type": parsed.get("document_type") or "receipt",
        "alcohol_total": safe_float(parsed.get("alcohol_total")),
        "due_date": safe_date(parsed.get("due_date")),
        "location_name": location_name,
        "location_jurisdiction": location_jurisdiction,
    }

    # Apply vendor memory expense tag (set before expense_data was built)
    if parsed.get("_vendor_expense_tag"):
        expense_data["expense_tag"] = parsed["_vendor_expense_tag"]

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

    # GPS-based tax rate lookup
    tax_rate_applied = None
    if latitude is not None and longitude is not None:
        try:
            from app.modules.tax.geocode import reverse_geocode_to_region
            from app.modules.tax.rates import get_total_tax_rate

            geo_result = reverse_geocode_to_region(latitude, longitude)
            if geo_result:
                country, region = geo_result
                # Use GPS jurisdiction if location_tagger didn't find one
                if not expense_data.get("location_jurisdiction"):
                    expense_data["location_jurisdiction"] = f"{region}, {country}"

                # Look up tax rate for this jurisdiction
                expense_date = None
                if expense_data.get("expense_date"):
                    from datetime import date as date_type
                    try:
                        expense_date = date_type.fromisoformat(expense_data["expense_date"])
                    except (ValueError, TypeError):
                        pass

                tax_rate_applied = get_total_tax_rate(admin, country, region, expense_date)
        except Exception as exc:
            logger.warning("GPS tax rate lookup failed — user=%s: %s", user_id, exc)

    # Add GPS data + tax rate to expense record
    expense_data["latitude"] = latitude
    expense_data["longitude"] = longitude
    if tax_rate_applied is not None:
        expense_data["tax_rate_applied"] = tax_rate_applied

    # Work hours prediction — suggest expense tag
    try:
        from app.modules.intel.work_hours import suggest_expense_tag

        user_prefs_row = admin.table("users").select(
            "expense_categories, work_hours_start, work_hours_end, work_days, country, region"
        ).eq("id", user_id).maybe_single().execute()
        user_prefs = user_prefs_row.data or {}

        has_cal = cal_match is not None and cal_match.get("confidence", 0) >= 0.4
        cal_conf = cal_match.get("confidence", 0) if cal_match else 0

        suggested_tag, tag_reason = suggest_expense_tag(
            user_prefs=user_prefs,
            expense_time=parsed.get("expense_time"),
            expense_date=parsed.get("expense_date"),
            has_calendar_match=has_cal,
            calendar_match_confidence=cal_conf,
        )

        # Only auto-apply if no tag set yet
        if not expense_data.get("expense_tag"):
            expense_data["expense_tag"] = suggested_tag
            logger.info(f"Work hours suggested tag={suggested_tag} reason={tag_reason}")
    except Exception as e:
        logger.warning(f"Work hours prediction failed: {e}")

    # Tax deduction calculation
    try:
        from app.modules.tax.engine import calculate_expense_tax

        # Get user's country/region (reuse if already fetched)
        if not user_prefs:
            user_row = admin.table("users").select("country, region").eq("id", user_id).maybe_single().execute()
            user_country = (user_row.data or {}).get("country", "CA")
            user_region = (user_row.data or {}).get("region")
        else:
            user_country = user_prefs.get("country", "CA")
            user_region = user_prefs.get("region")

        tax_result = calculate_expense_tax(admin, expense_data, user_country, user_region)
        expense_data["tax_deductible_amount"] = tax_result["tax_deductible_amount"]
        expense_data["itc_claimable"] = tax_result["itc_claimable"]
        expense_data["deduction_pct"] = tax_result["deduction_pct"]
        expense_data["tax_line"] = tax_result["tax_line"]
        expense_data["deduction_rule"] = tax_result["deduction_rule"]
    except Exception as e:
        logger.warning(f"Tax deduction calculation failed: {e}")

    # Apply smart rule side effects just before insert (deduction boost + rule id link).
    if smart_rule_matched:
        expense_data["applied_rule_id"] = smart_rule_matched.get("id")
        if smart_rule_matched.get("is_tax_deductible") and not expense_data.get("deduction_pct"):
            expense_data["deduction_pct"] = 100

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

    # Smart duplicate detection — check after save, log warning
    try:
        from app.modules.intel.smart_duplicate import find_potential_duplicates

        duplicates = find_potential_duplicates(admin, user_id, expense_data)
        if duplicates and len(duplicates) >= 2:  # Only flag when clearly duplicate
            logger.warning(
                "Potential duplicate detected for expense=%s: %d matches — %s",
                expense_id, len(duplicates),
                ", ".join(d.get("reason", "") for d in duplicates[:3]),
            )
            # Store duplicate warning on the expense for frontend to display
            # (only set if notes is currently empty — check in Python to avoid .is_() SDK issues)
            try:
                _exp_check = admin.table("expenses").select("notes").eq("id", expense_id).maybe_single().execute()
                if _exp_check.data and not _exp_check.data.get("notes"):
                    admin.table("expenses").update({
                        "notes": f"Possible duplicate: {duplicates[0].get('reason', 'similar expense found')}"
                    }).eq("id", expense_id).execute()
            except Exception as exc:
                # Non-fatal: duplicate-warning note is a nice-to-have.
                logger.warning("Pipeline: duplicate-warning note update failed for expense=%s: %s", expense_id, exc)
    except Exception as e:
        logger.warning(f"Smart duplicate check failed: {e}")

    return expense_id, image_url
