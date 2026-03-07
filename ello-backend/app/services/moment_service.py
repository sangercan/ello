# ==========================================================
# FILE: app/services/moment_service.py
# MODULE: MOMENTS ENGINE (ELLO INTELLIGENCE 1.0)
# RESPONSIBILITY:
# - Create Moment
# - Delete Moment
# - Personalized Moments Timeline
# ==========================================================

from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from fastapi import HTTPException

from app.models.moment import Moment
from app.models.like import Like
from app.models.comment import Comment


# ==========================================================
# CREATE MOMENT
# ==========================================================

def create_moment(db: Session, current_user, data):

    moment = Moment(
        content=data.content,
        media_url=data.media_url,
        latitude=data.latitude,
        longitude=data.longitude,
        location_label=data.location_label,
        user_id=current_user.id
    )

    db.add(moment)
    db.commit()
    db.refresh(moment)

    return moment


# ==========================================================
# DELETE MOMENT
# ==========================================================

def delete_moment(db: Session, current_user, moment_id: int):

    moment = db.query(Moment).filter(
        Moment.id == moment_id
    ).first()

    if not moment:
        raise HTTPException(status_code=404, detail="Moment not found")

    if moment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.delete(moment)
    db.commit()

    return {"message": "Moment deleted"}


def update_moment(db: Session, current_user, moment_id: int, content: str | None):
    moment = db.query(Moment).filter(Moment.id == moment_id).first()

    if not moment:
        raise HTTPException(status_code=404, detail="Moment not found")

    if moment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    sanitized = (content or "").strip()
    if not sanitized and not moment.media_url:
        raise HTTPException(status_code=400, detail="Moment content cannot be empty")

    moment.content = sanitized or None
    db.commit()
    db.refresh(moment)

    return moment


# ==========================================================
# MOMENTS INTELLIGENCE TIMELINE
# ==========================================================

def get_moments_intelligence(
    db: Session,
    current_user,
    page: int = 1,
    limit: int = 20
):

    offset = (page - 1) * limit

    moments = (
        db.query(Moment)
        .options(joinedload(Moment.author))
        .order_by(Moment.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    result = []

    for moment in moments:
        likes_count = db.query(func.count(Like.id)).filter(
            Like.content_type == "moment",
            Like.content_id == moment.id
        ).scalar()

        comments_count = db.query(func.count(Comment.id)).filter(
            Comment.content_type == "moment",
            Comment.content_id == moment.id
        ).scalar()

        # Build moment response with author data
        moment_data = {
            "id": moment.id,
            "content": moment.content,
            "media_url": moment.media_url,
            "latitude": moment.latitude,
            "longitude": moment.longitude,
            "location_label": moment.location_label,
            "created_at": moment.created_at,
            "likes_count": likes_count,
            "comments_count": comments_count,
            "user_id": moment.user_id,
            "author": {
                "id": moment.author.id,
                "full_name": moment.author.full_name,
                "username": moment.author.username,
                "avatar_url": moment.author.avatar_url,
            } if moment.author else None
        }

        result.append(moment_data)

    return result
