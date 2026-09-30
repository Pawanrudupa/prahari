"""Event bus supporting Redis Pub/Sub with local in-memory subscriber queue fallback."""

import asyncio
import contextlib
import json
import logging
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

from app.core.redis import redis_client

logger = logging.getLogger(__name__)

CHANNEL_NAME = "prahari:events"
_LOCAL_SUBSCRIBERS: set[asyncio.Queue[dict[str, Any]]] = set()


def canonical_json(data: Any) -> str:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


async def _publish_to_redis(raw: str) -> None:
    try:
        if redis_client is not None:
            await asyncio.wait_for(redis_client.publish(CHANNEL_NAME, raw), timeout=1.0)
    except Exception as e:
        logger.debug("Failed to publish event to Redis pub/sub: %s", e)


async def publish_event(event_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    """
    Publish an event envelope to the event bus.

    NON-NEGOTIABLE INVARIANT:
    Event publishing is best-effort after audit commit and must NEVER affect
    or fail a gateway decision path. Any failure is suppressed and logged.
    """
    envelope = {
        "event_id": str(uuid4()),
        "timestamp": datetime.now(UTC).isoformat(),
        "type": event_type,
        "payload": payload,
    }

    # 1. Local in-memory queue fan-out (instantaneous)
    for q in list(_LOCAL_SUBSCRIBERS):
        try:
            q.put_nowait(envelope)
        except asyncio.QueueFull:
            # Drop oldest event if a slow subscriber's bounded queue fills up
            with contextlib.suppress(Exception):
                q.get_nowait()
                q.put_nowait(envelope)
        except Exception:
            pass

    # 2. Redis pub/sub distribution (best-effort background task)
    if redis_client is not None:
        raw = canonical_json(envelope)
        with contextlib.suppress(Exception):
            asyncio.create_task(_publish_to_redis(raw))

    return envelope


@contextlib.asynccontextmanager
async def subscribe_local_events(
    maxsize: int = 1000,
) -> AsyncIterator[asyncio.Queue[dict[str, Any]]]:
    """Context manager yielding a bounded per-client event queue."""
    q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=maxsize)
    _LOCAL_SUBSCRIBERS.add(q)
    try:
        yield q
    finally:
        _LOCAL_SUBSCRIBERS.discard(q)
