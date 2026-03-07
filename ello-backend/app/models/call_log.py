# ==========================================================
# FILE: app/models/call_log.py
# ==========================================================

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class CallLog(Base):
    __tablename__ = "call_logs"

    id = Column(Integer, primary_key=True, index=True)

    caller_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    call_type = Column(String, nullable=False)  # voice / video
    status = Column(String, default="missed")

    created_at = Column(DateTime(timezone=True), server_default=func.now())