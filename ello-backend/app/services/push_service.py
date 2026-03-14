import hashlib
import json
import logging
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import (
    FIREBASE_CREDENTIALS_FILE,
    FIREBASE_CREDENTIALS_JSON,
    PUSH_NOTIFICATIONS_ENABLED,
    WEB_PUSH_VAPID_PRIVATE_KEY,
    WEB_PUSH_VAPID_SUBJECT,
)
from app.core.websocket_manager import manager
from app.models.push_device import PushDevice
from app.models.user import User

logger = logging.getLogger(__name__)

_firebase_ready = False
_firebase_init_attempted = False
_web_push_ready = False
_web_push_init_attempted = False


def _clean_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = str(value).strip()
    return normalized or None


def _build_web_device_token(endpoint: str) -> str:
    digest = hashlib.sha256(endpoint.encode("utf-8")).hexdigest()
    return f"web:{digest}"


def _load_firebase() -> bool:
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


def _load_web_push() -> bool:
    global _web_push_ready, _web_push_init_attempted

    if _web_push_ready:
        return True
    if _web_push_init_attempted:
        return False

    _web_push_init_attempted = True

    if not PUSH_NOTIFICATIONS_ENABLED:
        return False

    if not WEB_PUSH_VAPID_PRIVATE_KEY or not WEB_PUSH_VAPID_SUBJECT:
        logger.info("Web push disabled: WEB_PUSH_VAPID_PRIVATE_KEY/WEB_PUSH_VAPID_SUBJECT missing")
        return False

    try:
        from pywebpush import webpush  # noqa: F401

        _web_push_ready = True
        return True
    except Exception as exc:
        logger.warning("Failed to initialize Web Push support: %s", exc)
        return False


def register_push_device(db: Session, *, user_id: int, payload) -> PushDevice:
    token = _clean_text(getattr(payload, "token", None))
    endpoint = _clean_text(getattr(payload, "subscription_endpoint", None))
    p256dh = _clean_text(getattr(payload, "subscription_p256dh", None))
    auth = _clean_text(getattr(payload, "subscription_auth", None))

    if endpoint and (token is None or token == endpoint):
        token = _build_web_device_token(endpoint)

    if token is None:
        raise ValueError("token or subscription_endpoint is required")

    row = db.query(PushDevice).filter(PushDevice.token == token).first()
    if row is None and endpoint:
        row = db.query(PushDevice).filter(PushDevice.subscription_endpoint == endpoint).first()

    if row is None:
        row = PushDevice(user_id=user_id, token=token)
        db.add(row)

    row.user_id = user_id
    row.token = token
    row.platform = _clean_text(getattr(payload, "platform", None))
    row.device_id = _clean_text(getattr(payload, "device_id", None))
    row.app_version = _clean_text(getattr(payload, "app_version", None))
    row.subscription_endpoint = endpoint
    row.subscription_p256dh = p256dh
    row.subscription_auth = auth
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


def unregister_push_device(
    db: Session,
    *,
    user_id: int,
    token: str | None,
    device_id: str | None,
    subscription_endpoint: str | None,
) -> dict[str, int]:
    query = db.query(PushDevice).filter(PushDevice.user_id == user_id, PushDevice.enabled.is_(True))

    normalized_token = _clean_text(token)
    normalized_device_id = _clean_text(device_id)
    normalized_endpoint = _clean_text(subscription_endpoint)

    if normalized_endpoint:
        query = query.filter(PushDevice.subscription_endpoint == normalized_endpoint)
    elif normalized_token:
        query = query.filter(PushDevice.token == normalized_token)
    elif normalized_device_id:
        query = query.filter(PushDevice.device_id == normalized_device_id)
    else:
        return {"updated": 0}

    rows = query.all()
    now = datetime.now(timezone.utc)

    for row in rows:
        row.enabled = False
        row.last_seen_at = now

    db.commit()
    return {"updated": len(rows)}


def update_push_preferences(db: Session, *, user_id: int, payload) -> dict[str, int]:
    query = db.query(PushDevice).filter(PushDevice.user_id == user_id, PushDevice.enabled.is_(True))

    token = _clean_text(getattr(payload, "token", None))
    device_id = _clean_text(getattr(payload, "device_id", None))
    endpoint = _clean_text(getattr(payload, "subscription_endpoint", None))

    if endpoint:
        query = query.filter(PushDevice.subscription_endpoint == endpoint)
    elif token:
        query = query.filter(PushDevice.token == token)
    elif device_id:
        query = query.filter(PushDevice.device_id == device_id)

    rows = query.all()
    now = datetime.now(timezone.utc)

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
        row.last_seen_at = now

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


def _is_web_push_device(device: PushDevice) -> bool:
    platform = (device.platform or "").strip().lower()
    if platform == "web":
        return True
    return bool(device.subscription_endpoint and device.subscription_p256dh and device.subscription_auth)


