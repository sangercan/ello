# ==========================================================
# FILE: app/schemas/comment.py
# MODULE: COMMENT SCHEMAS
# RESPONSIBILITY:
# - Add comment
# - Comment response
# ==========================================================

from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


class CommentCreate(BaseModel):
    text: str
    parent_comment_id: Optional[int] = None


class CommentResponse(BaseModel):
    id: int
    user_id: int
    content_type: str
    content_id: int
    parent_comment_id: Optional[int] = None
    text: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
