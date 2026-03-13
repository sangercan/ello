# ==========================================================
# CALL ROUTES
# ==========================================================

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas.call import CallStart
from app.services.call_service import initiate_call, update_call_status
from app.services.push_service import send_push_to_user
from app.core.dependencies import get_current_user
from app.core.websocket_manager import manager

router = APIRouter(prefix="/calls", tags=["Calls"])


@router.post("/start")
async def start(data: CallStart,
                db: Session = Depends(get_db),
                current_user=Depends(get_current_user)):
    call = initiate_call(
        db,
        current_user.id,
        data.receiver_id,
        data.call_type
    )

    payload = {
        "type": "incoming_call",
        "call_id": call.id,
        "from_user_id": current_user.id,
        "call_type": data.call_type,
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
            "call_type": data.call_type,
        },
        skip_if_online=False,
    )

    return call


@router.post("/accept/{call_id}")
def accept(call_id: int,
           db: Session = Depends(get_db),
           current_user=Depends(get_current_user)):
    return update_call_status(db, call_id, "accepted", current_user.id)


@router.post("/end/{call_id}")
def end(call_id: int,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user)):
    return update_call_status(db, call_id, "ended", current_user.id)
