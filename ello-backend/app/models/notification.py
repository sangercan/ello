# ==========================================================
# FILE: app/models/notification.py
# MODULE: NOTIFICATION MODEL
# RESPONSIBILITY:
# - Store user interaction notifications
# ==========================================================

from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)

    # Usuário que recebe a notificação
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Usuário que gerou a ação
    actor_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Tipo da notificação (like, comment, follow, message, etc.)
    type = Column(String, nullable=False)

    # ID do objeto relacionado (moment_id, story_id, etc.)
    reference_id = Column(Integer, nullable=True)

    # Texto opcional
    message = Column(String, nullable=True)

    # Status
    is_read = Column(Boolean, default=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    user = relationship("User", foreign_keys=[user_id])
    actor = relationship("User", foreign_keys=[actor_id])