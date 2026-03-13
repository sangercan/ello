# ==========================================================
# FILE: app/services/call_service.py
# ==========================================================

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from app.core.websocket_manager import manager
from app.database import SessionLocal
from app.models.call_session import CallSession
from app.services.chat_service import send_message
from app.services.push_service import send_push_to_user

logger = logging.getLogger(__name__)

RING_TIMEOUT_SECONDS = 60
ACTIVE_CALL_STATUSES = {"ringing", "accepted"}
TERMINAL_CALL_STATUSES = {"ended", "missed", "rejected", "busy", "canceled", "cancelled"}
BUSY_ACCEPTED_STALE_HOURS = 6
CALL_CONTROL_PUSH_TYPES = {
    "call_ended",
    "call_missed",
    "call_rejected",
    "call_busy",
    "call_canceled",
    "call_cancelled",
}


def _normalize_call_type(call_type: str) -> str:
    value = str(call_type or "").strip().lower()
    return "video" if value == "video" else "voice"


def _describe_call_type(call_type: str) -> str:
    return "video" if _normalize_call_type(call_type) == "video" else "voz"


def _normalize_status(status: str) -> str:
    value = str(status or "").strip().lower()
    if value == "cancelled":
        return "canceled"
    return value or "ended"


def _safe_schedule(coro, *, label: str) -> None:
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        logger.debug("Nao foi possivel agendar tarefa async sem loop: %s", label)
        return

    loop.create_task(coro)


def _serialize_message(message):
    return {
        "id": message.id,
        "sender_id": message.sender_id,
        "receiver_id": message.receiver_id,
        "content": message.content,
        "is_delivered": message.is_delivered,
        "is_read": message.is_read,
        "created_at": message.created_at.isoformat() if message.created_at else None,
        "audio_url": message.audio_url,
        "media_url": message.media_url,
    }


async def _dispatch_chat_event(sender_id: int, receiver_id: int, serialized_message: dict):
    payload = {
        "type": "new_message",
        "from_user_id": sender_id,
        "to_user_id": receiver_id,
        "message": serialized_message,
    }
    await manager.send_to_user(receiver_id, payload)
    await manager.send_to_user(sender_id, payload)


def _emit_chat_event(sender_id: int, receiver_id: int, message):
    serialized = _serialize_message(message)
    _safe_schedule(
        _dispatch_chat_event(sender_id, receiver_id, serialized),
        label="dispatch_chat_event",
    )


def _log_call_event(db: Session, sender_id: int, receiver_id: int, call_type: str, suffix: str):
    content = f"Chamada de {_describe_call_type(call_type)} {suffix}"
    try:
        message = send_message(
            db=db,
            sender_id=sender_id,
            receiver_id=receiver_id,
            content=content,
        )
        if message:
            _emit_chat_event(sender_id, receiver_id, message)
    except Exception as exc:
        logger.debug("Nao foi possivel registrar evento de chamada: %s", exc)


def _status_label(status: str, previous_status: str) -> str:
    if status == "accepted":
        return "recebida"
    if status == "missed":
        return "perdida"
    if status == "rejected":
        return "recusada"
    if status == "busy":
        return "ocupada"
    if status == "ended" and previous_status == "ringing":
        return "cancelada"
    if status == "canceled":
        return "cancelada"
    return "encerrada"


def _status_reason(status: str, previous_status: str) -> str:
    if status == "missed":
        return "timeout"
    if status == "busy":
        return "busy"
    if status == "rejected":
        return "rejected"
    if status == "canceled":
        return "canceled"
    if status == "ended" and previous_status == "ringing":
        return "canceled"
    return status


def _to_control_push_type(status: str, previous_status: str) -> str | None:
    if status == "missed":
        return "call_missed"
    if status == "rejected":
        return "call_rejected"
    if status == "busy":
        return "call_busy"
    if status == "canceled":
        return "call_canceled"
    if status == "ended":
        if previous_status == "ringing":
            return "call_ended"
        return None
    return None


