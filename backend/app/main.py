from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers import calendar, email_ingest, expenses, export, groups, outlook, receipts, reminders, settings, users

app = FastAPI(title="SnapExpense API", version="0.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        settings.frontend_url,  # production Vercel URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.get("/api/health")
def health():
    return {"status": "ok", "version": "0.2.0"}
