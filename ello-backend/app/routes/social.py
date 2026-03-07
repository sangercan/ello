# ==========================================================
# SOCIAL ROUTES
# ==========================================================

from fastapi import APIRouter, Depends, Body
from fastapi.encoders import jsonable_encoder
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.dependencies import get_current_user
from app.schemas.comment import CommentCreate
from app.core.websocket_manager import manager
from app.models.comment import Comment
from app.services.social_service import (
    toggle_like,
    add_comment,
    get_comments,
    update_comment,
    delete_comment,
    toggle_follow,
    share_content,
    _resolve_content_owner_id,
)

router = APIRouter(prefix="/social", tags=["Social"])


@router.post("/like/{content_type}/{content_id}")
async def like(content_type: str,
               content_id: int,
               db: Session = Depends(get_db),
               current_user=Depends(get_current_user)):
    result = toggle_like(db, current_user, content_type, content_id)

    payload = {
        "type": "content_like_updated",
        "content_type": content_type,
        "content_id": content_id,
        "liked": bool(result.get("liked")),
        "actor_id": current_user.id,
    }

    if content_type == "comment":
        comment = db.query(Comment).filter(Comment.id == content_id).first()
        if comment is not None:
            payload["parent_content_type"] = comment.content_type
            payload["parent_content_id"] = comment.content_id
            payload["parent_comment_id"] = comment.parent_comment_id

    await manager.broadcast(payload)

    if bool(result.get("liked")):
        owner_id = _resolve_content_owner_id(db, content_type, content_id)
        if owner_id and owner_id != current_user.id:
            await manager.send_to_user(owner_id, {
                "type": "notification_refresh",
                "reason": "like",
                "actor_id": current_user.id,
            })

    return result


@router.post("/comment/{content_type}/{content_id}")
async def comment(content_type: str,
                  content_id: int,
                  data: CommentCreate,
                  db: Session = Depends(get_db),
                  current_user=Depends(get_current_user)):
    result = add_comment(db, current_user, content_type, content_id, data.text, data.parent_comment_id)
    safe_comment = jsonable_encoder(result.get("comment"))

    await manager.broadcast({
        "type": "comment_created",
        "content_type": content_type,
        "content_id": content_id,
        "parent_comment_id": data.parent_comment_id,
        "actor_id": current_user.id,
        "comment": safe_comment,
    })

    owner_id = _resolve_content_owner_id(db, content_type, content_id)
    if owner_id and owner_id != current_user.id:
        await manager.send_to_user(owner_id, {
            "type": "notification_refresh",
            "reason": "comment",
            "actor_id": current_user.id,
        })

    return result


@router.get("/comments/{content_type}/{content_id}")
def list_comments(content_type: str,
                  content_id: int,
                  db: Session = Depends(get_db),
                  current_user=Depends(get_current_user)):
    return get_comments(db, content_type, content_id, current_user)


@router.patch("/comment/{comment_id}")
async def edit_comment(comment_id: int,
                       data: dict = Body(...),
                       db: Session = Depends(get_db),
                       current_user=Depends(get_current_user)):
    result = update_comment(db, current_user, comment_id, data.get('text') or '')
    safe_result = jsonable_encoder(result)

    await manager.broadcast({
        "type": "comment_updated",
        "comment": safe_result,
    })

    return result


@router.delete("/comment/{comment_id}")
async def remove_comment(comment_id: int,
                         db: Session = Depends(get_db),
                         current_user=Depends(get_current_user)):
    result = delete_comment(db, current_user, comment_id)

    await manager.broadcast({
        "type": "comment_deleted",
        "comment": {
            "id": result.get('id'),
            "content_type": result.get('content_type'),
            "content_id": result.get('content_id'),
            "parent_comment_id": result.get('parent_comment_id'),
            "deleted_ids": result.get('deleted_ids', []),
        },
    })

    return result


@router.post("/follow/{user_id}")
async def follow(user_id: int,
                 db: Session = Depends(get_db),
                 current_user=Depends(get_current_user)):
    result = toggle_follow(db, current_user, user_id)
    if bool(result.get("following")) and user_id != current_user.id:
        await manager.send_to_user(user_id, {
            "type": "notification_refresh",
            "reason": "follow",
            "actor_id": current_user.id,
        })
    return result


@router.delete("/follow/{user_id}")
def unfollow(user_id: int,
             db: Session = Depends(get_db),
             current_user=Depends(get_current_user)):
    """Unfollow a user (DELETE method)"""
    return toggle_follow(db, current_user, user_id)


@router.post("/{user_id}/follow")
async def follow_alt(user_id: int,
                     db: Session = Depends(get_db),
                     current_user=Depends(get_current_user)):
    """Follow a user (alternative route)"""
    result = toggle_follow(db, current_user, user_id)
    if bool(result.get("following")) and user_id != current_user.id:
        await manager.send_to_user(user_id, {
            "type": "notification_refresh",
            "reason": "follow",
            "actor_id": current_user.id,
        })
    return result


@router.delete("/{user_id}/follow")
def unfollow_alt(user_id: int,
                 db: Session = Depends(get_db),
                 current_user=Depends(get_current_user)):
    """Unfollow a user (alternative route)"""
    return toggle_follow(db, current_user, user_id)


@router.post("/share/{content_type}/{content_id}")
def share(content_type: str,
          content_id: int,
          db: Session = Depends(get_db),
          current_user=Depends(get_current_user)):
    return share_content(db, current_user, content_type, content_id)