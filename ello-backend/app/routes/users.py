# ==========================================================
# FILE: app/routes/users.py
# MODULE: USERS ROUTES
# RESPONSIBILITY:
# - Profile
# - Edit profile
# - Followers / Following
# - Suggestions
# ==========================================================

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone

from app.database import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate
from app.schemas.suggestion import SuggestionResponse
from app.services.user_service import (
    get_full_profile,
    update_user_profile,
    list_followers,
    list_following,
    get_user_suggestions,
    get_user_by_id,
    search_users,
)

# ----------------------------------------------------------
# ROUTER CONFIG
# ----------------------------------------------------------

router = APIRouter(
    prefix="/users",
    tags=["Users"]
)

# ==========================================================
# GET MY PROFILE
# GET /users/me
# ==========================================================

@router.get("/me", response_model=UserResponse)
def my_profile(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    profile_data = get_full_profile(
        db=db,
        user_id=current_user.id,
        current_user_id=current_user.id
    )

    return profile_data


# ==========================================================
# SEARCH USERS
# GET /users/search?q=
# ==========================================================

@router.get("/search", response_model=List[UserResponse])
def search_users_route(
    q: str = Query(..., min_length=1, max_length=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return search_users(db=db, current_user_id=current_user.id, query=q)


# ==========================================================
# GET USER PROFILE
# GET /users/{user_id}
# ==========================================================

@router.get("/{user_id}", response_model=UserResponse)
def profile(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    profile_data = get_full_profile(
        db=db,
        user_id=user_id,
        current_user_id=current_user.id
    )

    if not profile_data:
        raise HTTPException(status_code=404, detail="User not found")

    return profile_data


# ==========================================================
# UPDATE PROFILE
# PUT /users/me
# ==========================================================

@router.put("/me", response_model=UserResponse)
def edit_profile(
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    update_data = data.model_dump(exclude_unset=True)

    updated_user = update_user_profile(
        db=db,
        user=current_user,
        update_data=update_data
    )

    # Retorna perfil completo atualizado
    return get_full_profile(
        db=db,
        user_id=updated_user.id,
        current_user_id=updated_user.id
    )


# ==========================================================
# LIST FOLLOWERS
# GET /users/{user_id}/followers
# ==========================================================

@router.get("/{user_id}/followers", response_model=List[UserResponse])
def followers(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    user = get_user_by_id(db, user_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return list_followers(db, user_id)


# ==========================================================
# LIST FOLLOWING
# GET /users/{user_id}/following
# ==========================================================

@router.get("/{user_id}/following", response_model=List[UserResponse])
def following(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    user = get_user_by_id(db, user_id)

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return list_following(db, user_id)


# ==========================================================
# USER SUGGESTIONS
# GET /users/suggestions
# ==========================================================

@router.get("/suggestions", response_model=List[SuggestionResponse])
def user_suggestions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return get_user_suggestions(db, current_user.id)


# ==========================================================
# MARK USER AS ONLINE
# POST /users/online
# ==========================================================

@router.post("/online")
def mark_online(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark current user as online (called on login/app load)"""
    current_user.is_online = True
    current_user.last_seen_at = None
    current_user.last_activity_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(current_user)
    
    return {
        "success": True,
        "message": "User marked as online",
        "is_online": current_user.is_online
    }


# ==========================================================
# MARK USER AS OFFLINE
# POST /users/offline
# ==========================================================

@router.post("/offline")
def mark_offline(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark current user as offline AND hide from nearby (called on logout)"""
    current_user.is_online = False
    current_user.is_visible_nearby = False
    current_user.last_seen_at = datetime.now(timezone.utc)
    current_user.last_activity_at = None
    db.commit()
    db.refresh(current_user)
    
    return {
        "success": True,
        "message": "User marked as offline and hidden from nearby",
        "is_online": current_user.is_online,
        "is_visible_nearby": current_user.is_visible_nearby,
        "last_seen_at": current_user.last_seen_at
    }


@router.post("/activity")
def mark_activity(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Refresh user activity timestamp from frontend interactions."""
    current_user.is_online = True
    current_user.last_seen_at = None
    current_user.last_activity_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(current_user)

    return {
        "success": True,
        "is_online": current_user.is_online,
        "last_activity_at": current_user.last_activity_at
    }