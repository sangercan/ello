# ==========================================================
# FILE: app/services/auth_service.py
# MODULE: AUTH SERVICE
# RESPONSIBILITY:
# - Create user
# - Authenticate user
# ==========================================================

from sqlalchemy.orm import Session
from sqlalchemy import or_
from fastapi import HTTPException
import logging

from app.models.user import User
from app.core.security import hash_password, verify_password

logger = logging.getLogger("app.auth")


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

    if not verify_password(password, user.password_hash):
        logger.debug("authenticate_user: invalid password for user id=%s", user.id)
        return None

    if not user:
        return None

    if not verify_password(password, user.password_hash):
        return None

    return user