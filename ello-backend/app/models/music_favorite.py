# ==========================================================
# FILE: app/models/music_favorite.py
# MODEL: MUSIC FAVORITES (PLAYLIST)
# ==========================================================

from sqlalchemy import Column, Integer, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class MusicFavorite(Base):
    __tablename__ = "music_favorites"
    
    __table_args__ = (
        UniqueConstraint('user_id', 'music_id', name='unique_user_music_favorite'),
    )

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    music_id = Column(Integer, ForeignKey("music.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
