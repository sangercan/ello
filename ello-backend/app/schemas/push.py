from pydantic import BaseModel, ConfigDict, Field, model_validator


class PushDeviceUpsertRequest(BaseModel):
    token: str | None = Field(default=None, max_length=512)
    platform: str | None = Field(default=None, max_length=32)
    device_id: str | None = Field(default=None, max_length=128)
    app_version: str | None = Field(default=None, max_length=32)
    subscription_endpoint: str | None = Field(default=None, max_length=1024)
    subscription_p256dh: str | None = Field(default=None, max_length=512)
    subscription_auth: str | None = Field(default=None, max_length=256)
    allow_messages: bool = True
    allow_likes: bool = True
    allow_calls: bool = True
    allow_presence: bool = True
    allow_general: bool = True

    @model_validator(mode="after")
    def validate_target(self):
        token = (self.token or "").strip()
        endpoint = (self.subscription_endpoint or "").strip()
        p256dh = (self.subscription_p256dh or "").strip()
        auth = (self.subscription_auth or "").strip()

        if not token and not endpoint:
            raise ValueError("token or subscription_endpoint is required")

        if endpoint and (not p256dh or not auth):
            raise ValueError("subscription_p256dh and subscription_auth are required for web push")

        return self


class PushDeviceDeleteRequest(BaseModel):
    token: str | None = Field(default=None, max_length=512)
    device_id: str | None = Field(default=None, max_length=128)
    subscription_endpoint: str | None = Field(default=None, max_length=1024)


class PushPreferencesUpdateRequest(BaseModel):
    token: str | None = Field(default=None, max_length=512)
    device_id: str | None = Field(default=None, max_length=128)
    subscription_endpoint: str | None = Field(default=None, max_length=1024)
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