def _send_mobile_pushes(
    *,
    devices: list[PushDevice],
    user_id: int,
    title: str,
    body: str,
    category: str,
    payload: dict[str, str],
) -> tuple[int, int]:
    if not devices:
        return 0, 0

    if not _load_firebase():
        return 0, len(devices)

    from firebase_admin import messaging

    sent = 0
    failed = 0
    now = datetime.now(timezone.utc)

    push_type = str(payload.get("type", "")).strip().lower()
    call_control_types = {
        "call_ended",
        "call_missed",
        "call_rejected",
        "call_busy",
        "call_canceled",
        "call_cancelled",
    }
    is_incoming_call_push = push_type == "incoming_call"
    is_call_control_push = category == "call" and push_type in call_control_types
    is_data_only_call_push = is_incoming_call_push or is_call_control_push

    android_channel_id = "ello_calls" if is_incoming_call_push else "ello_general"
    android_sound = "recebida" if is_incoming_call_push else "notificacao"
    apns_sound = "default"
    message_data = payload if not is_incoming_call_push else {**payload, "title": title, "body": body}

    for device in devices:
        notification_payload = None if is_data_only_call_push else messaging.Notification(title=title, body=body)
        android_notification = (
            None
            if is_data_only_call_push
            else messaging.AndroidNotification(
                sound=android_sound,
                channel_id=android_channel_id,
                priority="high",
                visibility="public",
            )
        )
        if is_incoming_call_push:
            apns_aps = messaging.Aps(
                alert=messaging.ApsAlert(title=title, body=body),
                sound=apns_sound,
            )
            apns_headers = {"apns-priority": "10"}
            apns_headers["apns-push-type"] = "alert"
        elif is_call_control_push:
            apns_aps = messaging.Aps(content_available=True)
            apns_headers = {
                "apns-priority": "5",
                "apns-push-type": "background",
            }
        else:
            apns_aps = messaging.Aps(sound=apns_sound)
            apns_headers = {"apns-priority": "10"}

        message = messaging.Message(
            token=device.token,
            notification=notification_payload,
            data=message_data,
            android=messaging.AndroidConfig(
                priority="high",
                notification=android_notification,
            ),
            apns=messaging.APNSConfig(
                headers=apns_headers,
                payload=messaging.APNSPayload(aps=apns_aps),
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

    return sent, failed


def _build_web_subscription(device: PushDevice) -> dict[str, Any] | None:
    endpoint = _clean_text(device.subscription_endpoint)
    p256dh = _clean_text(device.subscription_p256dh)
    auth = _clean_text(device.subscription_auth)

    if not endpoint or not p256dh or not auth:
        return None

    return {
        "endpoint": endpoint,
        "keys": {
            "p256dh": p256dh,
            "auth": auth,
        },
    }


def _send_web_pushes(
    *,
    devices: list[PushDevice],
    user_id: int,
    title: str,
    body: str,
    payload: dict[str, str],
) -> tuple[int, int]:
    if not devices:
        return 0, 0

    if not _load_web_push():
        return 0, len(devices)

    from pywebpush import WebPushException, webpush

    vapid_claims = {"sub": WEB_PUSH_VAPID_SUBJECT}
    web_payload = json.dumps(
        {
            "title": title,
            "body": body,
            "data": payload,
        }
    )

    sent = 0
    failed = 0
    now = datetime.now(timezone.utc)

    for device in devices:
        subscription_info = _build_web_subscription(device)
        if subscription_info is None:
            failed += 1
            device.enabled = False
            continue

        try:
            webpush(
                subscription_info=subscription_info,
                data=web_payload,
                vapid_private_key=WEB_PUSH_VAPID_PRIVATE_KEY,
                vapid_claims=vapid_claims,
                ttl=120,
            )
            device.last_seen_at = now
            sent += 1
        except WebPushException as exc:
            failed += 1
            status_code = getattr(getattr(exc, "response", None), "status_code", None)
            if status_code in {404, 410}:
                device.enabled = False
            logger.warning("Web push send failed user=%s device=%s status=%s: %s", user_id, device.id, status_code, exc)
        except Exception as exc:
            failed += 1
            logger.warning("Web push send failed user=%s device=%s: %s", user_id, device.id, exc)

    return sent, failed


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
    devices = (
        db.query(PushDevice)
        .filter(PushDevice.user_id == int(user_id), PushDevice.enabled.is_(True))
        .all()
    )
    filtered = [row for row in devices if _is_category_allowed(row, category)]
    if not filtered:
        return {"sent": 0, "failed": 0, "skipped": 0}

    web_devices = [row for row in filtered if _is_web_push_device(row)]
    web_ids = {id(row) for row in web_devices}
    mobile_devices = [row for row in filtered if id(row) not in web_ids]
    skipped = 0

    # Keep mobile push delivery active even when user has an open websocket session.
    # On mobile apps, websocket state can look "online" for a short period while the app
    # is already backgrounded, which would suppress critical push notifications.
    if skip_if_online and manager.is_user_connected(int(user_id)):
        skipped = len(web_devices)
        web_devices = []

    payload = _sanitize_data(data)

    mobile_sent, mobile_failed = _send_mobile_pushes(
        devices=mobile_devices,
        user_id=int(user_id),
        title=title,
        body=body,
        category=category,
        payload=payload,
    )
    web_sent, web_failed = _send_web_pushes(
        devices=web_devices,
        user_id=int(user_id),
        title=title,
        body=body,
        payload=payload,
    )

    db.commit()

    return {
        "sent": mobile_sent + web_sent,
        "failed": mobile_failed + web_failed,
        "skipped": skipped,
    }


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
        title="Ello Social",
        body=body,
        category=category,
        data={
            "type": notif_type,
            "actor_id": actor_id,
            "reference_id": reference_id,
        },
        skip_if_online=True,
    )
