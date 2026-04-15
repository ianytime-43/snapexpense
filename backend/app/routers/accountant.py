"""
Accountant access router.
Prefix: /accountant

Security model (post-2026-04-14 hardening):
  * Tokens are random 32-byte URL-safe strings. Only sha256(token) is stored.
  * Plaintext token is returned ONCE at creation; never again.
  * List endpoint returns metadata only — no token field.
  * Tokens require expires_at (default 30d, max 365d) and can be revoked.
  * Every public token use is logged to accountant_access_log.
  * In-memory rate limit: 30 req/min per token hash. For prod, replace with Redis.
"""
import hashlib
import logging
import secrets
import time
from collections import defaultdict, deque
from datetime import date, datetime, timedelta, timezone
from threading import Lock
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field

from ..auth import get_current_user
from ..database import get_supabase_admin
from ..modules.export.tax_package import generate_tax_package

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/accountant", tags=["accountant"])

# ── Token helpers ─────────────────────────────────────────────────────────────

def _generate_token() -> tuple[str, str]:
    """Return (plaintext, sha256_hex). Plaintext is ~43 chars url-safe."""
    plaintext = secrets.token_urlsafe(32)
    digest = hashlib.sha256(plaintext.encode("utf-8")).hexdigest()
    return plaintext, digest


def _hash_token(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ── Rate limiter (in-memory; MVP) ─────────────────────────────────────────────
# NOTE: Single-process only. For multi-worker / multi-instance deployments
# replace this with a Redis-backed sliding window.

_RATE_LIMIT_PER_MIN = 30
_rate_lock = Lock()
_rate_buckets: dict[str, deque] = defaultdict(deque)


def _rate_limit_check(token_hash: str) -> None:
    now = time.monotonic()
    window_start = now - 60.0
    with _rate_lock:
        bucket = _rate_buckets[token_hash]
        while bucket and bucket[0] < window_start:
            bucket.popleft()
        if len(bucket) >= _RATE_LIMIT_PER_MIN:
            raise HTTPException(status_code=429, detail="Rate limit exceeded (30 req/min)")
        bucket.append(now)


# ── Schemas ───────────────────────────────────────────────────────────────────

class InviteRequest(BaseModel):
    accountant_email: EmailStr
    name: Optional[str] = None
    expires_in_days: int = Field(default=30, ge=1, le=365)


class CommentRequest(BaseModel):
    expense_id: str
    comment: str


# ── Owner endpoints ───────────────────────────────────────────────────────────

@router.post("/invite")
def invite_accountant(body: InviteRequest, current_user: dict = Depends(get_current_user)):
    """
    Invite an accountant by email. Generates a read-only access token.

    Returns the plaintext token ONCE — the caller must surface it to the owner
    immediately. We only persist sha256(token); we cannot recover the plaintext.
    """
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    plaintext, digest = _generate_token()
    expires_at = _utcnow() + timedelta(days=body.expires_in_days)

    payload = {
        "user_id": user_id,
        "accountant_email": body.accountant_email,
        "token_hash": digest,
        "name": body.name,
        "expires_at": expires_at.isoformat(),
        "last_used_at": None,
        "revoked_at": None,
        "granted_at": _utcnow().isoformat(),
    }

    # Upsert on (user_id, accountant_email) — rotating the token revokes the old one.
    admin.table("accountant_access").upsert(
        payload, on_conflict="user_id,accountant_email"
    ).execute()

    fetched = (
        admin.table("accountant_access")
        .select("id, accountant_email, name, granted_at, expires_at, scopes")
        .eq("user_id", user_id)
        .eq("accountant_email", body.accountant_email)
        .maybe_single()
        .execute()
    )
    row = (fetched.data if fetched else None) or {}

    return {
        "id": row.get("id"),
        "accountant_email": row.get("accountant_email") or body.accountant_email,
        "name": row.get("name"),
        "granted_at": row.get("granted_at"),
        "expires_at": row.get("expires_at"),
        "scopes": row.get("scopes") or ["read_expenses", "comment"],
        # Plaintext token — shown once. Never returned again.
        "access_token": plaintext,
        "access_token_notice": (
            "Copy this token now — it will not be shown again. "
            "If lost, revoke and re-invite."
        ),
    }


@router.delete("/revoke/{email}")
def revoke_accountant(email: str, current_user: dict = Depends(get_current_user)):
    """Revoke accountant access by email (soft-delete via revoked_at)."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    admin.table("accountant_access").update(
        {"revoked_at": _utcnow().isoformat()}
    ).eq("user_id", user_id).eq("accountant_email", email).execute()
    return {"revoked": True}


@router.delete("/shares/{share_id}")
def revoke_share(share_id: str, current_user: dict = Depends(get_current_user)):
    """Revoke a single share by id."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    admin.table("accountant_access").update(
        {"revoked_at": _utcnow().isoformat()}
    ).eq("user_id", user_id).eq("id", share_id).execute()
    return {"revoked": True}


