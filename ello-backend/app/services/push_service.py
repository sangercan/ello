import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import (
    FIREBASE_CREDENTIALS_FILE,
    FIREBASE_CREDENTIALS_JSON,
    PUSH_NOTIFICATIONS_ENABLED,
)
from app.core.websocket_manager import manager
from app.models.push_device import PushDevice
from app.models.user import User

logger = logging.getLogger(__name__)

_firebase_ready = False
_firebase_init_attempted = False


def _load_firebase():
    global _firebase_ready, _firebase_init_attempted

    if _firebase_ready:
        return True
    if _firebase_init_attempted:
        return False

    _firebase_init_attempted = True

    if not PUSH_NOTIFICATIONS_ENABLED:
        logger.info("Push notifications disabled by environment")
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials

        if firebase_admin._apps:
            _firebase_ready = True
            return True

        if FIREBASE_CREDENTIALS_JSON:
            payload = json.loads(FIREBASE_CREDENTIALS_JSON)
            cred = credentials.Certificate(payload)
            firebase_admin.initialize_app(cred)
            _firebase_ready = True
            return True

        if FIREBASE_CREDENTIALS_FILE:
            cred = credentials.Certificate(FIREBASE_CREDENTIALS_FILE)
            firebase_admin.initialize_app(cred)
            _firebase_ready = True
            return True

        logger.warning("Push credentials missing (FIREBASE_CREDENTIALS_FILE/FIREBASE_CREDENTIALS_JSON)")
        return False
    except Exception as exc:
        logger.warning("Failed to initialize Firebase Admin SDK: %s", exc)
        return False


def register_push_device(db: Session, *, user_id: int, payload) -> PushDevice:
    token = payload.token.strip()
    row = db.query(PushDevice).filter(PushDevice.token == token).first()

    if row is None:
        row = PushDevice(user_id=user_id, token=token)
        db.add(row)

    row.user_id = user_id
    row.platform = payload.platform
    row.device_id = payload.device_id
    row.app_version = payload.app_version
    row.enabled = True
    row.allow_messages = bool(payload.allow_messages)
    row.allow_likes = bool(payload.allow_likes)
    row.allow_calls = bool(payload.allow_calls)
    row.allow_presence = bool(payload.allow_presence)
    row.allow_general = bool(payload.allow_general)
    row.last_seen_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(row)
    return row


def unregister_push_device(db: Session, *, user_id: int, token: str | None, device_id: str | None) -> dict[str, int]:
    query = db.query(PushDevice).filter(PushDevice.user_id == user_id, PushDevice.enabled.is_(True))

    if token:
        query = query.filter(PushDevice.token == token.strip())
    elif device_id:
        query = query.filter(PushDevice.device_id == device_id.strip())
    else:
        return {"updated": 0}

    rows = query.all()
    for row in rows:
        row.enabled = False
        row.last_seen_at = datetime.now(timezone.utc)

    db.commit()
    return {"updated": len(rows)}


def update_push_preferences(db: Session, *, user_id: int, payload) -> dict[str, int]:
    query = db.query(PushDevice).filter(PushDevice.user_id == user_id, PushDevice.enabled.is_(True))

    if payload.token:
        query = query.filter(PushDevice.token == payload.token.strip())
    elif payload.device_id:
        query = query.filter(PushDevice.device_id == payload.device_id.strip())

    rows = query.all()
    for row in rows:
        if payload.allow_messages is not None:
            row.allow_messages = bool(payload.allow_messages)
        if payload.allow_likes is not None:
            row.allow_likes = bool(payload.allow_likes)
        if payload.allow_calls is not None:
            row.allow_calls = bool(payload.allow_calls)
        if payload.allow_presence is not None:
            row.allow_presence = bool(payload.allow_presence)
        if payload.allow_general is not None:
            row.allow_general = bool(payload.allow_general)
        row.last_seen_at = datetime.now(timezone.utc)

    db.commit()
    return {"updated": len(rows)}


def list_push_devices(db: Session, *, user_id: int) -> list[PushDevice]:
    return (
        db.query(PushDevice)
        .filter(PushDevice.user_id == user_id)
        .order_by(PushDevice.updated_at.desc())
        .all()
    )


def _is_category_allowed(device: PushDevice, category: str) -> bool:
    if category == "message":
        return bool(device.allow_messages and device.allow_general)
    if category == "like":
        return bool(device.allow_likes and device.allow_general)
    if category == "call":
        return bool(device.allow_calls and device.allow_general)
    if category == "presence":
        return bool(device.allow_presence and device.allow_general)
    return bool(device.allow_general)


def _sanitize_data(data: dict[str, Any] | None) -> dict[str, str]:
    if not data:
        return {}
    return {str(k): str(v) for k, v in data.items() if v is not None}


def send_push_to_user(
    db: Session,
    *,
    user_id: int,
    title: str,
    body: str,
    category: str = "general",
    data: dict[str, Any] | None = None,
    skip_if_online: bool = True,
) -> dict[str, int]:
    if skip_if_online and manager.is_user_connected(int(user_id)):
        return {"sent": 0, "failed": 0, "skipped": 1}

    devices = (
        db.query(PushDevice)
        .filter(PushDevice.user_id == int(user_id), PushDevice.enabled.is_(True))
        .all()
    )
    filtered = [row for row in devices if _is_category_allowed(row, category)]
    if not filtered:
        return {"sent": 0, "failed": 0, "skipped": 0}

    if not _load_firebase():
        return {"sent": 0, "failed": len(filtered), "skipped": 0}

    from firebase_admin import messaging

    payload = _sanitize_data(data)
    sent = 0
    failed = 0
    now = datetime.now(timezone.utc)

    for device in filtered:
        message = messaging.Message(
            token=device.token,
            notification=messaging.Notification(title=title, body=body),
            data=payload,
            android=messaging.AndroidConfig(priority="high"),
            apns=messaging.APNSConfig(
                headers={"apns-priority": "10"},
                payload=messaging.APNSPayload(aps=messaging.Aps(sound="default")),
            ),
        )

        try:
            messaging.send(message, dry_run=False)
            device.last_seen_at = now
            sent += 1
        except Exception as exc:
            failed += 1
            error_text = str(exc).lower()
            if "registration-token-not-registered" in error_text or "invalid registration token" in error_text:
                device.enabled = False
            logger.warning("Push send failed user=%s device=%s: %s", user_id, device.id, exc)

    db.commit()
    return {"sent": sent, "failed": failed, "skipped": 0}


def send_push_for_notification(db: Session, *, user_id: int, actor_id: int, notif_type: str, message: str | None, reference_id: int | None):
    actor = db.query(User).filter(User.id == actor_id).first()
    actor_name = "Alguem"
    if actor is not None:
        actor_name = actor.full_name or actor.username or actor_name

    category = "general"
    if notif_type == "message":
        category = "message"
    elif notif_type == "like":
        category = "like"
    elif notif_type == "following_online":
        category = "presence"

    body = f"{actor_name} {message or 'enviou uma atualizacao'}".strip()
    return send_push_to_user(
        db,
        user_id=user_id,
        title="Ello",
        body=body,
        category=category,
        data={
            "type": notif_type,
            "actor_id": actor_id,
            "reference_id": reference_id,
        },
        skip_if_online=True,
    )
