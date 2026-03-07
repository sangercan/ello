# ==========================================================
# FILE: app/core/presence.py
# MODULE: REDIS PRESENCE SYSTEM
# ==========================================================

import redis
import os
from datetime import datetime, timezone

redis_client = redis.Redis(
    host=os.getenv("REDIS_HOST", "redis"),
    port=int(os.getenv("REDIS_PORT", 6379)),
    decode_responses=True
)


def set_user_online(user_id: int):
    redis_client.set(f"user:{user_id}:online", "1")


def set_user_offline(user_id: int):
    redis_client.delete(f"user:{user_id}:online")
    redis_client.set(
        f"user:{user_id}:last_seen",
        datetime.now(timezone.utc).isoformat()
    )


def is_user_online(user_id: int):
    return redis_client.exists(f"user:{user_id}:online")


def get_user_last_seen(user_id: int):
    return redis_client.get(f"user:{user_id}:last_seen")