@router.get("/access-list")
def list_access(current_user: dict = Depends(get_current_user)):
    """List all accountants with access. Never returns tokens or hashes."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    result = (
        admin.table("accountant_access")
        .select(
            "id, accountant_email, name, granted_at, last_used_at, "
            "expires_at, revoked_at, scopes"
        )
        .eq("user_id", user_id)
        .order("granted_at", desc=True)
        .execute()
    )
    rows = result.data or []
    # Surface last_accessed_at alias for legacy UI that still reads it.
    for r in rows:
        r.setdefault("last_accessed_at", r.get("last_used_at"))
    return rows


@router.get("/tax-package/{year}")
def download_tax_package(year: int, current_user: dict = Depends(get_current_user)):
    """Download an annual tax package ZIP for the given year."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    if year < 2000 or year > datetime.utcnow().year + 1:
        raise HTTPException(status_code=400, detail="Invalid year")

    buffer = generate_tax_package(admin, user_id, year)
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=tax_package_{year}.zip"},
    )


# ── Public accountant endpoints (token-based, no auth) ───────────────────────

def _client_ip(request: Optional[Request]) -> Optional[str]:
    if request is None:
        return None
    # Respect X-Forwarded-For when behind Railway/Vercel proxy.
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else None


def _log_access(
    admin,
    *,
    access_id: Optional[str],
    user_id: Optional[str],
    request: Optional[Request],
    status_code: int,
) -> None:
    if not access_id or not user_id:
        return
    try:
        admin.table("accountant_access_log").insert(
            {
                "access_id": access_id,
                "user_id": user_id,
                "ip_address": _client_ip(request),
                "user_agent": request.headers.get("user-agent") if request else None,
                "path": str(request.url.path) if request else None,
                "status_code": status_code,
            }
        ).execute()
    except Exception as exc:  # pragma: no cover — logging must never break the request
        logger.warning("accountant_access_log insert failed: %s", exc)


def _resolve_token(token: str, request: Optional[Request] = None):
    """
    Look up accountant_access row by sha256(token); enforce expiry + revocation.
    Logs the access attempt on success. Raises 401/404 on failure.
    """
    if not token or len(token) < 20:
        raise HTTPException(status_code=401, detail="Invalid access token")

    digest = _hash_token(token)
    _rate_limit_check(digest)

    admin = get_supabase_admin()
    result = (
        admin.table("accountant_access")
        .select("*")
        .eq("token_hash", digest)
        .maybe_single()
        .execute()
    )
    row = result.data if result else None
    if not row:
        raise HTTPException(status_code=401, detail="Invalid access token")

    if row.get("revoked_at"):
        raise HTTPException(status_code=401, detail="Access token revoked")

    expires_at = row.get("expires_at")
    if expires_at:
        try:
            exp_dt = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            if _utcnow() >= exp_dt:
                raise HTTPException(status_code=401, detail="Access token expired")
        except HTTPException:
            raise
        except Exception:
            # Malformed timestamp — treat as expired defensively.
            raise HTTPException(status_code=401, detail="Access token expired")

    # Record last-used + audit log.
    try:
        admin.table("accountant_access").update(
            {"last_used_at": _utcnow().isoformat()}
        ).eq("token_hash", digest).execute()
    except Exception:
        pass
    _log_access(
        admin,
        access_id=row.get("id"),
        user_id=row.get("user_id"),
        request=request,
        status_code=200,
    )
    return row


