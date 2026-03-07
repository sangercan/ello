import redis
import json
import asyncio

redis_client = redis.Redis(host="redis", port=6379, decode_responses=True)


async def publish(channel, message):
    redis_client.publish(channel, json.dumps(message))


def subscribe(channel):
    pubsub = redis_client.pubsub()
    pubsub.subscribe(channel)
    return pubsub