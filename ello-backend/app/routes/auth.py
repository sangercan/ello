# ==========================================================
# FILE: app/routes/auth.py
# ==========================================================

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import timedelta

from app.database import get_db
from app.schemas.auth import RegisterRequest, LoginRequest, TokenResponse
from app.services.auth_service import (
    create_user,
    authenticate_user
)
from app.core.security import create_access_token
from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES

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
        logger.info(f"📝 Registrando usuário: {data.email}")
        
        user = create_user(db, data)
        
        logger.info(f"✅ Usuário criado: {user.id}")

        access_token = create_access_token(
            data={"user_id": user.id},
            expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
        )

        logger.info(f"🔐 Token gerado para user {user.id}")
        
        return {
            "access_token": access_token,
            "token_type": "bearer"
        }
    except Exception as e:
        logger.error(f"❌ Erro no registro: {str(e)}")
        raise


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
    """Auto-login for development - creates or returns test user"""
    from app.models.user import User as UserModel
    from app.core.security import hash_password
    
    # Try to find test user
    test_user = db.query(UserModel).filter(UserModel.username == "testuser").first()
    
    if not test_user:
        # Create test user with proper password hash
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
    """Create test user and return token"""
    from app.models.user import User as UserModel
    from app.core.security import hash_password
    import uuid
    
    # Generate unique test user
    unique_id = str(uuid.uuid4())[:8]
    
    # Delete existing test user if needed
    existing = db.query(UserModel).filter(UserModel.username == f"testuser{unique_id}").first()
    if existing:
        return {
            "access_token": create_access_token(
                data={"user_id": existing.id},
                expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
            ),
            "token_type": "bearer"
        }
    
    # Create new test user
    test_user = UserModel(
        full_name="Test User",
        username=f"testuser{unique_id}",
        email=f"testuser{unique_id}@ellosocial.com",
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