@router.get("/view/{token}")
def accountant_view(token: str, request: Request):
    """Public read-only view for accountant — non-personal expenses + comments."""
    row = _resolve_token(token, request)
    user_id = row["user_id"]
    admin = get_supabase_admin()

    try:
        expenses_result = (
            admin.table("expenses")
            .select("*")
            .eq("user_id", user_id)
            .order("expense_date", desc=True)
            .execute()
        )
    except Exception:
        expenses_result = type("obj", (object,), {"data": []})()
    expenses_data = [e for e in (expenses_result.data or []) if e.get("expense_tag") != "personal"]

    expense_ids = [e["id"] for e in expenses_data]

    comments = []
    if expense_ids:
        comments_result = (
            admin.table("expense_comments")
            .select("*")
            .in_("expense_id", expense_ids)
            .order("created_at")
            .execute()
        )
        comments = comments_result.data or []

    return {
        "accountant_email": row["accountant_email"],
        "granted_at": row["granted_at"],
        "expenses": expenses_data,
        "comments": comments,
    }


# ── Scoped share endpoints (date-range, content toggles) ─────────────────────

class CreateShareRequest(BaseModel):
    label: Optional[str] = Field(default=None, max_length=120)
    date_from: date
    date_to: date
    expires_in_days: int = Field(default=30, ge=1, le=365)
    include_receipts: bool = True
    include_invoices: bool = True
    include_mileage: bool = False
    accountant_email: Optional[EmailStr] = None


def _mask_email(email: Optional[str]) -> str:
    if not email or "@" not in email:
        return "***"
    local, _, domain = email.partition("@")
    if not local:
        return "***@" + domain
    return f"{local[0]}***@{domain}"


_PUBLIC_RATE_LIMIT_PER_MIN = 60
_public_rate_lock = Lock()
_public_rate_buckets: dict[str, deque] = defaultdict(deque)


def _public_rate_limit_check(token_hash: str) -> None:
    now = time.monotonic()
    window_start = now - 60.0
    with _public_rate_lock:
        bucket = _public_rate_buckets[token_hash]
        while bucket and bucket[0] < window_start:
            bucket.popleft()
        if len(bucket) >= _PUBLIC_RATE_LIMIT_PER_MIN:
            raise HTTPException(status_code=429, detail="Rate limit exceeded (60 req/min)")
        bucket.append(now)


@router.post("/shares")
def create_share(body: CreateShareRequest, current_user: dict = Depends(get_current_user)):
    """Create a date-scoped share for an accountant.

    Returns the plaintext token ONCE. Only sha256(token) is persisted.
    """
    if body.date_from > body.date_to:
        raise HTTPException(status_code=400, detail="date_from must be <= date_to")
    if not (body.include_receipts or body.include_invoices or body.include_mileage):
        raise HTTPException(status_code=400, detail="Share must include at least one content type")

    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    plaintext, digest = _generate_token()
    expires_at = _utcnow() + timedelta(days=body.expires_in_days)

    # A given (user_id, accountant_email) can only have one active share row
    # (upsert rotates the token). For email-less shares we always insert.
    email = body.accountant_email or f"share+{secrets.token_hex(4)}@snapexpense.local"

    payload = {
        "user_id": user_id,
        "accountant_email": email,
        "token_hash": digest,
        "name": body.label,
        "label": body.label,
        "date_from": body.date_from.isoformat(),
        "date_to": body.date_to.isoformat(),
        "include_receipts": body.include_receipts,
        "include_invoices": body.include_invoices,
        "include_mileage": body.include_mileage,
        "expires_at": expires_at.isoformat(),
        "granted_at": _utcnow().isoformat(),
        "last_used_at": None,
        "revoked_at": None,
        "view_count": 0,
    }

    admin.table("accountant_access").upsert(
        payload, on_conflict="user_id,accountant_email"
    ).execute()

    fetched = (
        admin.table("accountant_access")
        .select(
            "id, accountant_email, label, date_from, date_to, granted_at, "
            "expires_at, include_receipts, include_invoices, include_mileage"
        )
        .eq("user_id", user_id)
        .eq("token_hash", digest)
        .maybe_single()
        .execute()
    )
    row = (fetched.data if fetched else None) or {}

    return {
        "id": row.get("id"),
        "label": row.get("label") or body.label,
        "date_from": row.get("date_from") or body.date_from.isoformat(),
        "date_to": row.get("date_to") or body.date_to.isoformat(),
        "expires_at": row.get("expires_at"),
        "include_receipts": row.get("include_receipts", body.include_receipts),
        "include_invoices": row.get("include_invoices", body.include_invoices),
        "include_mileage": row.get("include_mileage", body.include_mileage),
        "access_token": plaintext,
        "access_token_notice": (
            "Copy this link now — the token will not be shown again. "
            "If lost, revoke and create a new share."
        ),
    }


