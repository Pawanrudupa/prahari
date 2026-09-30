"""Admin and web session authentication dependencies."""

import hmac

from fastapi import Header, HTTPException, Query, status

from app.auth.session import verify_session_token
from app.core.config import settings


async def require_admin_token(
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None),
) -> str:
    """
    Verify administrative access token from either:
    1. Authorization: Bearer <token>
    2. X-Admin-Token: <token>

    Uses constant-time comparison to prevent timing side-channel attacks.
    """
    token: str | None = None

    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    elif x_admin_token:
        token = x_admin_token.strip()

    if not token or not hmac.compare_digest(token, settings.ADMIN_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: invalid or missing admin token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return token


async def require_session_or_admin_token(
    authorization: str | None = Header(default=None),
    x_admin_token: str | None = Header(default=None),
    token: str | None = Query(default=None),
) -> dict[str, str]:
    """
    Verify operator identity from a signed web session token or admin token.
    Supports Header (Authorization / X-Admin-Token) and Query param (?token=) for WebSockets.
    """
    candidate: str | None = None

    if authorization and authorization.lower().startswith("bearer "):
        candidate = authorization[7:].strip()
    elif x_admin_token:
        candidate = x_admin_token.strip()
    elif token:
        candidate = token.strip()

    if not candidate:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Unauthorized: missing session or admin authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 1. Direct admin token check
    if hmac.compare_digest(candidate, settings.ADMIN_TOKEN):
        return {"sub": "admin", "role": "admin", "mode": "admin"}

    # 2. Signed session token check
    session = verify_session_token(candidate)
    if session is not None:
        return {
            "sub": str(session.get("sub", "operator")),
            "role": str(session.get("role", "viewer")),
            "mode": str(session.get("mode", "admin")),
        }

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized: invalid or expired session/admin token",
        headers={"WWW-Authenticate": "Bearer"},
    )

