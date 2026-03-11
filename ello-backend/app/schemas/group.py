# ==========================================================
# FILE: app/schemas/group.py
# ==========================================================

from pydantic import BaseModel, Field
from typing import List


class GroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    member_ids: List[int] = []
    image_url: str | None = None


class GroupResponse(BaseModel):
    id: int
    name: str
    member_ids: List[int]
    creator_id: int | None = None
    image_url: str | None = None

    class Config:
        orm_mode = True


class GroupMessageCreate(BaseModel):
    content: str | None = None
    audio_url: str | None = None
    media_url: str | None = None
    latitude: float | None = None
    longitude: float | None = None