# ── Public recipient endpoint ────────────────────────────────────────────────

def _parse_iso_date(value: Optional[str]) -> Optional[date]:
    if not value:
        return None
    try:
        return date.fromisoformat(str(value)[:10])
    except Exception:
        return None


def _resolve_public_token(token: str, request: Optional[Request] = None):
    """Like _resolve_token but uses the public (60/min) rate limit bucket.

    Does NOT log or bump last_used_at — callers handle that after validating
    the requested date range against the share window.
    """
    if not token or len(token) < 20:
        raise HTTPException(status_code=401, detail="Invalid access token")

    digest = _hash_token(token)
    _public_rate_limit_check(digest)

    admin = get_supabase_admin()
    result = (
        admin.table("accountant_access")
        .select("*")
        .eq("token_hash", digest)
        .maybe_single()
        .execute()
    )
    row = result.data if result else None
    if not row:
        raise HTTPException(status_code=401, detail="Invalid access token")

    if row.get("revoked_at"):
        raise HTTPException(status_code=401, detail="Access token revoked")

    expires_at = row.get("expires_at")
    if expires_at:
        try:
            exp_dt = datetime.fromisoformat(str(expires_at).replace("Z", "+00:00"))
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            if _utcnow() >= exp_dt:
                raise HTTPException(status_code=401, detail="Access token expired")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=401, detail="Access token expired")

    return row, admin, digest


