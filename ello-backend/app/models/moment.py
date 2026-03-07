# ==========================================================
# FILE: app/models/moment.py
# ==========================================================

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Float
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Moment(Base):
    __tablename__ = "moments"

    id = Column(Integer, primary_key=True, index=True)
    content = Column(String, nullable=True)
    media_url = Column(String, nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location_label = Column(String, nullable=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    author = relationship("User", back_populates="moments")