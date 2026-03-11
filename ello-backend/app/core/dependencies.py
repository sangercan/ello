# ==========================================================
# FILE: app/core/dependencies.py
# MODULE: FASTAPI DEPENDENCIES
# RESPONSIBILITY:
# - Get current user
# - Token validation
# ==========================================================

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from typing import Optional

from app.database import get_db
from app.core.security import decode_token
from app.models.user import User
import logging

logger = logging.getLogger("app.dependencies")

# Allow retrieving token without automatically raising a 401 — callers will
# decide whether a missing/invalid token is an error (required) or should
# simply return no user (optional).
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


# ----------------------------------------------------------
# GET CURRENT USER
# ----------------------------------------------------------

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated"
        )

    # Normalize token and decode
    token = token.strip() if isinstance(token, str) else token
    try:
        payload = decode_token(token)
    except Exception as exc:
        logger.debug("decode_token raised: %s", exc)
        payload = None

    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials"
        )

    # Support tokens that set either 'user_id' or the standard 'sub'
    user_id = None
    if payload is not None:
        user_id = payload.get("user_id") or payload.get("sub")

    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )

    user = db.query(User).filter(User.id == user_id).first()

    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    return user

def get_optional_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    """Return the current user or None when no valid token is provided."""
    if token is None:
        return None
    token = token.strip() if isinstance(token, str) else token
    try:
        payload = decode_token(token)
    except Exception as exc:
        logger.debug("decode_token raised: %s", exc)
        return None

    if payload is None:
        return None

    user_id = payload.get("user_id") or payload.get("sub")
    if user_id is None:
        return None

    # sub may be a string — try to convert to int when possible
    try:
        user_id = int(user_id)
    except Exception:
        pass

    return db.query(User).filter(User.id == user_id).first()


def get_current_panel_admin(
    current_user: User = Depends(get_current_user),
):
    """Require an authenticated and active panel admin user."""
    if not bool(current_user.is_panel_admin) or not bool(current_user.is_panel_active):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user
