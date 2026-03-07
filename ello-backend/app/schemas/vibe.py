# ==========================================================
# FILE: app/schemas/vibe.py
# MODULE: VIBE (REELS) SCHEMAS
# RESPONSIBILITY:
# - Create vibe
# - Vibe response
# ==========================================================

from pydantic import BaseModel, ConfigDict, field_validator
from datetime import datetime


VIDEO_EXTENSIONS = (
    ".mp4",
    ".webm",
    ".mov",
    ".m4v",
    ".avi",
    ".mkv",
    ".3gp",
    ".m3u8",
)


class VibeCreate(BaseModel):
    video_url: str
    caption: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    location_label: str | None = None

    @field_validator("video_url")
    @classmethod
    def validate_video_url(cls, value: str) -> str:
        url = value.strip()
        if not url:
            raise ValueError("video_url is required")

        normalized = url.lower().split("?", 1)[0].split("#", 1)[0]
        if not normalized.endswith(VIDEO_EXTENSIONS):
            raise ValueError("Vibes accept only video URLs")

        return url


class VibeResponse(BaseModel):
    id: int
    video_url: str
    caption: str | None
    latitude: float | None = None
    longitude: float | None = None
    location_label: str | None = None
    user_id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
