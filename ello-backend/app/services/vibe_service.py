from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from fastapi import HTTPException
from app.models.vibe import Vibe
from app.models.like import Like
from app.models.comment import Comment


def create_vibe(db: Session, current_user, data):

    vibe = Vibe(
        video_url=data.video_url,
        caption=data.caption,
        latitude=data.latitude,
        longitude=data.longitude,
        location_label=data.location_label,
        user_id=current_user.id
    )

    db.add(vibe)
    db.commit()
    db.refresh(vibe)

    return vibe


def get_vibes(db: Session, current_user, page, limit):

    offset = (page - 1) * limit

    vibes = (
        db.query(Vibe)
        .options(joinedload(Vibe.author))
        .order_by(Vibe.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    result = []

    for vibe in vibes:
        likes_count = db.query(func.count(Like.id)).filter(
            Like.content_type == 'vibe',
            Like.content_id == vibe.id
        ).scalar() or 0

        comments_count = db.query(func.count(Comment.id)).filter(
            Comment.content_type == 'vibe',
            Comment.content_id == vibe.id
        ).scalar() or 0

        is_liked = False
        if current_user is not None:
            is_liked = db.query(Like.id).filter(
                Like.content_type == 'vibe',
                Like.content_id == vibe.id,
                Like.user_id == current_user.id
            ).first() is not None

        result.append({
            'id': vibe.id,
            'user_id': vibe.user_id,
            'video_url': vibe.video_url,
            # Keep aliases compatible with existing frontend normalization.
            'media_url': vibe.video_url,
            'caption': vibe.caption,
            'content': vibe.caption,
            'latitude': vibe.latitude,
            'longitude': vibe.longitude,
            'location_label': vibe.location_label,
            'created_at': vibe.created_at,
            'likes_count': likes_count,
            'comments_count': comments_count,
            'is_liked': is_liked,
            'author': {
                'id': vibe.author.id,
                'full_name': vibe.author.full_name,
                'username': vibe.author.username,
                'avatar_url': vibe.author.avatar_url,
                'mood': vibe.author.mood,
            } if vibe.author else None,
        })

    return result


def update_vibe(db: Session, current_user, vibe_id: int, caption: str | None):
    vibe = db.query(Vibe).filter(Vibe.id == vibe_id).first()

    if not vibe:
        raise HTTPException(status_code=404, detail="Vibe not found")

    if vibe.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    vibe.caption = (caption or "").strip() or None
    db.commit()
    db.refresh(vibe)
    return vibe


def delete_vibe(db: Session, current_user, vibe_id: int):
    vibe = db.query(Vibe).filter(Vibe.id == vibe_id).first()

    if not vibe:
        raise HTTPException(status_code=404, detail="Vibe not found")

    if vibe.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    db.delete(vibe)
    db.commit()
    return {"message": "Vibe deleted"}
