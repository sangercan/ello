# ==========================================================
# FILE: app/schemas/notification.py
# MODULE: NOTIFICATION SCHEMAS
# RESPONSIBILITY:
# - Notification response
# ==========================================================

from pydantic import BaseModel, ConfigDict
from datetime import datetime


class NotificationResponse(BaseModel):
    id: int
    user_id: int
    type: str
    reference_id: int | None
    is_read: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
