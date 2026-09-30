"""WebSocket streaming router for real-time console event delivery."""

import asyncio
import contextlib
import json
import logging

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from app.auth.session import verify_session_token
from app.auth.ticket import consume_ws_ticket
from app.core.config import settings
from app.events.bus import subscribe_local_events

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


def _authenticate_header(auth_header: str | None) -> bool:
    """Validate token from Authorization header only (for non-browser clients)."""
    if not auth_header or not auth_header.lower().startswith("bearer "):
        return False
    token = auth_header[7:].strip()
    import hmac

    if hmac.compare_digest(token, settings.ADMIN_TOKEN):
        return True
    return verify_session_token(token) is not None


@router.websocket("/ws/events")
async def websocket_events_endpoint(
    websocket: WebSocket,
    ticket: str | None = Query(default=None),
) -> None:
    """
    Real-time WebSocket event stream.
    Authenticates operator via short-lived single-use ?ticket=<prh_wstk_...>.
    Tokens are strictly prohibited from query strings to prevent log leakage.
    """
    # 1. Authenticate before accepting
    authenticated = False
    if ticket:
        # Validate and immediately consume single-use ticket
        payload = await consume_ws_ticket(ticket)
        authenticated = payload is not None
    else:
        # Fall back to Authorization header for programmatic test clients
        auth_header = websocket.headers.get("authorization")
        authenticated = _authenticate_header(auth_header)

    if not authenticated:
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
