from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.config import ACCESS_TOKEN_EXPIRE_MINUTES
from app.core.dependencies import get_current_panel_admin
from app.core.security import create_access_token, hash_password
from app.database import get_db
from app.models.message import Message
from app.models.moment import Moment
from app.models.story import Story
from app.models.user import User
from app.models.vibe import Vibe
from app.schemas.admin import (
    AdminLoginRequest,
    AdminMetricsResponse,
    AdminTokenResponse,
    AdminUserCreateRequest,
    AdminUserResponse,
    AdminUserUpdateRequest,
)
from app.services.auth_service import authenticate_user

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.post("/login", response_model=AdminTokenResponse)
def admin_login(data: AdminLoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, data.username, data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not bool(user.is_panel_admin) or not bool(user.is_panel_active):
        raise HTTPException(status_code=403, detail="Admin access required")

    access_token = create_access_token(
        data={"user_id": user.id, "panel_admin": True},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES),
    )

    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user_id": user.id,
        "username": user.username,
    }


@router.get("/me", response_model=AdminUserResponse)
def admin_me(current_admin: User = Depends(get_current_panel_admin)):
    return {
        "id": current_admin.id,
        "full_name": current_admin.full_name,
        "username": current_admin.username,
        "email": current_admin.email,
        "is_panel_admin": bool(current_admin.is_panel_admin),
        "is_panel_active": bool(current_admin.is_panel_active),
        "created_at": current_admin.created_at.isoformat() if current_admin.created_at else "",
    }


@router.get("/users", response_model=list[AdminUserResponse])
def list_panel_users(
    only_panel_users: bool = Query(True),
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_panel_admin),
):
    query = db.query(User)
    if only_panel_users:
        query = query.filter(or_(User.is_panel_admin.is_(True), User.is_panel_active.is_(True)))

    users = query.order_by(User.created_at.desc()).all()
    return [
        {
            "id": u.id,
            "full_name": u.full_name,
            "username": u.username,
            "email": u.email,
            "is_panel_admin": bool(u.is_panel_admin),
            "is_panel_active": bool(u.is_panel_active),
            "created_at": u.created_at.isoformat() if u.created_at else "",
        }
        for u in users
    ]


@router.post("/users", response_model=AdminUserResponse)
def create_panel_user(
    data: AdminUserCreateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_panel_admin),
):
    existing = db.query(User).filter(or_(User.username == data.username, User.email == data.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username or email already exists")

    user = User(
        full_name=data.full_name,
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        is_panel_admin=data.is_panel_admin,
        is_panel_active=data.is_panel_active,
    )

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "full_name": user.full_name,
        "username": user.username,
        "email": user.email,
        "is_panel_admin": bool(user.is_panel_admin),
        "is_panel_active": bool(user.is_panel_active),
        "created_at": user.created_at.isoformat() if user.created_at else "",
    }


@router.put("/users/{user_id}", response_model=AdminUserResponse)
def update_panel_user(
    user_id: int,
    data: AdminUserUpdateRequest,
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_panel_admin),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if data.full_name is not None:
        user.full_name = data.full_name
    if data.email is not None:
        duplicate_email = db.query(User).filter(User.email == data.email, User.id != user_id).first()
        if duplicate_email:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = data.email
    if data.password is not None:
        user.password_hash = hash_password(data.password)
    if data.is_panel_admin is not None:
        user.is_panel_admin = data.is_panel_admin
    if data.is_panel_active is not None:
        user.is_panel_active = data.is_panel_active

    db.commit()
    db.refresh(user)

    return {
        "id": user.id,
        "full_name": user.full_name,
        "username": user.username,
        "email": user.email,
        "is_panel_admin": bool(user.is_panel_admin),
        "is_panel_active": bool(user.is_panel_active),
        "created_at": user.created_at.isoformat() if user.created_at else "",
    }


@router.get("/metrics", response_model=AdminMetricsResponse)
def admin_metrics(
    db: Session = Depends(get_db),
    current_admin: User = Depends(get_current_panel_admin),
):
    now = datetime.now(timezone.utc)
    last_24h = now - timedelta(hours=24)
    last_7d = now - timedelta(days=7)

    total_users = db.query(User).count()
    online_users = db.query(User).filter(User.is_online.is_(True)).count()
    new_users_24h = db.query(User).filter(User.created_at >= last_24h).count()
    new_users_7d = db.query(User).filter(User.created_at >= last_7d).count()

    moments_24h = db.query(Moment).filter(Moment.created_at >= last_24h).count()
    vibes_24h = db.query(Vibe).filter(Vibe.created_at >= last_24h).count()
    stories_24h = db.query(Story).filter(Story.created_at >= last_24h).count()
    content_24h = moments_24h + vibes_24h + stories_24h

    messages_24h = db.query(Message).filter(Message.created_at >= last_24h).count()

    active_user_ids = set(
        row[0]
        for row in db.query(Moment.user_id).filter(Moment.created_at >= last_24h).distinct().all()
    )
    active_user_ids.update(
        row[0]
        for row in db.query(Vibe.user_id).filter(Vibe.created_at >= last_24h).distinct().all()
    )
    active_user_ids.update(
        row[0]
        for row in db.query(Story.user_id).filter(Story.created_at >= last_24h).distinct().all()
    )
    active_user_ids.update(
        row[0]
        for row in db.query(Message.sender_id).filter(Message.created_at >= last_24h).distinct().all()
    )

    total_panel_users = db.query(User).filter(or_(User.is_panel_admin.is_(True), User.is_panel_active.is_(True))).count()

    event_buckets: dict[str, int] = {}

    def _accumulate_hourly(created_at, count):
        if not created_at:
            return
        hour_label = created_at.strftime("%Y-%m-%d %H:00")
        event_buckets[hour_label] = event_buckets.get(hour_label, 0) + int(count)

    models = [
        (User, User.created_at),
        (Moment, Moment.created_at),
        (Vibe, Vibe.created_at),
        (Story, Story.created_at),
        (Message, Message.created_at),
    ]

    dialect = db.bind.dialect.name if db.bind is not None else "postgresql"

    for model, created_col in models:
        if dialect == "sqlite":
            rows = (
                db.query(func.strftime("%Y-%m-%d %H:00", created_col).label("h"), func.count(model.id))
                .filter(created_col >= last_24h)
                .group_by("h")
                .order_by("h")
                .all()
            )
            for hour_start, count in rows:
                event_buckets[str(hour_start)] = event_buckets.get(str(hour_start), 0) + int(count)
        else:
            rows = (
                db.query(func.date_trunc("hour", created_col).label("h"), func.count(model.id))
                .filter(created_col >= last_24h)
                .group_by("h")
                .order_by("h")
                .all()
            )
            for hour_start, count in rows:
                _accumulate_hourly(hour_start, count)

    traffic_24h = [
        {"hour": k, "events": event_buckets[k]}
        for k in sorted(event_buckets.keys())
    ]

    sorted_tension = sorted(traffic_24h, key=lambda p: p["events"], reverse=True)
    peak_hour = sorted_tension[0] if sorted_tension else None
    tension_points = sorted_tension[:3]

    return {
        "summary": {
            "total_users": total_users,
            "online_users": online_users,
            "new_users_24h": new_users_24h,
            "new_users_7d": new_users_7d,
            "content_24h": content_24h,
            "messages_24h": messages_24h,
            "active_users_24h": len(active_user_ids),
            "total_panel_users": total_panel_users,
        },
        "traffic_24h": traffic_24h,
        "peak_hour": peak_hour,
        "tension_points": tension_points,
    }