@router.get("/public")
def accountant_public_view(
    request: Request,
    token: str = Query(..., min_length=20),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
):
    """Public read-only recipient view.

    Token is the sole auth. Server hashes plaintext with sha256 and looks up
    the share by hash. Rate-limited at 60 req/min per token.
    """
    row, admin, digest = _resolve_public_token(token, request)

    # Determine the effective date window: intersection of requested range and
    # the share's allowed window. Requested range must fall inside the share.
    share_from = _parse_iso_date(row.get("date_from"))
    share_to = _parse_iso_date(row.get("date_to"))
    req_from = _parse_iso_date(date_from) or share_from
    req_to = _parse_iso_date(date_to) or share_to

    if share_from and req_from and req_from < share_from:
        raise HTTPException(status_code=400, detail="date_from is outside the share window")
    if share_to and req_to and req_to > share_to:
        raise HTTPException(status_code=400, detail="date_to is outside the share window")
    if req_from and req_to and req_from > req_to:
        raise HTTPException(status_code=400, detail="date_from must be <= date_to")

    user_id = row["user_id"]
    include_receipts = bool(row.get("include_receipts", True))
    include_invoices = bool(row.get("include_invoices", True))
    include_mileage = bool(row.get("include_mileage", False))

    # Fetch owner email for masking.
    owner_email = None
    try:
        user_row = (
            admin.table("users")
            .select("email")
            .eq("id", user_id)
            .maybe_single()
            .execute()
        )
        owner_email = (user_row.data or {}).get("email") if user_row else None
    except Exception:
        owner_email = None

    # Fetch expenses within the resolved window.
    expenses_data: list[dict] = []
    if include_receipts or include_invoices:
        try:
            q = admin.table("expenses").select("*").eq("user_id", user_id)
            if req_from:
                q = q.gte("expense_date", req_from.isoformat())
            if req_to:
                q = q.lte("expense_date", req_to.isoformat())
            result = q.order("expense_date", desc=True).execute()
            expenses_data = [e for e in (result.data or []) if e.get("expense_tag") != "personal"]
        except Exception:
            expenses_data = []

        # Partition by include flags. Treat doc_type == "invoice" as invoice,
        # everything else as receipt.
        def _is_invoice(e: dict) -> bool:
            return (e.get("doc_type") or "").lower() == "invoice"

        filtered = []
        for e in expenses_data:
            if _is_invoice(e) and include_invoices:
                filtered.append(e)
            elif not _is_invoice(e) and include_receipts:
                filtered.append(e)
        expenses_data = filtered

    # Totals.
    count = len(expenses_data)
    subtotal = 0.0
    tax_total = 0.0
    grand_total = 0.0
    for e in expenses_data:
        amt = float(e.get("amount_total") or 0)
        tax = float(e.get("tax_total") or e.get("gst_hst") or 0)
        grand_total += amt
        tax_total += tax
        subtotal += max(amt - tax, 0)

    # Mileage.
    mileage_payload = None
    if include_mileage:
        try:
            mq = admin.table("mileage_trips").select("*").eq("user_id", user_id)
            if req_from:
                mq = mq.gte("trip_date", req_from.isoformat())
            if req_to:
                mq = mq.lte("trip_date", req_to.isoformat())
            m_result = mq.order("trip_date", desc=True).execute()
            trips = m_result.data or []
        except Exception:
            trips = []
        total_km = sum(float(t.get("distance_km") or 0) for t in trips)
        mileage_payload = {"trips": trips, "total_km": round(total_km, 2), "count": len(trips)}

    # Bump view_count + last_used_at + audit log.
    try:
        admin.table("accountant_access").update(
            {
                "last_used_at": _utcnow().isoformat(),
                "view_count": int(row.get("view_count") or 0) + 1,
            }
        ).eq("token_hash", digest).execute()
    except Exception:
        pass
    _log_access(
        admin,
        access_id=row.get("id"),
        user_id=user_id,
        request=request,
        status_code=200,
    )

    return {
        "share": {
            "owner_email_masked": _mask_email(owner_email),
            "label": row.get("label") or row.get("name"),
            "date_range": {
                "from": share_from.isoformat() if share_from else None,
                "to": share_to.isoformat() if share_to else None,
            },
            "expires_at": row.get("expires_at"),
            "include_receipts": include_receipts,
            "include_invoices": include_invoices,
            "include_mileage": include_mileage,
        },
        "expenses": expenses_data,
        "totals": {
            "count": count,
            "subtotal": round(subtotal, 2),
            "tax_total": round(tax_total, 2),
            "grand_total": round(grand_total, 2),
        },
        "mileage": mileage_payload,
    }


@router.post("/comment/{token}")
def add_comment(token: str, body: CommentRequest, request: Request):
    """Accountant adds a comment on an expense (public endpoint, token auth)."""
    row = _resolve_token(token, request)
    admin = get_supabase_admin()

    expense = (
        admin.table("expenses")
        .select("id, user_id")
        .eq("id", body.expense_id)
        .eq("user_id", row["user_id"])
        .maybe_single()
        .execute()
    )
    if not expense.data:
        raise HTTPException(status_code=404, detail="Expense not found")

    result = (
        admin.table("expense_comments")
        .insert(
            {
                "expense_id": body.expense_id,
                "author_email": row["accountant_email"],
                "comment": body.comment,
            }
        )
        .execute()
    )
    return result.data[0] if result.data else {}
