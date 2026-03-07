# ==========================================================
# FILE: app/models/message_reaction.py
# ==========================================================

from sqlalchemy import Column, Integer, ForeignKey, String
from app.database import Base


class MessageReaction(Base):
    __tablename__ = "message_reactions"

    id = Column(Integer, primary_key=True, index=True)

    message_id = Column(Integer, ForeignKey("messages.id"))
    user_id = Column(Integer, ForeignKey("users.id"))

    reaction = Column(String, nullable=False)