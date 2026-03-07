# ==========================================================
# CALL ROUTES
# ==========================================================

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.schemas.call import CallStart
from app.services.call_service import initiate_call, update_call_status
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/calls", tags=["Calls"])


@router.post("/start")
def start(data: CallStart,
          db: Session = Depends(get_db),
          current_user=Depends(get_current_user)):
    return initiate_call(
        db,
        current_user,
        data.receiver_id,
        data.call_type
    )


@router.post("/end/{call_id}")
def end(call_id: int,
        db: Session = Depends(get_db),
        current_user=Depends(get_current_user)):
    return end_call(db, current_user, call_id)