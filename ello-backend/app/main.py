# ==========================================================
# FILE: app/main.py
# ==========================================================

from fastapi import FastAPI
from sqlalchemy import text
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
import os
from app.core.middleware import AddDefaultOriginMiddleware
from app.core.config import ALLOWED_ORIGINS, ALLOWED_METHODS, ALLOWED_HEADERS, DEBUG

from app.database import Base, engine

# Import models so SQLAlchemy knows about all table mappings before
# calling create_all(). If models are not imported, metadata will be
# empty and tables won't be created, causing "relation ... does not exist".
import app.models  # noqa: F401

import logging

logger = logging.getLogger("app.main")

# ----------------------------------------------------------
# CREATE TABLES
# ----------------------------------------------------------

Base.metadata.create_all(bind=engine)


def _ensure_geotag_columns_exist():
    """Add geolocation columns for existing tables in dev environments without migrations."""
    with engine.begin() as conn:
        dialect = engine.dialect.name

        if dialect == "postgresql":
            conn.execute(text("ALTER TABLE moments ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION"))
            conn.execute(text("ALTER TABLE moments ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION"))
            conn.execute(text("ALTER TABLE moments ADD COLUMN IF NOT EXISTS location_label VARCHAR"))

            conn.execute(text("ALTER TABLE vibes ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION"))
            conn.execute(text("ALTER TABLE vibes ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION"))
            conn.execute(text("ALTER TABLE vibes ADD COLUMN IF NOT EXISTS location_label VARCHAR"))
            conn.execute(text("ALTER TABLE stories ADD COLUMN IF NOT EXISTS text VARCHAR"))
            conn.execute(text("ALTER TABLE comments ADD COLUMN IF NOT EXISTS parent_comment_id INTEGER"))
            return

        if dialect == "sqlite":
            for table in ("moments", "vibes"):
                cols = {
                    row[1]
                    for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
                }
                if "latitude" not in cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN latitude REAL"))
                if "longitude" not in cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN longitude REAL"))
                if "location_label" not in cols:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN location_label TEXT"))

            story_cols = {
                row[1]
                for row in conn.execute(text("PRAGMA table_info(stories)")).fetchall()
            }
            if "text" not in story_cols:
                conn.execute(text("ALTER TABLE stories ADD COLUMN text TEXT"))

            comment_cols = {
                row[1]
                for row in conn.execute(text("PRAGMA table_info(comments)")).fetchall()
            }
            if "parent_comment_id" not in comment_cols:
                conn.execute(text("ALTER TABLE comments ADD COLUMN parent_comment_id INTEGER"))


_ensure_geotag_columns_exist()

# ----------------------------------------------------------
# CREATE APP
# ----------------------------------------------------------

app = FastAPI(
    title="Ello Social API",
    version="1.0.0",
    docs_url="/docs" if DEBUG else None,  # Hide docs in production
    redoc_url="/redoc" if DEBUG else None,
)

logger.info(f"🚀 Starting Ello Social API (Environment: {DEBUG and 'DEVELOPMENT' or 'PRODUCTION'})")
logger.info(f"📡 CORS Origins: {ALLOWED_ORIGINS[:3]}{'...' if len(ALLOWED_ORIGINS) > 3 else ''}")

# ----------------------------------------------------------
# MIDDLEWARE: Default Origin (WebSocket support)
# ----------------------------------------------------------

app.add_middleware(AddDefaultOriginMiddleware)

# ----------------------------------------------------------
# MIDDLEWARE: CORS (Dynamic based on environment)
# ----------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,  # Set to True if using cookies/auth with specific origins
    allow_methods=ALLOWED_METHODS,
    allow_headers=ALLOWED_HEADERS,
    max_age=3600,  # Cache CORS preflight for 1 hour
)

# ----------------------------------------------------------
# IMPORT ROUTERS DIRECTLY (NO __init__)
# ----------------------------------------------------------

from app.routes.auth import router as auth_router
from app.routes.users import router as users_router
from app.routes.moments import router as moments_router
from app.routes.social import router as social_router
from app.routes.stories import router as stories_router
from app.routes.vibes import router as vibes_router
from app.routes.music import router as music_router
from app.routes.chat import router as chat_router
from app.routes.notifications import router as notifications_router
from app.routes.nearby import router as nearby_router
from app.routes.calls import router as calls_router
from app.routes.ws import router as ws_router
from app.routes.upload import router as upload_router
from app.routes import online

# ----------------------------------------------------------
# STATIC FILES / UPLOADS
# ----------------------------------------------------------

# Serve uploaded files (audio, media, etc.)
uploads_dir = "/app/uploads"
os.makedirs(uploads_dir, exist_ok=True)

# Create subdirectories if they don't exist
os.makedirs(os.path.join(uploads_dir, "audio"), exist_ok=True)
os.makedirs(os.path.join(uploads_dir, "media"), exist_ok=True)
os.makedirs(os.path.join(uploads_dir, "documents"), exist_ok=True)

# Mount static files at /uploads/
if os.path.exists(uploads_dir):
    app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
    logger.info(f"✅ Mounted static files at /uploads from {uploads_dir}")

# ----------------------------------------------------------
# INCLUDE ROUTERS
# ----------------------------------------------------------

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(moments_router)
app.include_router(social_router)
app.include_router(stories_router)
app.include_router(vibes_router)
app.include_router(music_router)
app.include_router(chat_router)
app.include_router(notifications_router)
app.include_router(nearby_router)
app.include_router(calls_router)
app.include_router(ws_router)
app.include_router(upload_router)
app.include_router(online.router)

# ----------------------------------------------------------
# ROOT / HEALTH CHECK
# ----------------------------------------------------------

@app.get("/")
def root():
    return {
        "message": "Ello Social Backend Running",
        "version": "1.0.0",
        "environment": "development" if DEBUG else "production",
    }


@app.get("/health")
def health_check():
    """Health check endpoint for load balancers"""
    return {
        "status": "healthy",
        "service": "ello-social-api",
    }
