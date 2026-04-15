"""Admin panel — locked to thomastom92@gmail.com only."""
import logging
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..auth import get_current_user
from ..database import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/admin", tags=["admin"])

ADMIN_EMAIL = "thomastom92@gmail.com"


def _require_admin(current_user: dict = Depends(get_current_user)):
    """Dependency that ensures only the admin can access."""
    email = current_user["user"].email
    if email != ADMIN_EMAIL:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.get("/health")
def admin_health(current_user: dict = Depends(_require_admin)):
    """Full system health check."""
    admin = get_supabase_admin()
    checks = {}

    # Database connection
    try:
        result = admin.table("expenses").select("id", count="exact").limit(1).execute()
        checks["database"] = {"status": "ok", "expense_count": result.count or 0}
    except Exception as e:
        checks["database"] = {"status": "error", "message": str(e)}

    # Tax rates
    try:
        result = admin.table("tax_rates").select("id", count="exact").execute()
        checks["tax_rates"] = {"status": "ok", "count": result.count or 0}
    except Exception as e:
        checks["tax_rates"] = {"status": "error", "message": str(e)}

    # Merchant aliases
    try:
        result = admin.table("merchant_aliases").select("id", count="exact").execute()
        checks["merchant_aliases"] = {"status": "ok", "count": result.count or 0}
    except Exception as e:
        checks["merchant_aliases"] = {"status": "error", "message": str(e)}

    # Vendor memory
    try:
        user_id = str(current_user["user"].id)
        result = admin.table("vendor_memory").select("id", count="exact").eq("user_id", user_id).execute()
        checks["vendor_memory"] = {"status": "ok", "count": result.count or 0}
    except Exception as e:
        checks["vendor_memory"] = {"status": "error", "message": str(e)}

    # API keys check (don't expose values, just check presence)
    from ..config import settings
    checks["api_keys"] = {
        "anthropic": "set" if settings.anthropic_api_key else "MISSING",
        "google_vision": "set" if settings.google_cloud_vision_api_key else "MISSING",
        "google_oauth": "set" if settings.google_oauth_client_id else "MISSING",
    }

    checks["version"] = "0.3.0"
    checks["timestamp"] = datetime.utcnow().isoformat()

    return checks


@router.get("/expenses")
def admin_list_expenses(current_user: dict = Depends(_require_admin)):
    """List all expenses with full details for admin review."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    try:
        result = admin.table("expenses").select("*").eq("user_id", user_id).order("created_at", desc=True).execute()
        return {"expenses": result.data or [], "count": len(result.data or [])}
    except Exception as e:
        return {"expenses": [], "count": 0, "error": str(e)}


class ReprocessRequest(BaseModel):
    expense_id: str


@router.post("/reprocess")
def admin_reprocess_expense(body: ReprocessRequest, current_user: dict = Depends(_require_admin)):
    """Re-run AI parser on an existing expense's OCR text."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    # Get the expense + its receipt OCR text
    try:
        expense = admin.table("expenses").select("*").eq("id", body.expense_id).eq("user_id", user_id).single().execute()
        if not expense.data:
            raise HTTPException(404, "Expense not found")

        receipt = admin.table("receipts").select("ocr_raw_text").eq("expense_id", body.expense_id).limit(1).execute()
        ocr_text = (receipt.data[0]["ocr_raw_text"] if receipt.data else "") or ""

        if not ocr_text:
            return {"status": "no_ocr", "message": "No OCR text available for this expense"}

        # Re-run AI parser
        from ..services.ai_parser import parse_receipt
        parsed = parse_receipt(ocr_text)

        # Update expense with new parsed data
        update_data = {}
        for field in ["merchant_name", "merchant_address", "amount_total", "amount_tax", "amount_tip",
                       "currency", "category", "document_type", "alcohol_total", "due_date", "expense_date", "expense_time"]:
            if field in parsed and parsed[field] is not None:
                update_data[field] = parsed[field]

        # Re-run merchant alias resolution
        if update_data.get("merchant_name"):
            from ..services.merchant_aliases import resolve_merchant
            display, cat = resolve_merchant(admin, update_data["merchant_name"])
            if display:
                update_data["merchant_name"] = display
            if cat and not update_data.get("category"):
                update_data["category"] = cat

        if update_data:
            admin.table("expenses").update(update_data).eq("id", body.expense_id).execute()

        return {"status": "ok", "updated_fields": list(update_data.keys()), "parsed": parsed}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Reprocess failed: {e}")
        raise HTTPException(500, f"Reprocess failed: {str(e)}")


