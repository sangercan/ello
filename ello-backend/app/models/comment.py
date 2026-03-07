# ==========================================================
# FILE: app/models/comment.py
# ==========================================================

from sqlalchemy import Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content_type = Column(String, nullable=False)  # moment, vibe, music
    content_id = Column(Integer, nullable=False)
    parent_comment_id = Column(Integer, ForeignKey("comments.id"), nullable=True)

    text = Column(String, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())