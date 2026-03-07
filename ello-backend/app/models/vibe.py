# ==========================================================
# FILE: app/models/vibe.py
# ==========================================================

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Vibe(Base):
    __tablename__ = "vibes"

    id = Column(Integer, primary_key=True, index=True)
    video_url = Column(String, nullable=False)
    caption = Column(String, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location_label = Column(String, nullable=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    author = relationship("User", back_populates="vibes")