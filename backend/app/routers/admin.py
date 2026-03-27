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
            except Exception:
                pass
            try:
                admin.table("attendees").delete().eq("expense_id", eid).execute()
            except Exception:
                pass
            try:
                admin.table("expense_line_items").delete().eq("expense_id", eid).execute()
            except Exception:
                pass
            # Delete expense
            admin.table("expenses").delete().eq("id", eid).execute()
            deleted += 1
        except Exception:
            errors += 1

    return {"deleted": deleted, "errors": errors}


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
