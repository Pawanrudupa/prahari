"""Operator authentication endpoints for the web console."""

import hmac

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from app.auth.session import create_session_token
from app.core.config import settings

router = APIRouter(prefix="/v1/auth", tags=["auth"])


class LoginRequest(BaseModel):
    """Admin token login request."""

    admin_token: str = Field(..., description="Administrative bearer secret")


class LoginResponse(BaseModel):
    """Session login response with signed session token."""

    session_token: str
    token_type: str = "Bearer"
    expires_in: int = 86400
    mode: str = "admin"
    warning: str | None = None


@router.post(
    "/login",
    response_model=LoginResponse,
    summary="Authenticate web console operator using admin token",
)
async def login_endpoint(req: LoginRequest) -> LoginResponse:
    """Exchange admin secret for a short-lived signed browser session token."""
    if not hmac.compare_digest(req.admin_token.strip(), settings.ADMIN_TOKEN):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid administrative credentials",
        )

    token = create_session_token(role="admin", mode="admin")
    return LoginResponse(session_token=token, mode="admin")


@router.get(
    "/dev-session",
    response_model=LoginResponse,
    summary="Development-only session token minting for local console development",
)
async def dev_session_endpoint() -> LoginResponse:
    """
    Mint a temporary session token for local web development without entering passwords.
    DISABLED OUTSIDE DEVELOPMENT.
    """
    if settings.ENV.lower() not in ("development", "dev", "test"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Development session bypass is prohibited in non-development environments",
        )

    token = create_session_token(role="admin", mode="development-bypass")
    return LoginResponse(
        session_token=token,
        mode="development-bypass",
        warning="DEVELOPMENT ONLY: Do not use in production environments",
    )
