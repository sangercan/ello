# ==========================================================
# STORIES ROUTES (Enhanced)
# ==========================================================

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.dependencies import get_current_user, get_optional_current_user
from app.schemas.story import StoryCreate
from fastapi import Body
from app.services.story_service import create_story, get_stories, delete_story, update_story_text
from app.core.websocket_manager import manager
from app.services.notification_service import create_notifications_for_followers

router = APIRouter(prefix="/stories", tags=["Stories"])


# ==========================================================
# CREATE STORY
# POST /stories/
# ==========================================================

@router.post("/")
async def create(data: StoryCreate,
                 db: Session = Depends(get_db),
                 current_user=Depends(get_current_user)):
    """Create a new story (expires in 24h)"""
    story = create_story(db, current_user, data.media_url, data.text)
    await manager.broadcast({
        "type": "story_created",
        "story": {
            "id": story.id,
            "user_id": story.user_id,
            "media_url": story.media_url,
            "text": story.text,
            "created_at": story.created_at.isoformat() if story.created_at else None,
            "expires_at": story.expires_at.isoformat() if story.expires_at else None,
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
        reference_id=story.id,
        message="publicou um novo story",
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

    return story


@router.post("")
async def create_no_slash(data: StoryCreate,
                          db: Session = Depends(get_db),
                          current_user=Depends(get_current_user)):
    """Alias route to accept POST /stories without trailing slash."""
    return await create(data=data, db=db, current_user=current_user)


# ==========================================================
# GET ACTIVE STORIES
# GET /stories/
# ==========================================================

@router.get("/")
def list(db: Session = Depends(get_db),
         current_user=Depends(get_optional_current_user)):
    """Get all active stories (24h expiration) - PUBLIC"""
    return get_stories(db, current_user)


@router.get("")
def list_no_slash(db: Session = Depends(get_db),
                  current_user=Depends(get_optional_current_user)):
    """Alias route to accept GET /stories without trailing slash."""
    return list(db=db, current_user=current_user)


# ==========================================================
# DELETE STORY (by owner)
# DELETE /stories/{story_id}
# ==========================================================

@router.delete("/{story_id}")
async def delete(story_id: int,
                 db: Session = Depends(get_db),
                 current_user=Depends(get_current_user)):
    """Delete a story (only by owner)"""
    result = delete_story(db, current_user, story_id)
    await manager.broadcast({
        "type": "story_deleted",
        "story_id": story_id,
        "user_id": current_user.id,
    })
    return result


@router.patch("/{story_id}")
async def edit(story_id: int,
               data: dict = Body(...),
               db: Session = Depends(get_db),
               current_user=Depends(get_current_user)):
    story = update_story_text(db, current_user, story_id, data.get("text"))
    await manager.broadcast({
        "type": "story_updated",
        "story": {
            "id": story.id,
            "user_id": story.user_id,
            "text": story.text,
            "media_url": story.media_url,
            "created_at": story.created_at.isoformat() if story.created_at else None,
            "expires_at": story.expires_at.isoformat() if story.expires_at else None,
        },
    })
    return story
