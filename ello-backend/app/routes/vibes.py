# ==========================================================
# VIBES ROUTES
# ==========================================================

from fastapi import APIRouter, Depends, Body
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.dependencies import get_current_user, get_optional_current_user
from app.schemas.vibe import VibeCreate
from app.services.vibe_service import create_vibe, get_vibes, update_vibe, delete_vibe
from app.models.user import User
from app.core.websocket_manager import manager
from app.services.notification_service import create_notifications_for_followers
from typing import Optional

router = APIRouter(prefix="/vibes", tags=["Vibes"])


@router.post("/")
async def create(data: VibeCreate,
                 db: Session = Depends(get_db),
                 current_user=Depends(get_current_user)):
    """Create a new vibe (requires authentication)"""
    vibe = create_vibe(db, current_user, data)

    await manager.broadcast({
        "type": "vibe_created",
        "vibe_id": vibe.id,
        "user_id": vibe.user_id,
        "created_at": vibe.created_at.isoformat() if vibe.created_at else None,
    })

    follower_notifications = create_notifications_for_followers(
        db,
        actor_id=current_user.id,
        notif_type="new_post",
        reference_id=vibe.id,
        message="publicou uma nova vibe",
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
                },
            },
        })

    return vibe


@router.post("")
async def create_no_slash(data: VibeCreate,
                          db: Session = Depends(get_db),
                          current_user=Depends(get_current_user)):
    """Alias route to accept POST /vibes without trailing slash."""
    vibe = create_vibe(db, current_user, data)

    await manager.broadcast({
        "type": "vibe_created",
        "vibe_id": vibe.id,
        "user_id": vibe.user_id,
        "created_at": vibe.created_at.isoformat() if vibe.created_at else None,
    })

    return vibe


@router.get("/")
def list(page: int = 1,
         limit: int = 20,
         db: Session = Depends(get_db),
         current_user: Optional[User] = Depends(get_optional_current_user)):
    """List vibes (optional authentication)"""
    return get_vibes(db, current_user, page, limit)


@router.get("")
def list_no_slash(page: int = 1,
                  limit: int = 20,
                  db: Session = Depends(get_db),
                  current_user: Optional[User] = Depends(get_optional_current_user)):
    """Alias route to avoid redirects for /vibes without trailing slash."""
    return get_vibes(db, current_user, page, limit)


@router.patch("/{vibe_id}")
async def edit(vibe_id: int,
               data: dict = Body(...),
               db: Session = Depends(get_db),
               current_user=Depends(get_current_user)):
    vibe = update_vibe(db, current_user, vibe_id, data.get("caption"))

    await manager.broadcast({
        "type": "vibe_updated",
        "vibe": {
            "id": vibe.id,
            "caption": vibe.caption,
            "video_url": vibe.video_url,
            "user_id": vibe.user_id,
            "created_at": vibe.created_at.isoformat() if vibe.created_at else None,
        },
    })

    return vibe


@router.delete("/{vibe_id}")
async def delete(vibe_id: int,
                 db: Session = Depends(get_db),
                 current_user=Depends(get_current_user)):
    result = delete_vibe(db, current_user, vibe_id)

    await manager.broadcast({
        "type": "vibe_deleted",
        "vibe_id": vibe_id,
        "user_id": current_user.id,
    })

    return result
