# ==========================================================
# FILE: app/services/auth_service.py
# MODULE: AUTH SERVICE
# RESPONSIBILITY:
# - Create user
# - Authenticate user
# - Password reset flow
# ==========================================================

from datetime import datetime, timedelta, timezone
import hashlib
import logging
import secrets

from fastapi import HTTPException
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.config import PASSWORD_RESET_EXPIRE_MINUTES
from app.core.security import hash_password, verify_password
from app.models.user import User
from app.services.email_service import send_password_reset_email_async

logger = logging.getLogger("app.auth")


def _hash_reset_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


# ==========================================================
# CREATE USER
# ==========================================================

def create_user(db: Session, data):
    existing = db.query(User).filter(
        or_(User.email == data.email, User.username == data.username)
    ).first()

    if existing:
        raise HTTPException(
            status_code=400,
            detail="User already exists"
        )

    user = User(
        full_name=data.full_name,
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password)
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


# ==========================================================
# AUTHENTICATE USER
# ==========================================================

def authenticate_user(db: Session, identifier: str, password: str):
    ident = identifier.strip() if isinstance(identifier, str) else identifier
    user = db.query(User).filter(
        or_(User.email == ident, User.username == ident)
    ).first()

    if not user:
        logger.debug("authenticate_user: user not found for identifier=%s", ident)
        return None

    if bool(getattr(user, "is_deleted", False)):
        logger.debug("authenticate_user: blocked deleted user id=%s", user.id)
        return None

    if not verify_password(password, user.password_hash):
        logger.debug("authenticate_user: invalid password for user id=%s", user.id)
        return None

    return user


# ==========================================================
# FORGOT / RESET PASSWORD
# ==========================================================

def request_password_reset(db: Session, identifier: str) -> None:
    ident = (identifier or "").strip()
    if not ident:
        return

    normalized_ident = ident.lower()
    user = db.query(User).filter(
        User.is_deleted.is_(False),
        or_(
            func.lower(User.email) == normalized_ident,
            func.lower(User.username) == normalized_ident,
        ),
    ).first()

    # Always return success to caller, even when user is absent.
    if not user:
        return

    raw_token = secrets.token_urlsafe(48)
    user.password_reset_token_hash = _hash_reset_token(raw_token)
    user.password_reset_expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=PASSWORD_RESET_EXPIRE_MINUTES
    )
    db.commit()

    send_password_reset_email_async(
        to_email=user.email,
        full_name=user.full_name,
        reset_token=raw_token,
    )


def reset_password_with_token(db: Session, token: str, new_password: str) -> None:
    raw_token = (token or "").strip()
    if not raw_token:
        raise HTTPException(status_code=400, detail="Token invalido ou expirado")

    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="A senha deve ter pelo menos 6 caracteres")

    token_hash = _hash_reset_token(raw_token)
    user = db.query(User).filter(
        User.password_reset_token_hash == token_hash,
        User.is_deleted.is_(False),
    ).first()

    if not user or not user.password_reset_expires_at:
        raise HTTPException(status_code=400, detail="Token invalido ou expirado")

    now = datetime.now(timezone.utc)
    expires_at = user.password_reset_expires_at
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if expires_at < now:
        user.password_reset_token_hash = None
        user.password_reset_expires_at = None
        db.commit()
        raise HTTPException(status_code=400, detail="Token invalido ou expirado")

    user.password_hash = hash_password(new_password)
    user.password_reset_token_hash = None
    user.password_reset_expires_at = None
    db.commit()
