"""Generate annual tax package for accountant."""
import json
import logging
from io import BytesIO
from zipfile import ZipFile
from supabase import Client

logger = logging.getLogger(__name__)

def generate_tax_package(admin: Client, user_id: str, year: int) -> BytesIO:
    """Generate a ZIP containing all tax-relevant data for a year."""
    start = f"{year}-01-01"
    end = f"{year}-12-31"

    # Fetch ALL user expenses, filter in Python to handle NULLs properly
    all_expenses = admin.table("expenses").select("*").eq("user_id", user_id).execute()
    # Include: expenses in date range OR with no date, exclude only explicitly "personal" tagged
    expenses_data = []
    for e in (all_expenses.data or []):
        ed = e.get("expense_date")
        tag = e.get("expense_tag")
        # Skip only explicitly personal-tagged expenses
        if tag == "personal":
            continue
        # Include if date is in range, or date is null
        if ed is None or (ed >= start and ed <= end):
            expenses_data.append(e)

    class _Result:
        def __init__(self, data): self.data = data
    expenses = _Result(expenses_data)

    user = admin.table("users").select("full_name, company_name, country, region").eq("id", user_id).maybe_single().execute()
    profile = user.data or {}

    # Group by tax line
    by_line = {}
    for e in (expenses.data or []):
        line = e.get("tax_line") or "Other"
        if line not in by_line:
            by_line[line] = {"label": e.get("deduction_rule", line), "expenses": [], "total": 0, "deductible": 0}
        by_line[line]["expenses"].append(e)
        by_line[line]["total"] += float(e.get("amount_total") or 0)
        by_line[line]["deductible"] += float(e.get("tax_deductible_amount") or 0)

    summary = {
        "year": year,
        "taxpayer": profile.get("full_name", ""),
        "company": profile.get("company_name", ""),
        "country": profile.get("country", "CA"),
        "total_expenses": sum(float(e.get("amount_total") or 0) for e in (expenses.data or [])),
        "total_deductible": sum(float(e.get("tax_deductible_amount") or 0) for e in (expenses.data or [])),
        "total_itc": sum(float(e.get("itc_claimable") or 0) for e in (expenses.data or [])),
        "by_tax_line": {k: {"total": round(v["total"], 2), "deductible": round(v["deductible"], 2), "count": len(v["expenses"])} for k, v in by_line.items()},
        "expense_count": len(expenses.data or []),
    }

    buffer = BytesIO()
    with ZipFile(buffer, 'w') as zf:
        zf.writestr(f"tax_summary_{year}.json", json.dumps(summary, indent=2, default=str))
        zf.writestr(f"expenses_{year}.json", json.dumps(expenses.data or [], indent=2, default=str))
    buffer.seek(0)
    return buffer
