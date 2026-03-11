from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str


class AdminUserCreateRequest(BaseModel):
    full_name: str
    username: str
    email: EmailStr
    password: str = Field(min_length=8)
    is_panel_admin: bool = True
    is_panel_active: bool = True


class AdminUserUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(default=None, min_length=8)
    is_panel_admin: Optional[bool] = None
    is_panel_active: Optional[bool] = None


class AdminUserResponse(BaseModel):
    id: int
    full_name: str
    username: str
    email: str
    is_panel_admin: bool
    is_panel_active: bool
    created_at: str


class AdminMetricSummary(BaseModel):
    total_users: int
    online_users: int
    new_users_24h: int
    new_users_7d: int
    content_24h: int
    messages_24h: int
    active_users_24h: int
    total_panel_users: int


class AdminHourlyPoint(BaseModel):
    hour: str
    events: int


class AdminTensionPoint(BaseModel):
    hour: str
    events: int


class AdminMetricsResponse(BaseModel):
    summary: AdminMetricSummary
    traffic_24h: List[AdminHourlyPoint]
    peak_hour: Optional[AdminTensionPoint] = None
    tension_points: List[AdminTensionPoint]