def _control_push_text(push_type: str) -> tuple[str, str]:
    if push_type == "call_busy":
        return ("Linha ocupada", "O usuario esta em outra ligacao agora")
    if push_type == "call_rejected":
        return ("Ligacao recusada", "Sua chamada foi recusada")
    if push_type == "call_missed":
        return ("Ligacao perdida", "Ninguem atendeu em 1 minuto")
    if push_type in {"call_canceled", "call_cancelled"}:
        return ("Ligacao cancelada", "A chamada foi cancelada")
    return ("Ligacao encerrada", "A chamada foi encerrada")


async def _dispatch_call_status_event(payload: dict):
    recipients = {int(payload["caller_id"]), int(payload["receiver_id"])}
    for user_id in recipients:
        await manager.send_to_user(user_id, payload)


def _emit_call_status_event(call: CallSession, *, status: str, previous_status: str, actor_id: int | None):
    payload = {
        "type": "call_status",
        "call_id": call.id,
        "status": status,
        "previous_status": previous_status,
        "actor_id": actor_id,
        "reason": _status_reason(status, previous_status),
        "caller_id": call.caller_id,
        "receiver_id": call.receiver_id,
        "call_type": call.call_type,
    }
    _safe_schedule(_dispatch_call_status_event(payload), label="dispatch_call_status_event")


def _emit_call_control_pushes(db: Session, *, call: CallSession, status: str, previous_status: str):
    push_type = _to_control_push_type(status, previous_status)
    if not push_type or push_type not in CALL_CONTROL_PUSH_TYPES:
        return

    title, body = _control_push_text(push_type)
    payload = {
        "type": push_type,
        "call_id": call.id,
        "call_status": status,
        "caller_id": call.caller_id,
        "receiver_id": call.receiver_id,
        "call_type": call.call_type,
    }

    # Send to both participants to keep caller/callee state in sync even if
    # one side is minimized/backgrounded.
    for user_id in {int(call.caller_id), int(call.receiver_id)}:
        try:
            send_push_to_user(
                db,
                user_id=user_id,
                title=title,
                body=body,
                category="call",
                data=payload,
                skip_if_online=False,
            )
        except Exception as exc:
            logger.warning("Falha ao enviar push de controle da chamada user=%s: %s", user_id, exc)


def _cleanup_stale_accepted_calls(db: Session, user_id: int, *, exclude_call_id: int | None = None) -> None:
    now = datetime.now(timezone.utc)
    stale_limit = now - timedelta(hours=BUSY_ACCEPTED_STALE_HOURS)

    base_filters = [
        or_(CallSession.caller_id == int(user_id), CallSession.receiver_id == int(user_id)),
        CallSession.ended_at.is_(None),
    ]
    if exclude_call_id is not None:
        base_filters.append(CallSession.id != int(exclude_call_id))

    # Cleanup automatico: sessoes antigas travadas como "accepted" nao devem
    # manter usuario ocupado para sempre.
    stale_accepted = (
        db.query(CallSession)
        .filter(
            *base_filters,
            CallSession.status == "accepted",
            or_(
                and_(CallSession.started_at.is_not(None), CallSession.started_at < stale_limit),
                and_(CallSession.started_at.is_(None), CallSession.created_at < stale_limit),
            ),
        )
        .all()
    )
    if not stale_accepted:
        return

    for call in stale_accepted:
        call.status = "ended"
        call.ended_at = now
    db.commit()
    logger.info(
        "Encerradas %d chamadas stale para liberar estado ocupado do usuario %s",
        len(stale_accepted),
        user_id,
    )


def get_user_active_call(db: Session, user_id: int, *, exclude_call_id: int | None = None) -> CallSession | None:
    _cleanup_stale_accepted_calls(db, user_id, exclude_call_id=exclude_call_id)

    now = datetime.now(timezone.utc)
    stale_limit = now - timedelta(hours=BUSY_ACCEPTED_STALE_HOURS)

    base_filters = [
        or_(CallSession.caller_id == int(user_id), CallSession.receiver_id == int(user_id)),
        CallSession.ended_at.is_(None),
    ]
    if exclude_call_id is not None:
        base_filters.append(CallSession.id != int(exclude_call_id))

    # Regra de ocupado: somente chamada efetivamente em andamento (accepted).
    active_query = db.query(CallSession).filter(
        *base_filters,
        CallSession.status == "accepted",
        or_(
            and_(CallSession.started_at.is_not(None), CallSession.started_at >= stale_limit),
            and_(CallSession.started_at.is_(None), CallSession.created_at >= stale_limit),
        ),
    )
    return active_query.order_by(CallSession.created_at.desc(), CallSession.id.desc()).first()


