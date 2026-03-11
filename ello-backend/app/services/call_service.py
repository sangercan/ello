# ==========================================================
# FILE: app/services/call_service.py
# MODULE: CALL SERVICE
# RESPONSIBILITY:
# - Initiate call
# - Update call status
# - Handle real-time signaling
# ==========================================================

import asyncio
import logging
from sqlalchemy.orm import Session
from datetime import datetime
from app.models.call_session import CallSession
from app.services.chat_service import send_message
from app.core.websocket_manager import manager

logger = logging.getLogger(__name__)

def _describe_call_type(call_type: str) -> str:
    return "vídeo" if call_type == "video" else "voz"

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
    asyncio.create_task(_dispatch_chat_event(sender_id, receiver_id, serialized))

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
        logger.debug("Não foi possível registrar evento de chamada: %s", exc)


# ----------------------------------------------------------
# INITIATE CALL
# ----------------------------------------------------------

def initiate_call(db: Session, caller_id: int, receiver_id: int, call_type: str):

    call = CallSession(
        caller_id=caller_id,
        receiver_id=receiver_id,
        call_type=call_type,
        status="ringing"
    )

    db.add(call)
    db.commit()
    db.refresh(call)
    _log_call_event(db, caller_id, receiver_id, call_type, "iniciada")

    return call


# ----------------------------------------------------------
# UPDATE CALL STATUS
# ----------------------------------------------------------

def update_call_status(db: Session, call_id: int, status: str, actor_id: int | None = None):

    call = db.query(CallSession).filter(CallSession.id == call_id).first()

    if not call:
        return {"error": "Call not found"}

    previous_status = call.status
    call.status = status

    if status == "accepted":
        call.started_at = datetime.utcnow()

    if status == "ended":
        call.ended_at = datetime.utcnow()

    db.commit()

    if status == "accepted":
        sender_id = actor_id or call.receiver_id
        _log_call_event(db, sender_id, call.caller_id, call.call_type, "recebida")
    elif status == "ended":
        suffix = "perdida" if previous_status == "ringing" else "encerrada"
        sender_id = actor_id or call.caller_id
        receiver_id = call.receiver_id if sender_id == call.caller_id else call.caller_id
        _log_call_event(db, sender_id, receiver_id, call.call_type, suffix)

    return {"status": status}
