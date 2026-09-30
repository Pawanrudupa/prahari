"""WebSocket streaming router for real-time console event delivery."""

import asyncio
import contextlib
import json
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.auth.session import verify_session_token
from app.core.config import settings
from app.events.bus import subscribe_local_events

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


def _authenticate_ws(token: str | None) -> bool:
    """Validate token from query string (?token=...) or header."""
    if not token:
        return False
    # Direct admin token match
    import hmac

    if hmac.compare_digest(token.strip(), settings.ADMIN_TOKEN):
        return True
    # Signed session token match
    return verify_session_token(token.strip()) is not None


@router.websocket("/ws/events")
async def websocket_events_endpoint(
    websocket: WebSocket,
    token: str | None = Query(default=None),
) -> None:
    """
    Real-time WebSocket event stream.
    Authenticates operator via ?token=<session_or_admin_token>.
    Emits events according to the docs/05 envelope with bounded client queues.
    """
    # 1. Authenticate before accepting
    # Try query param first, then Authorization header if present
    auth_token = token
    if not auth_token:
        auth_header = websocket.headers.get("authorization")
        if auth_header and auth_header.lower().startswith("bearer "):
            auth_token = auth_header[7:].strip()

    if not _authenticate_ws(auth_token):
        await websocket.close(code=1008, reason="Authentication failed")
        return

    await websocket.accept()

    # 2. Subscribe to bounded local event queue (max 1000 events)
    async with subscribe_local_events(maxsize=1000) as event_queue:
        # Task for client ping/pong heartbeat and incoming disconnect detection
        async def _client_listener() -> None:
            try:
                while True:
                    data = await websocket.receive_text()
                    # Respond to client ping with pong
                    with contextlib.suppress(Exception):
                        parsed = json.loads(data)
                        if parsed.get("type") == "ping":
                            await websocket.send_text(json.dumps({"type": "pong"}))
            except (WebSocketDisconnect, asyncio.CancelledError):
                pass

        listener_task = asyncio.create_task(_client_listener())

        try:
            while True:
                # Wait for next event with a periodic heartbeat
                try:
                    event = await asyncio.wait_for(event_queue.get(), timeout=25.0)
                    raw = json.dumps(event, separators=(",", ":"))
                    await websocket.send_text(raw)
                except TimeoutError:
                    # Send server-side heartbeat ping to keep connection alive
                    with contextlib.suppress(Exception):
                        await websocket.send_text(json.dumps({"type": "heartbeat"}))
        except (WebSocketDisconnect, asyncio.CancelledError):
            pass
        finally:
            listener_task.cancel()
            with contextlib.suppress(Exception):
                await listener_task
