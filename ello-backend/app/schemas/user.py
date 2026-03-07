# ==========================================================
# FILE: app/schemas/user.py
# MODULE: USER SCHEMAS
# ==========================================================

from pydantic import BaseModel, EmailStr, ConfigDict
from datetime import datetime
from typing import Optional


# ----------------------------------------------------------
# CREATE USER
# ----------------------------------------------------------

class UserCreate(BaseModel):
    full_name: str
    username: str
    email: EmailStr
    password: str


# ----------------------------------------------------------
# LOGIN USER
# ----------------------------------------------------------

class UserLogin(BaseModel):
    email: EmailStr
    password: str


# ----------------------------------------------------------
# UPDATE USER
# ----------------------------------------------------------

class UserUpdate(BaseModel):
    full_name: Optional[str] = None
    bio: Optional[str] = None
    avatar_url: Optional[str] = None
    location: Optional[str] = None
    link: Optional[str] = None
    category: Optional[str] = None


# ----------------------------------------------------------
# USER RESPONSE
# ----------------------------------------------------------

class UserResponse(BaseModel):
    id: int
    full_name: str
    username: str
    email: Optional[str] = None

    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None

    # 🔥 NOVOS CAMPOS
    link: Optional[str] = None
    category: Optional[str] = None

    is_online: bool = False
    is_visible_nearby: bool = False
    last_seen_at: Optional[datetime] = None
    last_activity_at: Optional[datetime] = None
    created_at: datetime

    followers_count: Optional[int] = 0
    following_count: Optional[int] = 0
    moments_count: Optional[int] = 0

    is_following: Optional[bool] = False
    is_me: Optional[bool] = False

    model_config = ConfigDict(from_attributes=True)