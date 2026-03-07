# ==========================================================
# FILE: app/services/user_service.py
# MODULE: USER BUSINESS LOGIC
# ==========================================================

from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from datetime import datetime, timezone, timedelta
from app.models.user import User
from app.models.follow import Follow
from app.models.moment import Moment
from app.core.presence import get_user_last_seen


# ==========================================================
# GET USER BY ID
# ==========================================================

def get_user_by_id(db: Session, user_id: int):
    return db.query(User).filter(User.id == user_id).first()


# ==========================================================
# GET USER BY USERNAME
# ==========================================================

def get_user_by_username(db: Session, username: str):
    return db.query(User).filter(User.username == username).first()


# ==========================================================
# UPDATE USER PROFILE
# ==========================================================

def update_user_profile(db: Session, user: User, update_data: dict):

    allowed_fields = ["full_name", "bio", "avatar_url", "location", "link", "category"]

    for key, value in update_data.items():
        if key in allowed_fields:
            setattr(user, key, value)

    db.commit()
    db.refresh(user)

    return user


# ==========================================================
# FOLLOW STATS
# ==========================================================

def get_follow_stats(db: Session, user_id: int):

    followers_count = db.query(Follow)\
        .filter(Follow.following_id == user_id)\
        .count()

    following_count = db.query(Follow)\
        .filter(Follow.follower_id == user_id)\
        .count()

    return followers_count, following_count


# ==========================================================
# MOMENTS COUNT
# ==========================================================

def get_moments_count(db: Session, user_id: int):
    return db.query(Moment)\
        .filter(Moment.user_id == user_id)\
        .count()


# ==========================================================
# CHECK IF FOLLOWING
# ==========================================================

def is_following(db: Session, current_user_id: int, target_user_id: int):

    if current_user_id == target_user_id:
        return False

    follow = db.query(Follow).filter(
        Follow.follower_id == current_user_id,
        Follow.following_id == target_user_id
    ).first()

    return follow is not None


# ==========================================================
# FULL PROFILE DATA
# ==========================================================

def get_full_profile(db: Session, user_id: int, current_user_id: int = None):

    user = get_user_by_id(db, user_id)

    if not user:
        return None

    followers_count, following_count = get_follow_stats(db, user_id)
    moments_count = get_moments_count(db, user_id)

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=20)
    is_online_now = bool(
        user.is_online and
        user.last_activity_at and
        user.last_activity_at >= cutoff
    )

    last_seen_value = user.last_seen_at
    redis_last_seen = get_user_last_seen(user.id)
    if redis_last_seen:
        try:
            last_seen_value = datetime.fromisoformat(redis_last_seen.replace("Z", "+00:00"))
        except ValueError:
            pass

    return {
        "id": user.id,
        "full_name": user.full_name,
        "username": user.username,
        "email": user.email,
        "avatar_url": user.avatar_url,
        "bio": user.bio,
        "location": user.location,
        "link": user.link,
        "category": user.category,
        "is_online": is_online_now,
        "is_visible_nearby": user.is_visible_nearby,
        "last_seen_at": None if is_online_now else last_seen_value,
        "last_activity_at": user.last_activity_at,
        "created_at": user.created_at,
        "followers_count": followers_count,
        "following_count": following_count,
        "moments_count": moments_count,
        "is_following": (
            is_following(db, current_user_id, user_id)
            if current_user_id else False
        ),
        "is_me": current_user_id == user_id if current_user_id else False
    }


# ==========================================================
# LIST FOLLOWERS
# ==========================================================

def list_followers(db: Session, user_id: int):
    return db.query(User)\
        .join(Follow, Follow.follower_id == User.id)\
        .filter(Follow.following_id == user_id)\
        .all()


# ==========================================================
# LIST FOLLOWING
# ==========================================================

def list_following(db: Session, user_id: int):
    return db.query(User)\
        .join(Follow, Follow.following_id == User.id)\
        .filter(Follow.follower_id == user_id)\
        .all()


# ==========================================================
# USER SUGGESTIONS
# ==========================================================

def get_user_suggestions(db: Session, current_user_id: int, limit: int = 10):

    following_subquery = db.query(Follow.following_id)\
        .filter(Follow.follower_id == current_user_id)

    suggestions = db.query(User)\
        .filter(User.id != current_user_id)\
        .filter(User.id.notin_(following_subquery))\
        .order_by(func.random())\
        .limit(limit)\
        .all()

    return suggestions


def search_users(db: Session, current_user_id: int, query: str, limit: int = 30):
    """Search users globally by username or full name, independent of nearby visibility."""

    normalized = (query or '').strip()
    if not normalized:
        return []

    like_term = f"%{normalized}%"

    results = db.query(User).filter(
        User.id != current_user_id,
        or_(
            User.username.ilike(like_term),
            User.full_name.ilike(like_term),
        )
    ).order_by(User.username.asc()).limit(limit).all()

    return [
        get_full_profile(db, user_id=user.id, current_user_id=current_user_id)
        for user in results
    ]