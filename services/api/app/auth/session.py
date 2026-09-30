"""Cryptographically signed session tokens for web console and operator authentication."""

import base64
import hashlib
import hmac
import json
import time
from typing import Any
from uuid import uuid4

from app.core.config import settings


def _b64_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode().rstrip("=")


def _b64_decode(data: str) -> bytes:
    padding = 4 - (len(data) % 4)
    if padding != 4:
        data += "=" * padding
    return base64.urlsafe_b64decode(data)


def create_session_token(
    role: str = "admin",
    mode: str = "admin",
    ttl_seconds: int = 86400,
) -> str:
    """Create a signed, tamper-proof session token for the web console."""
    payload = {
        "sub": "admin",
        "role": role,
        "mode": mode,
        "exp": time.time() + ttl_seconds,
        "nonce": uuid4().hex,
    }
    raw_payload = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode()
    payload_b64 = _b64_encode(raw_payload)

    signature = hmac.new(
        settings.SESSION_SECRET_KEY.encode(),
        payload_b64.encode(),
        hashlib.sha256,
    ).hexdigest()

    return f"prh_sess_{payload_b64}.{signature}"


def verify_session_token(token: str) -> dict[str, Any] | None:
    """
    Verify signature and expiration of a session token.
    Returns decoded payload if valid, None otherwise.
    """
    if not token.startswith("prh_sess_") or "." not in token:
        return None

    try:
        parts = token[len("prh_sess_") :].split(".", 1)
        if len(parts) != 2:
            return None

        payload_b64, signature = parts
        expected_sig = hmac.new(
            settings.SESSION_SECRET_KEY.encode(),
            payload_b64.encode(),
            hashlib.sha256,
        ).hexdigest()

        if not hmac.compare_digest(signature, expected_sig):
            return None

        payload_bytes = _b64_decode(payload_b64)
        payload: dict[str, Any] = json.loads(payload_bytes)

        if time.time() > payload.get("exp", 0):
            return None

        return payload
    except Exception:
        return None
