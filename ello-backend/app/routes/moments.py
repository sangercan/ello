# ==========================================================
# FILE: app/routes/moments.py
# MODULE: MOMENTS ROUTES
# RESPONSIBILITY:
# - Create Moment
# - Moments Intelligence Timeline
# - Delete Moment
# ==========================================================

from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session

from app.database import get_db
from app.core.dependencies import get_current_user, get_optional_current_user
from app.models.user import User
from app.schemas.moment import MomentCreate

from app.services.moment_service import (
    create_moment,
    delete_moment,
    update_moment,
    get_moments_intelligence
)
from app.core.websocket_manager import manager
from app.services.notification_service import create_notifications_for_followers

# ==========================================================
# ROUTER CONFIG
# ==========================================================

router = APIRouter(
    prefix="/moments",
    tags=["Moments"]
)

# ==========================================================
# CREATE MOMENT
# POST /moments/
# ==========================================================

@router.post("/")
async def create(
    data: MomentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    moment = create_moment(db, current_user, data)
    await manager.broadcast({
        "type": "moment_created",
        "moment": {
            "id": moment.id,
            "content": moment.content,
            "media_url": moment.media_url,
            "created_at": moment.created_at.isoformat() if moment.created_at else None,
            "user_id": current_user.id,
            "author": {
                "id": current_user.id,
                "full_name": current_user.full_name,
                "username": current_user.username,
                "avatar_url": current_user.avatar_url,
                "mood": current_user.mood,
            },
        },
    })

    follower_notifications = create_notifications_for_followers(
        db,
        actor_id=current_user.id,
        notif_type="new_post",
        reference_id=moment.id,
        message="publicou um novo moment",
    )
    for row in follower_notifications:
        await manager.send_to_user(row.user_id, {
            "type": "notification_created",
            "notification": {
                "id": row.id,
                "user_id": row.user_id,
                "actor_id": row.actor_id,
                "type": row.type,
                "reference_id": row.reference_id,
                "content": row.message,
                "message": row.message,
                "is_read": bool(row.is_read),
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "actor": {
                    "id": current_user.id,
                    "username": current_user.username,
                    "full_name": current_user.full_name,
                    "avatar_url": current_user.avatar_url,
                    "mood": current_user.mood,
                },
            },
        })

    return moment


@router.post("")
async def create_no_slash(
    data: MomentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Alias route to accept POST requests without trailing slash and avoid 405."""
    return await create(db=db, current_user=current_user, data=data)


# ==========================================================
# MOMENTS INTELLIGENCE TIMELINE
# GET /moments/
# ==========================================================

@router.get("/")
def list_moments(
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user)
):
    return get_moments_intelligence(
        db=db,
        current_user=current_user,
        page=page,
        limit=limit
    )


@router.get("")
def list_moments_no_slash(
    page: int = 1,
    limit: int = 20,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user)
):
    """Alias route to accept requests without trailing slash and avoid 307 redirects."""
    return list_moments(page=page, limit=limit, db=db, current_user=current_user)


# ==========================================================
# DELETE MOMENT
# DELETE /moments/{moment_id}
# ==========================================================

@router.delete("/{moment_id}")
async def delete(
    moment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    result = delete_moment(db, current_user, moment_id)
    await manager.broadcast({
        "type": "moment_deleted",
        "moment_id": moment_id,
        "user_id": current_user.id,
    })
    return result


@router.patch("/{moment_id}")
async def edit(
    moment_id: int,
    data: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    updated = update_moment(db, current_user, moment_id, data.get("content"))
    await manager.broadcast({
        "type": "moment_updated",
        "moment": {
            "id": updated.id,
            "content": updated.content,
            "media_url": updated.media_url,
            "user_id": updated.user_id,
            "created_at": updated.created_at.isoformat() if updated.created_at else None,
        },
    })
    return updated
