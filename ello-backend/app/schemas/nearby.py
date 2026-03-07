from pydantic import BaseModel
from typing import Optional


class NearbyVisibilityUpdate(BaseModel):
    is_visible: bool


class NearbyUserResponse(BaseModel):
    id: int
    username: str
    avatar_url: Optional[str]
    distance_km: float
    is_online: bool
    is_favorite: bool = False

    class Config:
        from_attributes = True