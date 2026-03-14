# ==========================================================
# FILE: app/schemas/auth.py
# MODULE: AUTH SCHEMAS
# RESPONSIBILITY:
# - User registration request
# - User login request
# - JWT token response
# ==========================================================

from pydantic import BaseModel, EmailStr, Field, model_validator
from typing import Optional


class RegisterRequest(BaseModel):
    full_name: str
    username: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    # Accept either `identifier` (username or email) or `email` for compatibility
    identifier: Optional[str] = None
    email: Optional[EmailStr] = None
    password: str

    @model_validator(mode="before")
    def ensure_identifier_or_email(cls, values):
        ident, email = values.get("identifier"), values.get("email")
        if not ident and not email:
            raise ValueError("identifier or email must be provided")
        return values


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ForgotPasswordRequest(BaseModel):
    identifier: str = Field(min_length=3, max_length=320)


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=10, max_length=1024)
    new_password: str = Field(min_length=6, max_length=128)


class MessageResponse(BaseModel):
    message: str
