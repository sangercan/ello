# ==========================================================
# CALL ROUTES
# ==========================================================

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.call import CallStart
from app.services.call_service import (
    RING_TIMEOUT_SECONDS,
    initiate_call,
    is_user_busy_in_call,
    schedule_call_timeout,
    update_call_status,
)
from app.services.push_service import send_push_to_user
from app.core.dependencies import get_current_user
from app.core.websocket_manager import manager

router = APIRouter(prefix="/calls", tags=["Calls"])


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

    if is_user_busy_in_call(db, current_user.id):
        raise HTTPException(
            status_code=409,
            detail={"code": "caller_busy", "message": "Voce ja esta em uma ligacao em andamento"},
        )

    if is_user_busy_in_call(db, data.receiver_id):
        raise HTTPException(
            status_code=409,
            detail={"code": "user_busy", "message": "Usuario ocupado em outra ligacao"},
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
