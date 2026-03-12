from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session, joinedload
from app.models.notification import Notification
from app.models.follow import Follow
from app.models.user_block import UserBlock
from app.services.push_service import send_push_for_notification


DEFAULT_NOTIFICATION_MESSAGES = {
    "like": "curtiu sua publicacao",
    "comment": "comentou na sua publicacao",
    "follow": "comecou a seguir voce",
    "message": "enviou uma mensagem",
    "new_post": "publicou algo novo",
    "following_online": "acabou de ficar online",
}


def _serialize_notification(notification: Notification):
    actor = getattr(notification, "actor", None)
    return {
        "id": notification.id,
        "user_id": notification.user_id,
        "actor_id": notification.actor_id,
        "type": notification.type,
        "reference_id": notification.reference_id,
        "message": notification.message,
        "content": notification.message or DEFAULT_NOTIFICATION_MESSAGES.get(notification.type, "Nova notificacao"),
        "is_read": bool(notification.is_read),
        "created_at": notification.created_at,
        "actor": {
            "id": actor.id,
            "username": actor.username,
            "full_name": actor.full_name,
            "avatar_url": actor.avatar_url,
        } if actor is not None else None,
    }


def get_notifications(db: Session, current_user, page: int = 1, limit: int = 50):
    safe_page = max(1, int(page))
    safe_limit = max(1, min(100, int(limit)))
    offset = (safe_page - 1) * safe_limit

    rows = (
        db.query(Notification)
        .options(joinedload(Notification.actor))
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(safe_limit)
        .all()
    )

    return [_serialize_notification(row) for row in rows]


def create_notification(
    db: Session,
    *,
    user_id: int,
    actor_id: int,
    notif_type: str,
    reference_id: int | None = None,
    message: str | None = None,
    dedupe_minutes: int = 0,
):
    if not user_id or user_id == actor_id:
        return None

    if dedupe_minutes > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=dedupe_minutes)
        duplicate = db.query(Notification).filter(
            Notification.user_id == user_id,
            Notification.actor_id == actor_id,
            Notification.type == notif_type,
            Notification.reference_id == reference_id,
            Notification.created_at >= cutoff,
        ).first()
        if duplicate:
            return duplicate

    payload = Notification(
        user_id=user_id,
        actor_id=actor_id,
        type=notif_type,
        reference_id=reference_id,
        message=(message or DEFAULT_NOTIFICATION_MESSAGES.get(notif_type, "Nova notificacao")),
    )
    db.add(payload)
    db.commit()
    db.refresh(payload)
    try:
        send_push_for_notification(
            db,
            user_id=payload.user_id,
            actor_id=payload.actor_id,
            notif_type=payload.type,
            message=payload.message,
            reference_id=payload.reference_id,
        )
    except Exception:
        pass
    return payload


def create_notifications_for_followers(
    db: Session,
    *,
    actor_id: int,
    notif_type: str,
    reference_id: int | None = None,
    message: str | None = None,
    dedupe_minutes: int = 0,
):
    follower_ids = [
        row.follower_id
        for row in db.query(Follow).filter(Follow.following_id == actor_id).all()
    ]
    if not follower_ids:
        return []

    blocked_by_actor = {
        row.blocked_id
        for row in db.query(UserBlock).filter(UserBlock.blocker_id == actor_id).all()
    }
    blocked_actor = {
        row.blocker_id
        for row in db.query(UserBlock).filter(UserBlock.blocked_id == actor_id).all()
    }
    hidden_ids = blocked_by_actor.union(blocked_actor)

    recipients = [
        follower_id
        for follower_id in follower_ids
        if follower_id not in hidden_ids and follower_id != actor_id
    ]
    if not recipients:
        return []

    deduped_recipient_ids = set()
    if dedupe_minutes > 0:
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=dedupe_minutes)
        existing = db.query(Notification.user_id).filter(
            Notification.user_id.in_(recipients),
            Notification.actor_id == actor_id,
            Notification.type == notif_type,
            Notification.reference_id == reference_id,
            Notification.created_at >= cutoff,
        ).all()
        deduped_recipient_ids = {row.user_id for row in existing}

    to_create = [
        Notification(
            user_id=recipient_id,
            actor_id=actor_id,
            type=notif_type,
            reference_id=reference_id,
            message=(message or DEFAULT_NOTIFICATION_MESSAGES.get(notif_type, "Nova notificacao")),
        )
        for recipient_id in recipients
        if recipient_id not in deduped_recipient_ids
    ]

    if not to_create:
        return []

    db.add_all(to_create)
    db.commit()

    for row in to_create:
        try:
            send_push_for_notification(
                db,
                user_id=row.user_id,
                actor_id=row.actor_id,
                notif_type=row.type,
                message=row.message,
                reference_id=row.reference_id,
            )
        except Exception:
            pass

    return to_create


def mark_notification_as_read(db: Session, current_user_id: int, notification_id: int):
    row = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user_id,
    ).first()
    if not row:
        return None

    row.is_read = True
    db.commit()
    db.refresh(row)
    return _serialize_notification(row)


def mark_all_notifications_as_read(db: Session, current_user_id: int):
    rows = db.query(Notification).filter(
        Notification.user_id == current_user_id,
        Notification.is_read == False,
    ).all()

    for row in rows:
        row.is_read = True

    db.commit()
    return {"updated": len(rows)}


def clear_all_notifications(db: Session, current_user_id: int):
    deleted = (
        db.query(Notification)
        .filter(Notification.user_id == current_user_id)
        .delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": int(deleted or 0)}
