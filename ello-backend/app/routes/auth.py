# ==========================================================
# FILE: app/routes/auth.py
# ==========================================================

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES
from app.core.security import create_access_token
from app.database import get_db
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    ResetPasswordRequest,
    TokenResponse,
)
from app.services.auth_service import (
    authenticate_user,
    create_user,
    request_password_reset,
    reset_password_with_token,
)
from app.services.email_service import send_welcome_email_async

router = APIRouter(
    prefix="/auth",
    tags=["Auth"]
)


# ==========================================================
# REGISTER
# ==========================================================

@router.post("/register", response_model=TokenResponse)
def register(data: RegisterRequest, db: Session = Depends(get_db)):
    import logging
    logger = logging.getLogger("auth")

    try:
        logger.info("Registering user: %s", data.email)
        user = create_user(db, data)

        # Fire-and-forget welcome email.
        send_welcome_email_async(
            to_email=user.email,
            full_name=user.full_name,
        )

        access_token = create_access_token(
            data={"user_id": user.id},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )

        return {
            "access_token": access_token,
            "token_type": "bearer"
        }
    except Exception:
        logger.exception("Error on register")
        raise


@router.post("/forgot-password", response_model=MessageResponse)
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    request_password_reset(db, data.identifier)
    return {
        "message": "Se a conta existir, enviaremos um email com instrucoes para redefinir a senha."
    }


@router.post("/reset-password", response_model=MessageResponse)
def reset_password(data: ResetPasswordRequest, db: Session = Depends(get_db)):
    reset_password_with_token(db, token=data.token, new_password=data.new_password)
    return {"message": "Senha redefinida com sucesso."}


# ==========================================================
# LOGIN
# ==========================================================

@router.post("/login", response_model=TokenResponse)
def login(data: LoginRequest, db: Session = Depends(get_db)):
    identifier = data.identifier or data.email

    user = authenticate_user(
        db,
        identifier,
        data.password
    )

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid credentials"
        )

    access_token = create_access_token(
        data={"user_id": user.id},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


# ==========================================================
# DEV LOGIN (Testing only)
# ==========================================================

@router.post("/dev-login", response_model=TokenResponse)
def dev_login(db: Session = Depends(get_db)):
    """Auto-login for development - creates or returns test user."""
    from app.core.security import hash_password
    from app.models.user import User as UserModel

    test_user = db.query(UserModel).filter(UserModel.username == "testuser").first()

    if not test_user:
        test_user = UserModel(
            username="testuser",
            email="test@ellosocial.com",
            full_name="Test User",
            password_hash=hash_password("senha123")
        )
        db.add(test_user)
        db.commit()
        db.refresh(test_user)

    access_token = create_access_token(
        data={"user_id": test_user.id},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }


# ==========================================================
# TEST REGISTER
# ==========================================================

@router.post("/test-register", response_model=TokenResponse)
def test_register(db: Session = Depends(get_db)):
    """Create test user and return token."""
    import uuid
    from app.core.security import hash_password
    from app.models.user import User as UserModel

    unique_id = str(uuid.uuid4())[:8]
    username = f"testuser{unique_id}"

    existing = db.query(UserModel).filter(UserModel.username == username).first()
    if existing:
        return {
            "access_token": create_access_token(
                data={"user_id": existing.id},
                expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
            ),
            "token_type": "bearer"
        }

    test_user = UserModel(
        full_name="Test User",
        username=username,
        email=f"{username}@ellosocial.com",
        password_hash=hash_password("senha123")
    )
    db.add(test_user)
    db.commit()
    db.refresh(test_user)

    access_token = create_access_token(
        data={"user_id": test_user.id},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }
