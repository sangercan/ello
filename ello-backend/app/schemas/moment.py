# ==========================================================
# FILE: app/schemas/moment.py
# MODULE: MOMENT (FEED) SCHEMAS
# RESPONSIBILITY:
# - Create post
# - Feed response with author data
# ==========================================================

from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


# ----------------------------------------------------------
# USER BASIC SCHEMA (for nested responses)
# ----------------------------------------------------------

class UserBasic(BaseModel):
    id: int
    full_name: str
    username: str
    avatar_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ----------------------------------------------------------
# CREATE MOMENT
# ----------------------------------------------------------

class MomentCreate(BaseModel):
    content: str | None = None
    media_url: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    location_label: str | None = None


# ----------------------------------------------------------
# MOMENT RESPONSE (with author)
# ----------------------------------------------------------

class MomentResponse(BaseModel):
    id: int
    content: str | None
    media_url: str | None
    latitude: float | None = None
    longitude: float | None = None
    location_label: str | None = None
    created_at: datetime
    user_id: int
    author: UserBasic  # ✅ ADDED: Complete author data
    likes_count: int | None = 0
    comments_count: int | None = 0

    model_config = ConfigDict(from_attributes=True)
