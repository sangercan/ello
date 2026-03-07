# ==========================================================
# FILE: app/services/call_service.py
# MODULE: CALL SERVICE
# RESPONSIBILITY:
# - Initiate call
# - Update call status
# - Handle real-time signaling
# ==========================================================

from sqlalchemy.orm import Session
from datetime import datetime
from app.models.call_session import CallSession
from app.core.websocket_manager import manager
import asyncio


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

    # Notify receiver via WebSocket
    asyncio.create_task(
        manager.send_to_user(
            receiver_id,
            {
                "type": "incoming_call",
                "call_id": call.id,
                "from_user_id": caller_id,
                "call_type": call_type
            }
        )
    )

    return call


# ----------------------------------------------------------
# UPDATE CALL STATUS
# ----------------------------------------------------------

def update_call_status(db: Session, call_id: int, status: str):

    call = db.query(CallSession).filter(CallSession.id == call_id).first()

    if not call:
        return {"error": "Call not found"}

    call.status = status

    if status == "accepted":
        call.started_at = datetime.utcnow()

    if status == "ended":
        call.ended_at = datetime.utcnow()

    db.commit()

    return {"status": status}