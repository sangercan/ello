# ==========================================================
# FILE: app/models/like.py
# ==========================================================

from sqlalchemy import Column, Integer, String, ForeignKey, UniqueConstraint
from app.database import Base


class Like(Base):
    __tablename__ = "likes"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content_type = Column(String, nullable=False)
    content_id = Column(Integer, nullable=False)

    __table_args__ = (
        UniqueConstraint("user_id", "content_type", "content_id", name="unique_like"),
    )