# ==========================================================
# FILE: app/routes/group_calls.py
# Basic placeholder for group calls: not fully implemented
# ==========================================================

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.dependencies import get_current_user
from app.services.group_service import get_group

router = APIRouter(prefix="/calls/group", tags=["Group Calls"])


@router.post("/start")
def start_group_call(group_id: int, call_type: str, db: Session = Depends(get_db), current_user=Depends(get_current_user)):
    # For now, reuse the existing signaling channel; we just notify members via websocket.
    group = get_group(db, group_id, current_user.id)
    # TODO: implementar sinalização multiponto
    raise HTTPException(status_code=501, detail="Group call signaling not implemented")
