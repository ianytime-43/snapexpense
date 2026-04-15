"""Mileage/trip tracking endpoints."""

import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from ..auth import get_current_user
from ..database import get_supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/mileage", tags=["mileage"])


class TripCreate(BaseModel):
    start_address: Optional[str] = None
    end_address: Optional[str] = None
    start_lat: Optional[float] = None
    start_lng: Optional[float] = None
    end_lat: Optional[float] = None
    end_lng: Optional[float] = None
    distance_km: Optional[float] = None
    trip_date: Optional[str] = None
    trip_tag: str = "business"
    notes: Optional[str] = None


class TripUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    trip_tag: Optional[str] = None
    notes: Optional[str] = None
    start_address: Optional[str] = None
    end_address: Optional[str] = None
    distance_km: Optional[float] = None
    trip_date: Optional[str] = None


@router.get("/trips")
def list_trips(
    months: int = Query(default=3, ge=1, le=12),
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    from datetime import datetime, timedelta
    start_date = (datetime.now() - timedelta(days=months * 30)).strftime("%Y-%m-%d")

    result = (
        admin.table("trips")
        .select("*")
        .eq("user_id", user_id)
        .gte("trip_date", start_date)
        .order("trip_date", desc=True)
        .execute()
    )

    return {"trips": result.data or []}


@router.post("/trips")
def create_trip(
    body: TripCreate,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    trip_data = {
        "user_id": user_id,
        "trip_date": body.trip_date or date.today().isoformat(),
        "trip_tag": body.trip_tag,
        **{k: v for k, v in body.model_dump().items() if v is not None and k not in ("trip_date", "trip_tag")},
    }

    # Calculate miles from km
    if body.distance_km:
        trip_data["distance_miles"] = round(body.distance_km * 0.621371, 2)

    result = admin.table("trips").insert(trip_data).execute()
    return result.data[0] if result.data else {}


@router.patch("/trips/{trip_id}")
def update_trip(
    trip_id: str,
    body: TripUpdate,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if "distance_km" in update_data:
        update_data["distance_miles"] = round(update_data["distance_km"] * 0.621371, 2)

    result = (
        admin.table("trips")
        .update(update_data)
        .eq("id", trip_id)
        .eq("user_id", user_id)
        .execute()
    )

    return result.data[0] if result.data else {}


@router.delete("/trips/{trip_id}")
def delete_trip(
    trip_id: str,
    current_user: dict = Depends(get_current_user),
):
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()
    admin.table("trips").delete().eq("id", trip_id).eq("user_id", user_id).execute()
    return {"ok": True}


@router.get("/summary")
def get_mileage_summary(
    year: int = Query(default=None),
    current_user: dict = Depends(get_current_user),
):
    """Get mileage summary with deduction calculation."""
    user_id = str(current_user["user"].id)
    admin = get_supabase_admin()

    from datetime import datetime
    if not year:
        year = datetime.now().year

    start = f"{year}-01-01"
    end = f"{year}-12-31"

    result = (
        admin.table("trips")
        .select("distance_km, distance_miles, trip_tag")
        .eq("user_id", user_id)
        .gte("trip_date", start)
        .lte("trip_date", end)
        .execute()
    )

    trips = result.data or []
    business_trips = [t for t in trips if t.get("trip_tag") in ("business", "work")]
    total_km = sum(float(t.get("distance_km") or 0) for t in business_trips)
    total_miles = sum(float(t.get("distance_miles") or 0) for t in business_trips)

    # Get user country
    user = admin.table("users").select("country").eq("id", user_id).maybe_single().execute()
    country = (user.data or {}).get("country", "CA")

    from ..modules.tax.mileage import calculate_mileage_deduction_cra, calculate_mileage_deduction_irs

    if country == "CA":
        deduction = calculate_mileage_deduction_cra(total_km)
    else:
        deduction = calculate_mileage_deduction_irs(total_miles)

    return {
        "year": year,
        "total_trips": len(trips),
        "business_trips": len(business_trips),
        "total_km": round(total_km, 2),
        "total_miles": round(total_miles, 2),
        "deduction": deduction,
    }
