import hashlib
import logging
from typing import Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from ..auth import get_current_user
from ..database import get_supabase_admin
from ..services import pipeline

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/receipts", tags=["receipts"])

VALID_SOURCES = {"email_forward", "camera", "photo_library", "upload", "share_to"}
MAX_FILE_SIZE = 25 * 1024 * 1024  # 25 MB


@router.post("/upload")
def upload_receipt(
    file: UploadFile = File(...),
    source: str = Form("upload"),
    latitude: Optional[float] = Form(None),
    longitude: Optional[float] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["user"].id)

    if source not in VALID_SOURCES:
        source = "upload"

    file_bytes = file.file.read()
    if len(file_bytes) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 25 MB)")
    if len(file_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    image_hash = hashlib.sha256(file_bytes).hexdigest()
    admin = get_supabase_admin()

    # Duplicate detection
    try:
        dup = (
            admin.table("receipts")
            .select("id, expense_id")
            .eq("image_hash", image_hash)
            .eq("user_id", user_id)
            .maybe_single()
            .execute()
        )
        if dup and dup.data and dup.data.get("expense_id"):
            return {"expense_id": dup.data["expense_id"], "duplicate": True}
    except Exception as exc:
        # Non-fatal: continue with fresh upload if dedup lookup fails.
        logger.warning("Receipt dedup lookup failed for user=%s: %s", user_id, exc)

    content_type = file.content_type or "image/jpeg"
    filename = file.filename or "receipt.jpg"

    try:
        expense_id, _ = pipeline.process_receipt_bytes(
            admin=admin,
            user_id=user_id,
            file_bytes=file_bytes,
            filename=file.filename or "receipt.jpg",
            content_type=file.content_type or "image/jpeg",
            source=source,
            latitude=latitude,
            longitude=longitude,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    return {"expense_id": expense_id, "duplicate": False}
