# ==========================================================
# FILE: app/schemas/interaction.py
# MODULE: INTERACTION SCHEMAS (Like, Comment)
# RESPONSIBILITY:
# - Like response
# - Comment response
# - Moment detail with interactions
# ==========================================================

from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional, List


# ----------------------------------------------------------
# USER BASIC
# ----------------------------------------------------------

class UserBasic(BaseModel):
    id: int
    full_name: str
    username: str
    avatar_url: Optional[str] = None
    mood: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ----------------------------------------------------------
# LIKE RESPONSE
# ----------------------------------------------------------

class LikeResponse(BaseModel):
    id: int
    user_id: int
    content_id: int
    content_type: str
    user: Optional[UserBasic] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ----------------------------------------------------------
# COMMENT RESPONSE
# ----------------------------------------------------------

class CommentResponse(BaseModel):
    id: int
    user_id: int
    content_id: int
    content_type: str
    content: str
    user: Optional[UserBasic] = None
    likes_count: int = 0
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ----------------------------------------------------------
# MOMENT DETAIL (with interactions)
# ----------------------------------------------------------

class MomentDetail(BaseModel):
    id: int
    content: Optional[str] = None
    media_url: Optional[str] = None
    created_at: datetime
    user_id: int
    author: Optional[UserBasic] = None
    
    # Interaction counts
    likes_count: int = 0
    comments_count: int = 0
    shares_count: int = 0
    
    # User interaction status
    is_liked: bool = False
    is_saved: bool = False
    
    # Recent interactions
    recent_likes: List[UserBasic] = []
    recent_comments: List[CommentResponse] = []

    model_config = ConfigDict(from_attributes=True)


# ----------------------------------------------------------
# INTERACTION CREATE
# ----------------------------------------------------------

class CommentCreate(BaseModel):
    content: str


class LikeCreate(BaseModel):
    content_type: str = "moment"  # moment, comment, vibe, etc