class UpdateExpenseRequest(BaseModel):
    expense_id: str
    updates: dict


@router.post("/update-expense")
def admin_update_expense(body: UpdateExpenseRequest, current_user: dict = Depends(_require_admin)):
    """Directly update any expense fields."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    try:
        # Verify ownership
        check = admin.table("expenses").select("id").eq("id", body.expense_id).eq("user_id", user_id).execute()
        if not check.data:
            raise HTTPException(404, "Expense not found")

        # Apply updates
        result = admin.table("expenses").update(body.updates).eq("id", body.expense_id).execute()
        return {"status": "ok", "updated": result.data[0] if result.data else {}}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


class SqlRequest(BaseModel):
    sql: str


@router.post("/sql")
def admin_run_sql(body: SqlRequest, current_user: dict = Depends(_require_admin)):
    """Run raw SQL query (SELECT only for safety)."""
    sql = body.sql.strip()

    # Safety check — only allow SELECT and NOTIFY
    upper = sql.upper()
    if not (upper.startswith("SELECT") or upper.startswith("NOTIFY")):
        raise HTTPException(400, "Only SELECT and NOTIFY statements are allowed")

    admin = get_supabase_admin()
    try:
        result = admin.rpc("", {}).execute()  # This won't work for raw SQL
        # Use postgrest-py raw query instead
        # For safety, we'll use the table API for common queries
        return {"status": "error", "message": "Raw SQL not supported via Supabase client. Use Supabase Dashboard SQL Editor."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/reprocess-all")
def admin_reprocess_all(current_user: dict = Depends(_require_admin)):
    """Re-run AI parser on ALL expenses that have OCR text."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    try:
        # Get all receipts with OCR text
        receipts = admin.table("receipts").select("expense_id, ocr_raw_text").eq("user_id", user_id).execute()

        processed = 0
        errors = 0
        for r in (receipts.data or []):
            ocr_text = r.get("ocr_raw_text")
            expense_id = r.get("expense_id")
            if not ocr_text or not expense_id:
                continue

            try:
                from ..services.ai_parser import parse_receipt
                parsed = parse_receipt(ocr_text)

                update_data = {}
                for field in ["merchant_name", "document_type", "alcohol_total", "due_date"]:
                    if field in parsed and parsed[field] is not None:
                        update_data[field] = parsed[field]

                # Re-run merchant alias
                if update_data.get("merchant_name"):
                    from ..services.merchant_aliases import resolve_merchant
                    display, cat = resolve_merchant(admin, update_data["merchant_name"])
                    if display:
                        update_data["merchant_name"] = display
                    if cat:
                        update_data["category"] = cat

                if update_data:
                    admin.table("expenses").update(update_data).eq("id", expense_id).execute()
                    processed += 1
            except Exception as e:
                logger.warning(f"Reprocess failed for {expense_id}: {e}")
                errors += 1

        return {"status": "ok", "processed": processed, "errors": errors, "total": len(receipts.data or [])}
    except Exception as e:
        raise HTTPException(500, str(e))


@router.get("/zero-amount")
def admin_find_zero_amount(current_user: dict = Depends(_require_admin)):
    """Find expenses with zero or null amounts that need manual review."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    try:
        all_expenses = admin.table("expenses").select(
            "id, merchant_name, amount_total, expense_date, notes, status"
        ).eq("user_id", user_id).execute()

        zero_expenses = [e for e in (all_expenses.data or [])
                        if not e.get("amount_total") or float(e.get("amount_total") or 0) == 0]

        return {"expenses": zero_expenses, "count": len(zero_expenses)}
    except Exception as e:
        return {"expenses": [], "count": 0, "error": str(e)}


@router.get("/duplicates")
def admin_find_duplicates(current_user: dict = Depends(_require_admin)):
    """Find duplicate expenses — same amount + similar merchant + close dates."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    try:
        all_expenses = admin.table("expenses").select(
            "id, merchant_name, amount_total, expense_date, status, category, notes, created_at"
        ).eq("user_id", user_id).order("expense_date").execute()

        expenses = all_expenses.data or []
        duplicates = []
        seen = set()

        for i, e1 in enumerate(expenses):
            if e1["id"] in seen:
                continue
            group = [e1]
            for e2 in expenses[i + 1:]:
                if e2["id"] in seen:
                    continue
                # Same amount
                a1 = float(e1.get("amount_total") or 0)
                a2 = float(e2.get("amount_total") or 0)
                if a1 == 0 or abs(a1 - a2) > 0.01:
                    continue
                # Similar merchant
                m1 = (e1.get("merchant_name") or "").upper()[:10]
                m2 = (e2.get("merchant_name") or "").upper()[:10]
                if m1 and m2 and m1 != m2:
                    continue
                # Close dates (within 3 days)
                d1 = e1.get("expense_date") or ""
                d2 = e2.get("expense_date") or ""
                if d1 and d2:
                    from datetime import datetime, timedelta
                    try:
                        dt1 = datetime.strptime(d1, "%Y-%m-%d")
                        dt2 = datetime.strptime(d2, "%Y-%m-%d")
                        if abs((dt1 - dt2).days) > 3:
                            continue
                    except ValueError:
                        # Guard: unparseable date — skip date-closeness check for this pair.
                        pass
                group.append(e2)
                seen.add(e2["id"])

            if len(group) > 1:
                seen.add(e1["id"])
                duplicates.append({
                    "merchant": e1.get("merchant_name"),
                    "amount": float(e1.get("amount_total") or 0),
                    "date": e1.get("expense_date"),
                    "count": len(group),
                    "expenses": [{"id": e["id"], "merchant_name": e.get("merchant_name"), "amount_total": e.get("amount_total"), "expense_date": e.get("expense_date"), "status": e.get("status"), "created_at": e.get("created_at")} for e in group],
                })

        return {"duplicate_groups": duplicates, "total_groups": len(duplicates)}
    except Exception as e:
        raise HTTPException(500, str(e))


