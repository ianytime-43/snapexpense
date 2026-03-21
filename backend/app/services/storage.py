import uuid
from pathlib import Path

from supabase import Client

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".pdf"}
BUCKET = "receipts"


def upload_receipt_image(
    supabase: Client,
    user_id: str,
    file_bytes: bytes,
    filename: str,
    content_type: str,
) -> str:
    """
    Upload receipt image to Supabase Storage.
    Returns the public URL of the uploaded file.
    Raises on failure.
    """
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        ext = ".jpg"

    storage_path = f"{user_id}/{uuid.uuid4()}{ext}"

    supabase.storage.from_(BUCKET).upload(
        path=storage_path,
        file=file_bytes,
        file_options={"content-type": content_type, "upsert": "false"},
    )

    url: str = supabase.storage.from_(BUCKET).get_public_url(storage_path)
    return url
