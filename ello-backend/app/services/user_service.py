# ==========================================================
# FILE: app/services/user_service.py
# MODULE: USER BUSINESS LOGIC
# ==========================================================

from sqlalchemy.orm import Session
from sqlalchemy import func, or_
from fastapi import HTTPException
import secrets
from datetime import datetime, timezone, timedelta
from app.models.user import User
from app.models.follow import Follow
from app.models.moment import Moment
from app.models.story import Story
from app.models.vibe import Vibe
from app.models.comment import Comment
from app.models.like import Like
from app.models.music import Music
from app.models.music_favorite import MusicFavorite
from app.models.notification import Notification
from app.models.push_device import PushDevice
from app.models.group_member import GroupMember
from app.models.nearby_favorite import NearbyFavorite
from app.models.message_reaction import MessageReaction
from app.models.user_block import UserBlock
from app.core.security import verify_password, hash_password
from app.core.presence import get_user_last_seen


VALID_MOODS = {
    "feliz",
    "focado",
    "relaxando",
    "animado",
    "calmo",
    "pensativo",
    "cansado",
    "triste",
}

LEGACY_MOOD_ALIASES = {
    "criativo": "pensativo",
    "grato": "calmo",
}


# ==========================================================
# GET USER BY ID
# ==========================================================

def get_user_by_id(db: Session, user_id: int):
    return db.query(User).filter(User.id == user_id, User.is_deleted.is_(False)).first()


# ==========================================================
# GET USER BY USERNAME
# ==========================================================

def get_user_by_username(db: Session, username: str):
    return db.query(User).filter(User.username == username, User.is_deleted.is_(False)).first()


# ==========================================================
# UPDATE USER PROFILE
# ==========================================================

def update_user_profile(db: Session, user: User, update_data: dict):

    allowed_fields = ["full_name", "bio", "avatar_url", "location", "link", "category", "mood"]

    for key, value in update_data.items():
        if key in allowed_fields:
            if key == "mood":
                if value is None:
                    setattr(user, key, None)
                    continue

                normalized_mood = str(value).strip().lower()
                if not normalized_mood:
                    setattr(user, key, None)
                    continue

                normalized_mood = LEGACY_MOOD_ALIASES.get(normalized_mood, normalized_mood)

                if normalized_mood not in VALID_MOODS:
                    raise HTTPException(status_code=400, detail="Mood invalido")

                setattr(user, key, normalized_mood)
                continue
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
        "mood": user.mood,
        "link": user.link,
        "category": user.category,
        "is_online": is_online_now,
        "is_visible_nearby": user.is_visible_nearby,
        "is_panel_admin": bool(user.is_panel_admin),
        "is_panel_active": bool(user.is_panel_active),
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
        .filter(Follow.following_id == user_id, User.is_deleted.is_(False))\
        .all()


# ==========================================================
# LIST FOLLOWING
# ==========================================================

def list_following(db: Session, user_id: int):
    return db.query(User)\
        .join(Follow, Follow.following_id == User.id)\
        .filter(Follow.follower_id == user_id, User.is_deleted.is_(False))\
        .all()


# ==========================================================
# USER SUGGESTIONS
# ==========================================================

def get_user_suggestions(db: Session, current_user_id: int, limit: int = 10):

    following_subquery = db.query(Follow.following_id)\
        .filter(Follow.follower_id == current_user_id)

    suggestions = db.query(User)\
        .filter(User.id != current_user_id, User.is_deleted.is_(False))\
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
        User.is_deleted.is_(False),
        or_(
            User.username.ilike(like_term),
            User.full_name.ilike(like_term),
        )
    ).order_by(User.username.asc()).limit(limit).all()

    return [
        get_full_profile(db, user_id=user.id, current_user_id=current_user_id)
        for user in results
    ]


def delete_user_account(db: Session, user: User, password: str):
    if bool(getattr(user, "is_deleted", False)):
        return {"success": True, "message": "Conta ja excluida"}

    if not verify_password(password, user.password_hash):
        raise HTTPException(status_code=400, detail="Senha incorreta")

    user_id = user.id
    now = datetime.now(timezone.utc)
    entropy = secrets.token_hex(4)
    suffix = f"{user_id}_{int(now.timestamp())}_{entropy}"

    # Remove primary content and relation rows created by this user.
    db.query(Moment).filter(Moment.user_id == user_id).delete(synchronize_session=False)
    db.query(Story).filter(Story.user_id == user_id).delete(synchronize_session=False)
    db.query(Vibe).filter(Vibe.user_id == user_id).delete(synchronize_session=False)
    db.query(Comment).filter(Comment.user_id == user_id).delete(synchronize_session=False)
    db.query(Like).filter(Like.user_id == user_id).delete(synchronize_session=False)
    db.query(MusicFavorite).filter(MusicFavorite.user_id == user_id).delete(synchronize_session=False)
    db.query(Music).filter(Music.uploaded_by == user_id).delete(synchronize_session=False)
    db.query(Follow).filter(
        or_(Follow.follower_id == user_id, Follow.following_id == user_id)
    ).delete(synchronize_session=False)
    db.query(Notification).filter(
        or_(Notification.user_id == user_id, Notification.actor_id == user_id)
    ).delete(synchronize_session=False)
    db.query(PushDevice).filter(PushDevice.user_id == user_id).delete(synchronize_session=False)
    db.query(GroupMember).filter(GroupMember.user_id == user_id).delete(synchronize_session=False)
    db.query(NearbyFavorite).filter(
        or_(NearbyFavorite.user_id == user_id, NearbyFavorite.favorite_user_id == user_id)
    ).delete(synchronize_session=False)
    db.query(MessageReaction).filter(MessageReaction.user_id == user_id).delete(synchronize_session=False)
    db.query(UserBlock).filter(
        or_(UserBlock.blocker_id == user_id, UserBlock.blocked_id == user_id)
    ).delete(synchronize_session=False)

    # Keep the user row for FK integrity and anonymize personal identifiers.
    user.full_name = "Conta Excluida"
    user.username = f"deleted_{suffix}"
    user.email = f"deleted_{suffix}@deleted.ellosocial.local"
    user.password_hash = hash_password(secrets.token_urlsafe(32))
    user.avatar_url = None
    user.bio = None
    user.location = None
    user.mood = None
    user.link = None
    user.category = None
    user.latitude = None
    user.longitude = None
    user.is_online = False
    user.is_visible_nearby = False
    user.is_panel_admin = False
    user.is_panel_active = False
    user.is_deleted = True
    user.deleted_at = now
    user.last_seen_at = now
    user.last_activity_at = None

    db.commit()

    return {"success": True, "message": "Conta excluida com sucesso"}
