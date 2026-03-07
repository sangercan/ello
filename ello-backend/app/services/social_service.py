# ==========================================================
# FILE: app/services/social_service.py
# MODULE: SOCIAL SERVICE
# RESPONSIBILITY:
# - Like
# - Comment
# - Follow
# - Share
# - Real-time notifications
# ==========================================================

from sqlalchemy.orm import Session
from sqlalchemy import func
from fastapi import HTTPException

from app.models.like import Like
from app.models.comment import Comment
from app.models.follow import Follow
from app.models.moment import Moment
from app.models.vibe import Vibe
from app.models.story import Story
from app.models.user import User
from app.services.notification_service import create_notification


def _resolve_content_owner_id(db: Session, content_type: str, content_id: int):
    normalized = (content_type or "").lower()

    if normalized == "moment":
        item = db.query(Moment).filter(Moment.id == content_id).first()
        return item.user_id if item else None

    if normalized == "vibe":
        item = db.query(Vibe).filter(Vibe.id == content_id).first()
        return item.user_id if item else None

    if normalized == "story":
        item = db.query(Story).filter(Story.id == content_id).first()
        return item.user_id if item else None

    if normalized == "comment":
        item = db.query(Comment).filter(Comment.id == content_id).first()
        return item.user_id if item else None

    return None


def _try_create_notification(
    db: Session,
    *,
    target_user_id: int | None,
    actor_id: int,
    notif_type: str,
    reference_id: int,
):
    # Do not notify self and avoid crashing main action on notification issues.
    if not target_user_id or target_user_id == actor_id:
        return

    try:
        create_notification(
            db,
            user_id=target_user_id,
            actor_id=actor_id,
            notif_type=notif_type,
            reference_id=reference_id,
        )
    except Exception:
        db.rollback()


# ==========================================================
# TOGGLE LIKE
# ==========================================================

def toggle_like(db: Session, current_user, content_type, content_id):

    existing = db.query(Like).filter(
        Like.user_id == current_user.id,
        Like.content_type == content_type,
        Like.content_id == content_id
    ).first()

    # UNLIKE
    if existing:
        db.delete(existing)
        db.commit()
        return {"liked": False}

    # LIKE
    like = Like(
        user_id=current_user.id,
        content_type=content_type,
        content_id=content_id
    )

    db.add(like)
    db.commit()

    owner_id = _resolve_content_owner_id(db, content_type, content_id)
    _try_create_notification(
        db,
        target_user_id=owner_id,
        actor_id=current_user.id,
        notif_type="like",
        reference_id=content_id,
    )

    return {"liked": True}


# ==========================================================
# ADD COMMENT
# ==========================================================

def add_comment(db: Session, current_user, content_type, content_id, text, parent_comment_id=None):

    if parent_comment_id is not None:
        parent = db.query(Comment).filter(Comment.id == parent_comment_id).first()
        if parent is None:
            raise HTTPException(status_code=404, detail="Parent comment not found")
        if parent.content_type != content_type or parent.content_id != content_id:
            raise HTTPException(status_code=400, detail="Parent comment mismatch")

    comment = Comment(
        user_id=current_user.id,
        content_type=content_type,
        content_id=content_id,
        parent_comment_id=parent_comment_id,
        text=text
    )

    db.add(comment)
    db.commit()
    db.refresh(comment)

    owner_id = _resolve_content_owner_id(db, content_type, content_id)
    _try_create_notification(
        db,
        target_user_id=owner_id,
        actor_id=current_user.id,
        notif_type="comment",
        reference_id=content_id,
    )

    return {
        "message": "Comment added",
        "comment": {
            "id": comment.id,
            "content_type": comment.content_type,
            "content_id": comment.content_id,
            "parent_comment_id": comment.parent_comment_id,
            "text": comment.text,
            "created_at": comment.created_at,
            "author": {
                "id": current_user.id,
                "username": current_user.username,
                "full_name": current_user.full_name,
                "avatar_url": current_user.avatar_url,
            },
        }
    }


