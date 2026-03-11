# ==========================================================
# FILE: app/models/message.py
# ==========================================================

from sqlalchemy import Column, Integer, ForeignKey, String, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from app.database import Base


class Message(Base):
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, index=True)

    conversation_id = Column(Integer, ForeignKey("conversations.id"), nullable=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=True)

    group_id = Column(Integer, ForeignKey("groups.id"), nullable=True)

    content = Column(String, nullable=False)

    is_delivered = Column(Boolean, default=False)
    is_read = Column(Boolean, default=False)
    
    audio_url = Column(String, nullable=True)  # URL para arquivo de áudio
    media_url = Column(String, nullable=True)  # URL para mídia (imagem, vídeo, documento)

    encrypted_key = Column(String, nullable=True)  # base para E2E
    encrypted_payload = Column(String, nullable=True)
    public_key = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relationships
    sender = relationship("User", foreign_keys=[sender_id])
    receiver = relationship("User", foreign_keys=[receiver_id])
    conversation = relationship("Conversation", foreign_keys=[conversation_id])
