#!/usr/bin/env python
"""Test send_audio function directly"""

import sys
import os
sys.path.insert(0, '/app')
os.environ['DATABASE_URL'] = 'postgresql://ello:ello123@db:5432/ello_db'

from fastapi import Depends
from sqlalchemy.orm import Session
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models.user import User
from datetime import datetime, timedelta
import base64

# Setup DB connection
DATABASE_URL = "postgresql://ello:ello123@db:5432/ello_db"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Create a test user and token
db = SessionLocal()

# Create test data
test_audio = b"RIFF" + b"\x00" * 100 + b"WAVE"  # Dummy WAV header
audio_blob = f"data:audio/webm;base64,{base64.b64encode(test_audio).decode()}"

print(f"✅ Audio blob size: {len(audio_blob)} chars")
print(f"✅ Audio blob starts with: {audio_blob[:50]}")

# Test the data structure
test_data = {
    "audio_blob": audio_blob,
    "receiver_id": 2,
    "duration": 5
}

print(f"✅ Test payload: {test_data}")
