# ==========================================================
# FILE: app/routes/nearby.py
# ==========================================================

from fastapi import APIRouter, Depends, Query, Body
from datetime import datetime, timezone
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.dependencies import get_current_user
from app.services.nearby_service import get_nearby_users
from app.services.nearby_service import (
    list_nearby_favorites,
    add_nearby_favorite,
    remove_nearby_favorite,
    get_nearby_places,
)
from app.models.user import User
from app.schemas.nearby import NearbyVisibilityUpdate

router = APIRouter(prefix="/nearby", tags=["Nearby"])


# Location update request model
class LocationUpdate(BaseModel):
    latitude: float
    longitude: float


# ----------------------------------------------------------
# GET NEARBY USERS
# ----------------------------------------------------------

@router.get("/")
def nearby_users(
    radius_km: float = Query(5, ge=1, le=20000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Regra de negocio: usuario offline nao pode usar nearby nem ficar visivel.
    if not current_user.is_online:
        if current_user.is_visible_nearby:
            current_user.is_visible_nearby = False
            db.commit()
        return []

    if current_user.is_visible_nearby is not True:
        return []

    return get_nearby_users(db, current_user, radius_km)


# ----------------------------------------------------------
# TOGGLE VISIBILITY
# ----------------------------------------------------------

@router.patch("/visibility")
def toggle_nearby_visibility(
    data: NearbyVisibilityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if data.is_visible:
        current_user.is_online = True
        current_user.last_seen_at = None
        current_user.last_activity_at = datetime.now(timezone.utc)

    current_user.is_visible_nearby = data.is_visible

    db.commit()
    db.refresh(current_user)

    return {
        "success": True,
        "is_visible": current_user.is_visible_nearby
    }


@router.post("/visibility")
def toggle_nearby_visibility_post(
    data: NearbyVisibilityUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """POST alias to support beacon-style clients that cannot send PATCH."""
    return toggle_nearby_visibility(data=data, db=db, current_user=current_user)


# ----------------------------------------------------------
# OPTIONAL: UPDATE LOCATION
# (recommended for real Nearby systems)
# ----------------------------------------------------------

@router.patch("/location")
def update_location(
    data: LocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    current_user.latitude = data.latitude
    current_user.longitude = data.longitude

    db.commit()
    db.refresh(current_user)

    return {"success": True}


@router.get("/favorites")
def get_favorites(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return list_nearby_favorites(db, current_user)


@router.get("/places")
def get_places(
    radius_km: float = Query(5, ge=1, le=20000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return get_nearby_places(db, current_user, radius_km)


@router.post("/favorites/{favorite_user_id}")
def create_favorite(
    favorite_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return add_nearby_favorite(db, current_user, favorite_user_id)


@router.delete("/favorites/{favorite_user_id}")
def delete_favorite(
    favorite_user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return remove_nearby_favorite(db, current_user, favorite_user_id)