# ==========================================================
# FILE: app/models/user.py
# ==========================================================

from sqlalchemy import Column, Integer, String, DateTime, Float, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    # ========================
    # Identificação
    # ========================

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    password_hash = Column(String, nullable=False)

    # ========================
    # Perfil
    # ========================

    avatar_url = Column(String, nullable=True)
    bio = Column(String, nullable=True)
    location = Column(String, nullable=True)
    mood = Column(String(32), nullable=True)

    # 🔥 NOVOS CAMPOS
    link = Column(String, nullable=True)
    category = Column(String, nullable=True)

    # ========================
    # Localização
    # ========================

    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    # ========================
    # Presença
    # ========================

    is_online = Column(Boolean, default=False)
    is_visible_nearby = Column(Boolean, default=False)
    is_panel_admin = Column(Boolean, default=False)
    is_panel_active = Column(Boolean, default=False)
    is_deleted = Column(Boolean, default=False, nullable=False)
    last_seen_at = Column(DateTime(timezone=True), nullable=True)
    last_activity_at = Column(DateTime(timezone=True), nullable=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)

    # ========================
    # Datas
    # ========================

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # ========================
    # Relationships
    # ========================

    moments = relationship("Moment", back_populates="author", cascade="all, delete")
    stories = relationship("Story", back_populates="author", cascade="all, delete")
    vibes = relationship("Vibe", back_populates="author", cascade="all, delete")

    messages_sent = relationship("Message", foreign_keys="Message.sender_id")
    messages_received = relationship("Message", foreign_keys="Message.receiver_id")
