# ==========================================================
# FILE: app/schemas/auth.py
# MODULE: AUTH SCHEMAS
# RESPONSIBILITY:
# - User registration request
# - User login request
# - JWT token response
# ==========================================================

from pydantic import BaseModel, EmailStr, model_validator
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