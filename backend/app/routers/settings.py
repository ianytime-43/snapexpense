import secrets

from fastapi import APIRouter, Depends, HTTPException

from ..auth import get_current_user
from ..database import get_supabase_admin

router = APIRouter(prefix="/settings", tags=["settings"])

FORWARDING_DOMAIN = "in.snapexpense.com"


@router.get("/forwarding-address")
def get_forwarding_address(current_user: dict = Depends(get_current_user)):
    """
    Return the user's unique forwarding email address.
    Creates one on first call (lazy provisioning).
    """
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    try:
        result = (
            admin.table("user_forwarding_addresses")
            .select("forwarding_address")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")

    if result and result.data:
        return {"forwarding_address": result.data[0]["forwarding_address"]}

    # Generate a random 8-char address and provision it
    token = secrets.token_hex(4)  # 8 hex chars, e.g. "a3f9c012"
    address = f"{token}@{FORWARDING_DOMAIN}"

    try:
        admin.table("user_forwarding_addresses").insert({
            "user_id": user_id,
            "forwarding_address": address,
        }).execute()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not create forwarding address: {exc}")

    return {"forwarding_address": address}
