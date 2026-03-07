# ==========================================================
# FILE: app/core/security.py
# MODULE: SECURITY
# RESPONSIBILITY:
# - Hash password
# - Verify password
# - Create JWT
# ==========================================================

import bcrypt
import hashlib
from datetime import datetime, timedelta
from jose import JWTError, jwt
from app.core.config import SECRET_KEY, ALGORITHM


# ==========================================================
# SHA256 + BCRYPT HASH
# ==========================================================

def _sha256(password: str) -> bytes:
    return hashlib.sha256(password.encode("utf-8")).digest()


def hash_password(password: str) -> str:
    sha_password = _sha256(password)
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(sha_password, salt)
    return hashed.decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    sha_password = _sha256(password)
    return bcrypt.checkpw(
        sha_password,
        hashed_password.encode("utf-8")
    )


# ==========================================================
# JWT TOKEN
# ==========================================================

def create_access_token(data: dict, expires_delta: timedelta | None = None):
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=60)

    to_encode.update({"exp": expire})

    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str):
    """Decode a JWT and return its payload or None on error."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        return None
