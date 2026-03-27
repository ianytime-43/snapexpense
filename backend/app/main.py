import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import account, accountant, admin as admin_router, bank, calendar, email_ingest, enterprise, expenses, export, extras, gmail_scan, groups, insights, integrations, mileage, outlook, outlook_scan, receipts, reminders, search, settings, splits, subscriptions, tax, users, zapier

app = FastAPI(title="SnapExpense API", version="0.3.0")

_frontend_url = os.environ.get("FRONTEND_URL", "")
_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://127.0.0.1:5173",
    "https://snapexpense.vercel.app",  # Always allow production
]
if _frontend_url and _frontend_url not in _origins:
    _origins.append(_frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(account.router, prefix="/api")
app.include_router(expenses.router, prefix="/api")
app.include_router(receipts.router, prefix="/api")
app.include_router(email_ingest.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(calendar.router, prefix="/api")
app.include_router(outlook.router, prefix="/api")
app.include_router(export.router, prefix="/api")
app.include_router(groups.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(reminders.router, prefix="/api")
app.include_router(gmail_scan.router, prefix="/api")
app.include_router(outlook_scan.router)
app.include_router(insights.router, prefix="/api")
app.include_router(splits.router, prefix="/api")
app.include_router(tax.router, prefix="/api")
app.include_router(mileage.router, prefix="/api")
app.include_router(integrations.router, prefix="/api")
app.include_router(bank.router, prefix="/api")
app.include_router(subscriptions.router, prefix="/api")
app.include_router(accountant.router, prefix="/api")
app.include_router(enterprise.router, prefix="/api")
app.include_router(extras.router, prefix="/api")


app.include_router(search.router, prefix="/api")
app.include_router(zapier.router, prefix="/api")
app.include_router(admin_router.router, prefix="/api")


@app.get("/api/health")
def health():
    """Full health check — tests DB, API keys, all critical systems."""
    from .database import get_supabase_admin
    from .config import settings

    checks = {}
    all_ok = True

    # Database
    try:
        admin = get_supabase_admin()
        result = admin.table("expenses").select("id").limit(1).execute()
        checks["database"] = "ok"
    except Exception as e:
        checks["database"] = f"error: {str(e)[:100]}"
        all_ok = False

    # API Keys
    checks["anthropic_key"] = "ok" if settings.anthropic_api_key else "MISSING"
    checks["google_vision_key"] = "ok" if settings.google_cloud_vision_api_key else "MISSING"
    checks["google_oauth"] = "ok" if settings.google_oauth_client_id else "MISSING"
    if not settings.anthropic_api_key or not settings.google_cloud_vision_api_key:
        all_ok = False

    # Critical tables
    try:
        admin.table("tax_rates").select("id").limit(1).execute()
        checks["tax_rates"] = "ok"
    except Exception:
        checks["tax_rates"] = "error"
        all_ok = False

    try:
        admin.table("merchant_aliases").select("id").limit(1).execute()
        checks["merchant_aliases"] = "ok"
    except Exception:
        checks["merchant_aliases"] = "error"
        all_ok = False

    return {
        "status": "ok" if all_ok else "degraded",
        "version": "0.3.1",
        "checks": checks,
    }
