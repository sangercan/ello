import os
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.user import User


def ensure_default_panel_admin(db: Session):
    """Ensure there is always one bootstrap admin for the panel."""
    username = os.getenv("ADMIN_PANEL_USERNAME", "santiagocandido").strip()
    password = os.getenv("ADMIN_PANEL_PASSWORD", "Sangercan35*").strip()
    full_name = os.getenv("ADMIN_PANEL_FULL_NAME", "Santiago Candido").strip()
    email = os.getenv("ADMIN_PANEL_EMAIL", "santiagocandido@ellosocial.com").strip()

    if not username or not password:
        return

    existing = db.query(User).filter(User.username == username).first()
    if existing:
        existing.is_panel_admin = True
        existing.is_panel_active = True
        # Keep bootstrap credentials valid for emergency admin access.
        existing.password_hash = hash_password(password)
        if not existing.email:
            existing.email = email
        if not existing.full_name:
            existing.full_name = full_name
        db.commit()
        return

    user = User(
        full_name=full_name,
        username=username,
        email=email,
        password_hash=hash_password(password),
        is_panel_admin=True,
        is_panel_active=True,
    )
    db.add(user)
    db.commit()