def get_comments(db: Session, content_type: str, content_id: int, current_user=None):
    comments = (
        db.query(Comment, User)
        .join(User, User.id == Comment.user_id)
        .filter(
            Comment.content_type == content_type,
            Comment.content_id == content_id,
        )
        .order_by(Comment.created_at.asc())
        .all()
    )

    comment_ids = [comment.id for comment, _ in comments]
    likes_count_map = {}
    liked_comment_ids = set()

    if comment_ids:
        rows = db.query(Like.content_id, func.count(Like.id)).filter(
            Like.content_type == 'comment',
            Like.content_id.in_(comment_ids)
        ).group_by(Like.content_id).all()
        likes_count_map = {cid: count for cid, count in rows}

        if current_user is not None:
            liked_rows = db.query(Like.content_id).filter(
                Like.content_type == 'comment',
                Like.user_id == current_user.id,
                Like.content_id.in_(comment_ids)
            ).all()
            liked_comment_ids = {cid for (cid,) in liked_rows}

    return [
        {
            "id": comment.id,
            "content_type": comment.content_type,
            "content_id": comment.content_id,
            "parent_comment_id": comment.parent_comment_id,
            "text": comment.text,
            "created_at": comment.created_at,
            "likes_count": likes_count_map.get(comment.id, 0),
            "is_liked": comment.id in liked_comment_ids,
            "author": {
                "id": author.id,
                "full_name": author.full_name,
                "username": author.username,
                "avatar_url": author.avatar_url,
            },
        }
        for comment, author in comments
    ]


def update_comment(db: Session, current_user, comment_id: int, text: str):
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    if comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    sanitized = (text or '').strip()
    if not sanitized:
        raise HTTPException(status_code=400, detail="Comment text cannot be empty")

    comment.text = sanitized
    db.commit()
    db.refresh(comment)

    return {
        "id": comment.id,
        "content_type": comment.content_type,
        "content_id": comment.content_id,
        "parent_comment_id": comment.parent_comment_id,
        "text": comment.text,
        "created_at": comment.created_at,
    }


def delete_comment(db: Session, current_user, comment_id: int):
    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    if comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Snapshot required fields before deleting rows to avoid accessing a deleted ORM instance.
    comment_snapshot = {
        "id": comment.id,
        "content_type": comment.content_type,
        "content_id": comment.content_id,
        "parent_comment_id": comment.parent_comment_id,
    }

    ids_to_delete = [comment.id]
    cursor = 0
    while cursor < len(ids_to_delete):
        current_id = ids_to_delete[cursor]
        child_ids = [row.id for row in db.query(Comment.id).filter(Comment.parent_comment_id == current_id).all()]
        ids_to_delete.extend(child_ids)
        cursor += 1

    db.query(Comment).filter(Comment.id.in_(ids_to_delete)).delete(synchronize_session=False)
    db.commit()

    return {
        "message": "Comment deleted",
        "id": comment_snapshot["id"],
        "content_type": comment_snapshot["content_type"],
        "content_id": comment_snapshot["content_id"],
        "parent_comment_id": comment_snapshot["parent_comment_id"],
        "deleted_ids": ids_to_delete,
    }


# ==========================================================
# TOGGLE FOLLOW
# ==========================================================

def toggle_follow(db: Session, current_user, user_id):

    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot follow yourself")

    existing = db.query(Follow).filter(
        Follow.follower_id == current_user.id,
        Follow.following_id == user_id
    ).first()

    # UNFOLLOW
    if existing:
        db.delete(existing)
        db.commit()
        return {"following": False}

    follow = Follow(
        follower_id=current_user.id,
        following_id=user_id
    )

    db.add(follow)
    db.commit()

    _try_create_notification(
        db,
        target_user_id=user_id,
        actor_id=current_user.id,
        notif_type="follow",
        reference_id=current_user.id,
    )

    return {"following": True}


# ==========================================================
# SHARE CONTENT
# ==========================================================

def share_content(db: Session, current_user, content_type, content_id):

    # Futuro: repost, analytics, ranking boost

    return {
        "message": f"{content_type} shared",
        "content_id": content_id
    }