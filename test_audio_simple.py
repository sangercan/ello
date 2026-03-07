#!/usr/bin/env python3
"""Test audio endpoint with authentication"""

import requests
import json
import base64

# Step 1: Get authentication token
print("1️⃣  Getting authentication token...")
try:
    auth_response = requests.post('http://localhost:8000/auth/dev-login')
    auth_response.raise_for_status()
    auth_data = auth_response.json()
    token = auth_data.get('access_token')
    user_id = auth_data.get('user_id', 1)
    
    if not token:
        print(f"❌ No token in response: {auth_data}")
        exit(1)
    
    print(f"✅ Token obtained for user {user_id}")
except Exception as e:
    print(f"❌ Auth failed: {e}")
    exit(1)

# Step 2: Create test audio
print("\n2️⃣  Creating test audio...")
test_audio = b"RIFF" + b"\x00" * 100 + b"WAVE"  # Minimal WAV-like header
audio_base64 = base64.b64encode(test_audio).decode('utf-8')
print(f"✅ Test audio created: {len(test_audio)} bytes")

# Step 3: Prepare request
print("\n3️⃣  Testing audio endpoint...")
headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json"
}

payload = {
    "audio_blob": f"data:audio/webm;base64,{audio_base64}",
    "receiver_id": 2 if user_id == 1 else 1,  # Send to the other user
    "duration": 5
}

print(f"📞 Endpoint: POST /chat/audio")
print(f"📞 Receiver: {payload['receiver_id']}")
print(f"📞 Audio size: {len(payload['audio_blob'])} chars")

# Step 4: Send request
try:
    response = requests.post(
        'http://localhost:8000/chat/audio',
        json=payload,
        headers=headers
    )
    
    print(f"\n4️⃣  Response:")
    print(f"✅ Status: {response.status_code}")
    print(f"✅ Body: {json.dumps(response.json(), indent=2)}")
    
    if response.status_code == 200:
        print("\n✅ AUDIO TEST PASSED!")
    else:
        print(f"\n❌ Unexpected status code: {response.status_code}")
        
except Exception as e:
    print(f"\n❌ Request failed: {e}")
    exit(1)
