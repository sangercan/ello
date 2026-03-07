# ==========================================================
# FILE: app/schemas/story.py
# MODULE: STORY SCHEMAS
# RESPONSIBILITY:
# - Create story
# - Story response (24h expiration)
# ==========================================================

from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


class StoryCreate(BaseModel):
    media_url: str
    text: Optional[str] = None


class StoryResponse(BaseModel):
    id: int
    user_id: int
    media_url: str
    text: Optional[str] = None
    created_at: datetime
    expires_at: datetime

    model_config = ConfigDict(from_attributes=True)
