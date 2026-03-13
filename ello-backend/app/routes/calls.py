# ==========================================================
# CALL ROUTES
# ==========================================================

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.call import CallStart
from app.services.call_service import (
    RING_TIMEOUT_SECONDS,
    get_user_active_call,
    initiate_call,
    schedule_call_timeout,
    update_call_status,
)
from app.services.push_service import send_push_to_user
from app.core.dependencies import get_current_user
from app.core.websocket_manager import manager

router = APIRouter(prefix="/calls", tags=["Calls"])
BUSY_AUTO_RELEASE_AFTER_SECONDS = 45


def _to_utc(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _call_age_seconds(call) -> float | None:
    reference_time = _to_utc(call.started_at) or _to_utc(call.created_at)
    if reference_time is None:
        return None
    delta = datetime.now(timezone.utc) - reference_time
    return max(0.0, float(delta.total_seconds()))


def _raise_call_error(result: dict) -> None:
    if not result.get("error"):
        return

    message = str(result.get("error") or "Call error")
    status_code = 409
    if message.lower() == "call not found":
        status_code = 404
    raise HTTPException(status_code=status_code, detail=message)


@router.post("/start")
async def start(data: CallStart,
                db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    if int(data.receiver_id) == int(current_user.id):
        raise HTTPException(status_code=400, detail="Nao e possivel ligar para voce mesmo")

    normalized_call_type = "video" if str(data.call_type or "").strip().lower() == "video" else "voice"

    caller_active_call = get_user_active_call(db, current_user.id)
    if caller_active_call:
        peer_user_id = int(caller_active_call.receiver_id) if int(caller_active_call.caller_id) == int(current_user.id) else int(caller_active_call.caller_id)
        peer_connected = manager.is_user_connected(peer_user_id)
        call_age_seconds = _call_age_seconds(caller_active_call)

        # Auto-recuperacao para chamadas aceitas que ficaram presas por
        # encerramento abrupto (app fechado/crash/perda de rede).
        if (
            str(caller_active_call.status or "").lower() == "accepted"
            and call_age_seconds is not None
            and call_age_seconds >= BUSY_AUTO_RELEASE_AFTER_SECONDS
            and not peer_connected
        ):
            release_result = update_call_status(db, int(caller_active_call.id), "ended", current_user.id)
            if not release_result.get("error"):
                caller_active_call = get_user_active_call(db, current_user.id, exclude_call_id=int(caller_active_call.id))

        if not caller_active_call:
            peer_user_id = None
            peer_connected = None
            call_age_seconds = None

    if caller_active_call:
        peer_user_id = int(caller_active_call.receiver_id) if int(caller_active_call.caller_id) == int(current_user.id) else int(caller_active_call.caller_id)
        peer_connected = manager.is_user_connected(peer_user_id)
        call_age_seconds = _call_age_seconds(caller_active_call)
        raise HTTPException(
            status_code=409,
            detail={
                "code": "caller_busy",
                "message": "Voce ja esta em uma ligacao em andamento",
                "call_id": int(caller_active_call.id),
                "call_type": str(caller_active_call.call_type or "voice"),
                "peer_user_id": peer_user_id,
                "peer_connected": bool(peer_connected),
                "call_age_seconds": int(call_age_seconds or 0),
            },
        )

    receiver_active_call = get_user_active_call(db, data.receiver_id)
    if receiver_active_call:
        peer_user_id = int(receiver_active_call.receiver_id) if int(receiver_active_call.caller_id) == int(data.receiver_id) else int(receiver_active_call.caller_id)
        peer_connected = manager.is_user_connected(peer_user_id)
        call_age_seconds = _call_age_seconds(receiver_active_call)

        # Mesmo criterio para liberar estado preso do destinatario.
        if (
            str(receiver_active_call.status or "").lower() == "accepted"
            and call_age_seconds is not None
            and call_age_seconds >= BUSY_AUTO_RELEASE_AFTER_SECONDS
            and not peer_connected
        ):
            release_result = update_call_status(db, int(receiver_active_call.id), "ended")
            if not release_result.get("error"):
                receiver_active_call = get_user_active_call(db, data.receiver_id, exclude_call_id=int(receiver_active_call.id))

        if not receiver_active_call:
            peer_user_id = None
            peer_connected = None
            call_age_seconds = None

    if receiver_active_call:
        peer_user_id = int(receiver_active_call.receiver_id) if int(receiver_active_call.caller_id) == int(data.receiver_id) else int(receiver_active_call.caller_id)
        peer_connected = manager.is_user_connected(peer_user_id)
        call_age_seconds = _call_age_seconds(receiver_active_call)
        raise HTTPException(
            status_code=409,
            detail={
                "code": "user_busy",
                "message": "Usuario ocupado em outra ligacao",
                "call_id": int(receiver_active_call.id),
                "call_type": str(receiver_active_call.call_type or "voice"),
                "peer_user_id": peer_user_id,
                "peer_connected": bool(peer_connected),
                "call_age_seconds": int(call_age_seconds or 0),
            },
        )

    call = initiate_call(
        db,
        current_user.id,
        data.receiver_id,
        normalized_call_type,
    )

    payload = {
        "type": "incoming_call",
        "call_id": call.id,
        "from_user_id": current_user.id,
        "call_type": normalized_call_type,
    }

    await manager.send_to_user(data.receiver_id, payload)
    send_push_to_user(
        db,
        user_id=data.receiver_id,
        title="Chamada recebida",
        body=f"{current_user.full_name or current_user.username} esta ligando para voce",
        category="call",
        data={
            "type": "incoming_call",
            "call_id": call.id,
            "from_user_id": current_user.id,
            "call_type": normalized_call_type,
        },
        skip_if_online=False,
    )
    schedule_call_timeout(call.id, timeout_seconds=RING_TIMEOUT_SECONDS)

    return call


@router.post("/accept/{call_id}")
async def accept(call_id: int,
                 db: Session = Depends(get_db),
                 current_user=Depends(get_current_user)):
    result = update_call_status(db, call_id, "accepted", current_user.id)
    _raise_call_error(result)
    if str(result.get("status") or "").lower() != "accepted":
        raise HTTPException(status_code=409, detail="Call is no longer available")
    return result


@router.post("/end/{call_id}")
async def end(call_id: int,
              db: Session = Depends(get_db),
              current_user=Depends(get_current_user)):
    result = update_call_status(db, call_id, "ended", current_user.id)
    _raise_call_error(result)
    return result