class DeleteDuplicatesRequest(BaseModel):
    expense_ids: list[str]


@router.post("/delete-duplicates")
def admin_delete_duplicates(body: DeleteDuplicatesRequest, current_user: dict = Depends(_require_admin)):
    """Delete specific expenses by ID (for cleaning up duplicates)."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    deleted = 0
    errors = 0
    for eid in body.expense_ids:
        try:
            # Verify ownership
            check = admin.table("expenses").select("id").eq("id", eid).eq("user_id", user_id).execute()
            if not check.data:
                errors += 1
                continue
            # Delete related records first
            try:
                admin.table("receipts").delete().eq("expense_id", eid).execute()
            except Exception as exc:
                logger.warning("admin delete_duplicates: receipts cleanup failed for expense=%s: %s", eid, exc)
            try:
                admin.table("attendees").delete().eq("expense_id", eid).execute()
            except Exception as exc:
                logger.warning("admin delete_duplicates: attendees cleanup failed for expense=%s: %s", eid, exc)
            try:
                admin.table("expense_line_items").delete().eq("expense_id", eid).execute()
            except Exception as exc:
                logger.warning("admin delete_duplicates: line_items cleanup failed for expense=%s: %s", eid, exc)
            # Delete expense
            admin.table("expenses").delete().eq("id", eid).execute()
            deleted += 1
        except Exception as exc:
            logger.exception("admin delete_duplicates: delete failed for expense=%s: %s", eid, exc)
            errors += 1

    return {"deleted": deleted, "errors": errors}


@router.post("/test-all")
def admin_test_all(current_user: dict = Depends(_require_admin)):
    """Comprehensive test of all features. Returns pass/fail for each."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()
    results = {}

    # === DATABASE TABLES ===
    tables = [
        "expenses", "receipts", "users", "tax_rates", "vendor_memory",
        "trips", "budgets", "integration_connections", "category_mappings",
        "bank_transactions", "recurring_expenses", "accountant_access",
        "expense_comments", "warranties", "expense_templates",
        "expense_groups", "forwarded_emails", "notifications",
        "merchant_aliases", "attendees", "expense_line_items",
    ]
    for table in tables:
        try:
            admin.table(table).select("id").limit(1).execute()
            results[f"table.{table}"] = "ok"
        except Exception as e:
            results[f"table.{table}"] = f"error: {str(e)[:80]}"

    # === API KEYS ===
    from ..config import settings
    results["key.anthropic"] = "ok" if settings.anthropic_api_key else "MISSING"
    results["key.google_vision"] = "ok" if settings.google_cloud_vision_api_key else "MISSING"
    results["key.google_oauth"] = "ok" if settings.google_oauth_client_id else "MISSING"

    # === MODULES ===
    module_tests = [
        ("module.tax_engine", "app.modules.tax.engine", "calculate_deduction"),
        ("module.tax_rates", "app.modules.tax.rates", "get_tax_rates"),
        ("module.tax_geocode", "app.modules.tax.geocode", "reverse_geocode_to_region"),
        ("module.tax_estimator", "app.modules.tax.estimator", "estimate_quarterly_tax_cra"),
        ("module.tax_home_office", "app.modules.tax.home_office", "calculate_home_office_ca"),
        ("module.tax_mileage", "app.modules.tax.mileage", "calculate_mileage_deduction_cra"),
        ("module.tax_cra", "app.modules.tax.cra_categories", "get_cra_category"),
        ("module.tax_irs", "app.modules.tax.irs_categories", "get_irs_category"),
        ("module.intel_work_hours", "app.modules.intel.work_hours", "suggest_expense_tag"),
        ("module.intel_vendor_memory", "app.modules.intel.vendor_memory", "lookup_vendor"),
        ("module.intel_transaction_matcher", "app.modules.intel.transaction_matcher", "match_transactions"),
        ("module.intel_recurring", "app.modules.intel.recurring_detector", "detect_recurring"),
        ("module.intel_duplicates", "app.modules.intel.smart_duplicate", "find_potential_duplicates"),
        ("module.intel_nl_search", "app.modules.intel.nl_search", "parse_natural_query"),
        ("module.intel_alerts", "app.modules.intel.missing_receipt_alerts", "get_missing_receipt_summary"),
        ("module.export_tax_package", "app.modules.export.tax_package", "generate_tax_package"),
        ("module.ai_parser", "app.services.ai_parser", "parse_receipt"),
        ("module.ocr", "app.services.ocr", "run_ocr"),
        ("module.pipeline", "app.services.pipeline", "process_receipt_bytes"),
        ("module.merchant_aliases", "app.services.merchant_aliases", "resolve_merchant"),
        ("module.gmail_scanner", "app.services.gmail_scanner", "scan_gmail_metadata"),
    ]
    for name, mod, func in module_tests:
        try:
            m = __import__(mod, fromlist=[func])
            getattr(m, func)
            results[name] = "ok"
        except Exception as e:
            results[name] = f"error: {str(e)[:80]}"

    # === FUNCTIONAL TESTS ===

    # Test: Can we read user's expenses?
    try:
        exps = admin.table("expenses").select("id, merchant_name, amount_total, status, expense_tag, category").eq("user_id", user_id).execute()
        results["func.read_expenses"] = f"ok ({len(exps.data or [])} expenses)"
    except Exception as e:
        results["func.read_expenses"] = f"error: {str(e)[:80]}"

    # Test: Can we read tax rates?
    try:
        rates = admin.table("tax_rates").select("country, region, tax_type, rate").limit(5).execute()
        results["func.read_tax_rates"] = f"ok ({len(rates.data or [])} rates)"
    except Exception as e:
        results["func.read_tax_rates"] = f"error: {str(e)[:80]}"

    # Test: Tax engine calculation
    try:
        from ..modules.tax.engine import calculate_deduction
        result = calculate_deduction(admin, 100.0, 13.0, "Meals & Entertainment", "CA", "ON")
        expected_deductible = 50.0  # 50% for meals
        if abs(result["tax_deductible_amount"] - expected_deductible) < 0.01:
            results["func.tax_calc_meals"] = f"ok (${result['tax_deductible_amount']} deductible)"
        else:
            results["func.tax_calc_meals"] = f"wrong: expected $50, got ${result['tax_deductible_amount']}"
    except Exception as e:
        results["func.tax_calc_meals"] = f"error: {str(e)[:80]}"

    # Test: Geocode
    try:
        from ..modules.tax.geocode import reverse_geocode_to_region
        result = reverse_geocode_to_region(43.65, -79.38)  # Toronto
        if result == ("CA", "ON"):
            results["func.geocode_toronto"] = "ok (CA, ON)"
        else:
            results["func.geocode_toronto"] = f"wrong: got {result}"
    except Exception as e:
        results["func.geocode_toronto"] = f"error: {str(e)[:80]}"

    # Test: Work hours prediction
    try:
        from ..modules.intel.work_hours import suggest_expense_tag
        tag, reason = suggest_expense_tag(
            {"expense_categories": ["business", "personal"], "work_hours_start": "09:00", "work_hours_end": "17:00", "work_days": [1,2,3,4,5]},
            expense_time="12:30", expense_date="2026-03-25"  # Tuesday lunch
        )
        results["func.work_hours_prediction"] = f"ok (suggested: {tag}, reason: {reason})"
    except Exception as e:
        results["func.work_hours_prediction"] = f"error: {str(e)[:80]}"

    # Test: CRA category lookup
    try:
        from ..modules.tax.cra_categories import get_cra_category
        cat = get_cra_category("Meals & Entertainment")
        if cat["line"] == "8523" and cat["deduction_pct"] == 0.5:
            results["func.cra_meals_category"] = f"ok (line {cat['line']}, {int(cat['deduction_pct']*100)}%)"
        else:
            results["func.cra_meals_category"] = f"wrong: {cat}"
    except Exception as e:
        results["func.cra_meals_category"] = f"error: {str(e)[:80]}"

    # Test: IRS category lookup
    try:
        from ..modules.tax.irs_categories import get_irs_category
        cat = get_irs_category("Meals & Entertainment")
        if cat["line"] == "24b" and cat["deduction_pct"] == 0.5:
            results["func.irs_meals_category"] = f"ok (line {cat['line']}, {int(cat['deduction_pct']*100)}%)"
        else:
            results["func.irs_meals_category"] = f"wrong: {cat}"
    except Exception as e:
        results["func.irs_meals_category"] = f"error: {str(e)[:80]}"

    # Test: Quarterly estimate
    try:
        from ..modules.tax.estimator import estimate_quarterly_tax_cra
        est = estimate_quarterly_tax_cra(80000, 20000, "ON")
        if est["quarterly_instalment"] > 0:
            results["func.quarterly_estimate"] = f"ok (${est['quarterly_instalment']}/quarter)"
        else:
            results["func.quarterly_estimate"] = f"wrong: ${est['quarterly_instalment']}"
    except Exception as e:
        results["func.quarterly_estimate"] = f"error: {str(e)[:80]}"

    # Test: Home office calc
    try:
        from ..modules.tax.home_office import calculate_home_office_us
        ho = calculate_home_office_us(1200, 150, annual_rent=18000, annual_utilities=2400)
        if ho.get("recommended") in ("simplified", "actual"):
            results["func.home_office"] = f"ok (recommended: {ho['recommended']})"
        else:
            results["func.home_office"] = f"wrong: {ho}"
    except Exception as e:
        results["func.home_office"] = f"error: {str(e)[:80]}"

    # === SUMMARY ===
    total = len(results)
    passed = sum(1 for v in results.values() if v.startswith("ok"))
    failed = total - passed

    return {
        "summary": {
            "total": total,
            "passed": passed,
            "failed": failed,
            "score": f"{round(passed/total*100)}%",
        },
        "results": results,
    }


