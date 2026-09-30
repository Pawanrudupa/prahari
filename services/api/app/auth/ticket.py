"""Short-lived, single-use ticket mechanism for secure WebSocket authentication."""

import asyncio
import json
import logging
import time
from typing import Any
from uuid import uuid4

from app.core.redis import redis_client

logger = logging.getLogger(__name__)

# Fallback in-memory ticket store when Redis is unavailable
# Format: {ticket_str: (expires_at, payload_dict)}
_LOCAL_TICKETS: dict[str, tuple[float, dict[str, Any]]] = {}
_LOCK = asyncio.Lock()


async def create_ws_ticket(
    user_payload: dict[str, Any],
    ttl_seconds: int = 30,
) -> str:
    """
    Mint a cryptographically random, short-lived single-use ticket.
    Stored with strict 30s TTL.
    """
    ticket_id = f"prh_wstk_{uuid4().hex}"
    expires_at = time.time() + ttl_seconds

    # Try storing in Redis first
    try:
        if redis_client is not None:
            raw = json.dumps(user_payload)
            await redis_client.set(f"ws_ticket:{ticket_id}", raw, ex=ttl_seconds)
            return ticket_id
    except Exception as e:
        logger.debug("Redis unavailable for ticket store, using local fallback: %s", e)

    # Local fallback
    async with _LOCK:
        # Clean expired tickets
        now = time.time()
        expired = [t for t, (exp, _) in _LOCAL_TICKETS.items() if exp < now]
        for t in expired:
            _LOCAL_TICKETS.pop(t, None)

        _LOCAL_TICKETS[ticket_id] = (expires_at, user_payload)

    return ticket_id


async def consume_ws_ticket(ticket: str) -> dict[str, Any] | None:
    """
    Atomically validate and immediately consume (delete) a ticket.
    Guarantees single-use semantics.
    """
    if not ticket or not ticket.startswith("prh_wstk_"):
        return None

    # Try consuming from Redis
    try:
        if redis_client is not None:
            # Atomically get and delete using Redis pipeline or GETDEL
            key = f"ws_ticket:{ticket}"
            pipe = redis_client.pipeline()
            pipe.get(key)
            pipe.delete(key)
            results = await pipe.execute()
            raw = results[0]
            if raw:
                data = json.loads(raw)
                if isinstance(data, dict):
                    return data
    except Exception as e:
        logger.debug("Redis unavailable for consuming ticket, checking local fallback: %s", e)

    # Local fallback
    async with _LOCK:
        item = _LOCAL_TICKETS.pop(ticket, None)
        if item is not None:
            expires_at, payload = item
            if time.time() <= expires_at:
                return payload

    return None
