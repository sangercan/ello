# ==========================================================
# FILE: app/models/music.py
# ==========================================================

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class Music(Base):
    __tablename__ = "music"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    artist = Column(String, nullable=False)
    audio_url = Column(String, nullable=False)
    album_cover = Column(String, nullable=True)  # ✅ NEW

    uploaded_by = Column(Integer, ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # ✅ Relationships
    uploader = relationship("User", foreign_keys=[uploaded_by])
