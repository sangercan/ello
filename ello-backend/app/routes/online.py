from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.core.dependencies import get_current_user
from app.core.websocket_manager import manager
from app.models.user import User
from app.models.user_block import UserBlock

router = APIRouter(prefix="/online", tags=["Presence"])

@router.get("/")
def get_online_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    blocked_ids = {
        row.blocked_id
        for row in db.query(UserBlock).filter(UserBlock.blocker_id == current_user.id).all()
    }
    blocked_by_ids = {
        row.blocker_id
        for row in db.query(UserBlock).filter(UserBlock.blocked_id == current_user.id).all()
    }
    hidden_ids = blocked_ids.union(blocked_by_ids)

    return {
        "online_users": [user_id for user_id in manager.get_online_users() if user_id not in hidden_ids]
    }