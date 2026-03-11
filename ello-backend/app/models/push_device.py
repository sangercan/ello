from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class PushDevice(Base):
    __tablename__ = "push_devices"
    __table_args__ = (
        UniqueConstraint("token", name="uq_push_devices_token"),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    token = Column(String(512), nullable=False, index=True)
    platform = Column(String(32), nullable=True)
    device_id = Column(String(128), nullable=True, index=True)
    app_version = Column(String(32), nullable=True)
    enabled = Column(Boolean, default=True, nullable=False)

    allow_messages = Column(Boolean, default=True, nullable=False)
    allow_likes = Column(Boolean, default=True, nullable=False)
    allow_calls = Column(Boolean, default=True, nullable=False)
    allow_presence = Column(Boolean, default=True, nullable=False)
    allow_general = Column(Boolean, default=True, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    last_seen_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User")
