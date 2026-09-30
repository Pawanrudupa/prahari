from redis.asyncio import Redis

from app.core.config import settings

redis_client: Redis = Redis.from_url(
    settings.REDIS_URL,
    decode_responses=True,
    socket_connect_timeout=0.2,
    socket_timeout=0.2,
)
