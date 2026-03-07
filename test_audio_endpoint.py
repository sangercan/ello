#!/usr/bin/env python
"""Test audio endpoint"""

import requests
import base64
import json
from datetime import datetime

# Load a test audio file (create a dummy one if needed)
audio_data = b"dummy audio webm data for testing"
audio_base64 = base64.b64encode(audio_data).decode('utf-8')

# Test payload
payload = {
    "audio_blob": f"data:audio/webm;base64,{audio_base64}",
    "receiver_id": 2,  # Adjust based on your test users
    "duration": 5
}

# Test endpoint
url = "http://localhost:8000/chat/audio"
headers = {
    "Authorization": "Bearer YOUR_TOKEN_HERE",  # You'll need a valid token
    "Content-Type": "application/json"
}

print(f"📞 Testing {url}")
print(f"📞 Payload: {json.dumps(payload, indent=2)}")

try:
    response = requests.post(url, json=payload, headers=headers)
    print(f"\n✅ Status: {response.status_code}")
    print(f"✅ Response: {response.json()}")
except Exception as e:
    print(f"\n❌ Error: {str(e)}")
