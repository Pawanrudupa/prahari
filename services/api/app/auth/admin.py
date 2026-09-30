"""Admin token authentication dependency for administrative endpoints."""

import hmac

from fastapi import Header, HTTPException, status

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
