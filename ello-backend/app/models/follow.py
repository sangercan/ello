# ==========================================================
# FILE: app/models/follow.py
# ==========================================================

from sqlalchemy import Column, Integer, ForeignKey, UniqueConstraint
from app.database import Base


class Follow(Base):
    __tablename__ = "follows"

    id = Column(Integer, primary_key=True, index=True)

    follower_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    following_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    __table_args__ = (
        UniqueConstraint("follower_id", "following_id", name="unique_follow"),
    )