def is_user_busy_in_call(db: Session, user_id: int, *, exclude_call_id: int | None = None) -> bool:
    return get_user_active_call(db, user_id, exclude_call_id=exclude_call_id) is not None


def initiate_call(db: Session, caller_id: int, receiver_id: int, call_type: str):
    call = CallSession(
        caller_id=int(caller_id),
        receiver_id=int(receiver_id),
        call_type=_normalize_call_type(call_type),
        status="ringing",
    )

    db.add(call)
    db.commit()
    db.refresh(call)
    _log_call_event(db, int(caller_id), int(receiver_id), call.call_type, "iniciada")
    return call


def update_call_status(db: Session, call_id: int, status: str, actor_id: int | None = None):
    call = db.query(CallSession).filter(CallSession.id == int(call_id)).first()
    if not call:
        return {"error": "Call not found", "status": "not_found"}

    if actor_id is not None and int(actor_id) not in {int(call.caller_id), int(call.receiver_id)}:
        return {"error": "Not allowed", "status": call.status}

    normalized_status = _normalize_status(status)
    previous_status = _normalize_status(call.status)

    if previous_status in TERMINAL_CALL_STATUSES:
        return {
            "status": previous_status,
            "previous_status": previous_status,
            "call_id": call.id,
            "caller_id": call.caller_id,
            "receiver_id": call.receiver_id,
            "call_type": call.call_type,
        }

    if normalized_status == "accepted" and previous_status != "ringing":
        return {
            "error": "Call is no longer ringing",
            "status": previous_status,
            "call_id": call.id,
            "caller_id": call.caller_id,
            "receiver_id": call.receiver_id,
            "call_type": call.call_type,
        }

    call.status = normalized_status

    now = datetime.now(timezone.utc)
    if normalized_status == "accepted" and not call.started_at:
        call.started_at = now

    if normalized_status in TERMINAL_CALL_STATUSES and call.ended_at is None:
        call.ended_at = now

    db.commit()

    if normalized_status == "accepted":
        sender_id = int(actor_id or call.receiver_id)
        _log_call_event(db, sender_id, int(call.caller_id), call.call_type, "recebida")
    elif normalized_status in TERMINAL_CALL_STATUSES:
        sender_id = int(actor_id or call.caller_id)
        receiver_id = int(call.receiver_id if sender_id == int(call.caller_id) else call.caller_id)
        _log_call_event(db, sender_id, receiver_id, call.call_type, _status_label(normalized_status, previous_status))

    _emit_call_status_event(
        call,
        status=normalized_status,
        previous_status=previous_status,
        actor_id=actor_id,
    )
    _emit_call_control_pushes(
        db,
        call=call,
        status=normalized_status,
        previous_status=previous_status,
    )

    return {
        "status": normalized_status,
        "previous_status": previous_status,
        "call_id": call.id,
        "caller_id": call.caller_id,
        "receiver_id": call.receiver_id,
        "call_type": call.call_type,
    }


async def _ring_timeout_worker(call_id: int, timeout_seconds: int):
    await asyncio.sleep(max(1, int(timeout_seconds)))

    db = SessionLocal()
    try:
        call = db.query(CallSession).filter(CallSession.id == int(call_id)).first()
        if not call:
            return
        if _normalize_status(call.status) != "ringing":
            return

        update_call_status(db, int(call_id), "missed", actor_id=int(call.caller_id))
    except Exception:
        logger.exception("Erro ao finalizar chamada por timeout call_id=%s", call_id)
    finally:
        db.close()


def schedule_call_timeout(call_id: int, *, timeout_seconds: int = RING_TIMEOUT_SECONDS) -> None:
    _safe_schedule(
        _ring_timeout_worker(int(call_id), int(timeout_seconds)),
        label="call_ring_timeout",
    )
