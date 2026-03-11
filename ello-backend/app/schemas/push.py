from pydantic import BaseModel, ConfigDict, Field


class PushDeviceUpsertRequest(BaseModel):
    token: str = Field(min_length=10, max_length=512)
    platform: str | None = Field(default=None, max_length=32)
    device_id: str | None = Field(default=None, max_length=128)
    app_version: str | None = Field(default=None, max_length=32)
    allow_messages: bool = True
    allow_likes: bool = True
    allow_calls: bool = True
    allow_presence: bool = True
    allow_general: bool = True


class PushDeviceDeleteRequest(BaseModel):
    token: str | None = Field(default=None, max_length=512)
    device_id: str | None = Field(default=None, max_length=128)


class PushPreferencesUpdateRequest(BaseModel):
    token: str | None = Field(default=None, max_length=512)
    device_id: str | None = Field(default=None, max_length=128)
    allow_messages: bool | None = None
    allow_likes: bool | None = None
    allow_calls: bool | None = None
    allow_presence: bool | None = None
    allow_general: bool | None = None


class PushDeviceResponse(BaseModel):
    id: int
    user_id: int
    platform: str | None
    device_id: str | None
    app_version: str | None
    enabled: bool
    allow_messages: bool
    allow_likes: bool
    allow_calls: bool
    allow_presence: bool
    allow_general: bool

    model_config = ConfigDict(from_attributes=True)
