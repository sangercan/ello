# ==========================================================
# FILE: app/schemas/music.py
# MODULE: MUSIC SCHEMAS
# RESPONSIBILITY:
# - Upload music
# - Music feed response
# - Favorite music
# ==========================================================

from pydantic import BaseModel, ConfigDict
from datetime import datetime
from typing import Optional


class MusicCreate(BaseModel):
    title: str
    artist: str
    audio_url: str
    album_cover: Optional[str] = None


class MusicResponse(BaseModel):
    id: int
    title: str
    artist: str
    audio_url: str
    album_cover: Optional[str] = None
    uploaded_by: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MusicFavoriteAdd(BaseModel):
    music_id: int


class MusicFavoriteResponse(BaseModel):
    id: int
    music_id: int
    user_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