@router.post("/clear-duplicate-notes")
def admin_clear_duplicate_notes(current_user: dict = Depends(_require_admin)):
    """Remove all auto-generated 'Possible duplicate' notes from expenses."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    try:
        all_expenses = admin.table("expenses").select("id, notes").eq("user_id", user_id).execute()
        cleared = 0
        for e in (all_expenses.data or []):
            notes = e.get("notes") or ""
            if "Possible duplicate" in notes or "possible duplicate" in notes:
                admin.table("expenses").update({"notes": None}).eq("id", e["id"]).execute()
                cleared += 1
        return {"cleared": cleared}
    except Exception as e:
        return {"error": str(e), "cleared": 0}


@router.get("/test-endpoints")
def admin_test_endpoints(current_user: dict = Depends(_require_admin)):
    """Quick health check on all major endpoint groups."""
    admin = get_supabase_admin()
    user_id = str(current_user["user"].id)
    results = {}

    tests = [
        ("expenses", lambda: admin.table("expenses").select("id").eq("user_id", user_id).limit(1).execute()),
        ("receipts", lambda: admin.table("receipts").select("id").eq("user_id", user_id).limit(1).execute()),
        ("tax_rates", lambda: admin.table("tax_rates").select("id").limit(1).execute()),
        ("vendor_memory", lambda: admin.table("vendor_memory").select("id").eq("user_id", user_id).limit(1).execute()),
        ("trips", lambda: admin.table("trips").select("id").eq("user_id", user_id).limit(1).execute()),
        ("budgets", lambda: admin.table("budgets").select("id").eq("user_id", user_id).limit(1).execute()),
        ("merchant_aliases", lambda: admin.table("merchant_aliases").select("id").limit(1).execute()),
        ("integration_connections", lambda: admin.table("integration_connections").select("id").eq("user_id", user_id).limit(1).execute()),
        ("recurring_expenses", lambda: admin.table("recurring_expenses").select("id").eq("user_id", user_id).limit(1).execute()),
        ("warranties", lambda: admin.table("warranties").select("id").eq("user_id", user_id).limit(1).execute()),
        ("expense_templates", lambda: admin.table("expense_templates").select("id").eq("user_id", user_id).limit(1).execute()),
    ]

    for name, test_fn in tests:
        try:
            test_fn()
            results[name] = "ok"
        except Exception as e:
            results[name] = f"error: {str(e)[:100]}"

    return results
