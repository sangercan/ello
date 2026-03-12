# ==========================================================
# NOTIFICATIONS ROUTES
# ==========================================================

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.services.notification_service import (
    get_notifications,
    mark_notification_as_read,
    mark_all_notifications_as_read,
    clear_all_notifications,
)
from app.core.dependencies import get_current_user

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("/")
def list_notifications(db: Session = Depends(get_db),
                       current_user=Depends(get_current_user),
                       page: int = Query(1, ge=1),
                       limit: int = Query(50, ge=1, le=100)):
    return get_notifications(db, current_user, page=page, limit=limit)


@router.put("/{notification_id}/read")
def read_notification(notification_id: int,
                      db: Session = Depends(get_db),
                      current_user=Depends(get_current_user)):
    row = mark_notification_as_read(db, current_user.id, notification_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    return row


@router.put("/read-all")
def read_all_notifications(db: Session = Depends(get_db),
                           current_user=Depends(get_current_user)):
    return mark_all_notifications_as_read(db, current_user.id)


@router.delete("/clear")
def clear_notifications(db: Session = Depends(get_db),
                        current_user=Depends(get_current_user)):
    return clear_all_notifications(db, current_user.id)
