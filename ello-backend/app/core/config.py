# ==========================================================
# FILE: app/core/config.py
# MODULE: APPLICATION CONFIGURATION
# RESPONSIBILITY:
# - Load environment variables
# - Global settings
# - CORS configuration
# ==========================================================

import os
from dotenv import load_dotenv

load_dotenv()

# ----------------------------------------------------------
# DATABASE
# ----------------------------------------------------------

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://ello:ello123@db:5432/ello_db"
)

# ----------------------------------------------------------
# JWT SETTINGS
# ----------------------------------------------------------

SECRET_KEY = os.getenv("SECRET_KEY", "super_secret_ello_key_change_in_production")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(
    os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", 60)
)

# ----------------------------------------------------------
# ENVIRONMENT
# ----------------------------------------------------------

ENVIRONMENT = os.getenv("ENVIRONMENT", "development")
DEBUG = ENVIRONMENT == "development"

# ----------------------------------------------------------
# CORS CONFIGURATION
# ----------------------------------------------------------

if DEBUG:
    # Development: Allow all origins
    ALLOWED_ORIGINS = [
        "http://localhost:3000",
        "http://localhost:8000",
        "http://localhost:8080",
        "http://localhost:5173",
        "http://10.0.2.2:8000",      # Android emulator
        "http://10.0.2.2:3000",
        "http://10.0.2.2:5173",
        "http://127.0.0.1:8000",
        "http://127.0.0.1:3000",
        "http://192.168.1.0/24",     # Local network
        "*",                          # Dev only
    ]
else:
    # Production: Specify exact domains
    ALLOWED_ORIGINS = [
        "https://ellosocial.com",
        "https://www.ellosocial.com",
        "https://129.121.36.183",
        "https://ello.com",
        "https://www.ello.com",
        "https://app.ello.com",
        "https://mobile.ello.com",
    ]

# Allowed HTTP methods for CORS
ALLOWED_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"]

# Allowed headers for CORS
ALLOWED_HEADERS = [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Origin",
    "Accept",
    "X-Access-Token",
]
