# ==========================================================
# FILE: app/models/group_member.py
# ==========================================================

from sqlalchemy import Column, Integer, ForeignKey
from app.database import Base


class GroupMember(Base):
    __tablename__ = "group_members"

    id = Column(Integer, primary_key=True, index=True)
    group_id = Column(Integer, ForeignKey("groups.id"))
    user_id = Column(Integer, ForeignKey("users.id"))