# ==========================================================
# FILE: app/schemas/like.py
# MODULE: LIKE SCHEMAS
# RESPONSIBILITY:
# - Toggle like request
# - Like response
# ==========================================================

from pydantic import BaseModel


class LikeToggleRequest(BaseModel):
    content_type: str
    content_id: int


class LikeResponse(BaseModel):
    liked: bool