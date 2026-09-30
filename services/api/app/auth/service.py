"""Authentication service for AI agents using API key prefix and constant-time hashing."""

import hashlib
import hmac
import secrets
from typing import NamedTuple
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.agent import Agent


class GeneratedKey(NamedTuple):
    full_key: str
    prefix: str
    hashed: str


class AuthError(Exception):
    """Raised when agent authentication fails."""

    def __init__(self, reason: str, agent_id: UUID | None = None) -> None:
        self.reason = reason
        self.agent_id = agent_id
        super().__init__(f"Agent authentication failed: {reason}")


def hash_secret(secret: str) -> str:
    """Hash the secret part of an API key using SHA-256."""
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def generate_api_key() -> GeneratedKey:
    """
    Generate a new API key.

    Format: prh_<prefix_8hex>_<secret_32hex>
    The prefix is stored in the database for O(1) indexed lookup.
    The secret is hashed before storage.
    """
    prefix = secrets.token_hex(4)
    secret = secrets.token_hex(16)
    full_key = f"prh_{prefix}_{secret}"
    hashed = hash_secret(secret)
    return GeneratedKey(full_key=full_key, prefix=f"prh_{prefix}", hashed=hashed)


def parse_api_key(raw_key: str) -> tuple[str, str] | None:
    """Parse raw key into (prefix, secret). Returns None if format invalid."""
    parts = raw_key.strip().split("_")
    if len(parts) != 3 or parts[0] != "prh":
        return None
    prefix = f"prh_{parts[1]}"
    secret = parts[2]
    return prefix, secret


def verify_secret(secret: str, stored_hash: str) -> bool:
    """Constant-time comparison of hashed secret to prevent timing attacks."""
    computed = hash_secret(secret)
    return hmac.compare_digest(computed, stored_hash)


async def authenticate_agent(session: AsyncSession, raw_key: str) -> Agent:
    """
    Authenticate an agent from a raw API key.

    Looks up agent by prefix, verifies secret via constant-time compare,
    and ensures agent status is active.
    Raises AuthError with a specific reason on any failure.
    """
    parsed = parse_api_key(raw_key)
    if not parsed:
        raise AuthError("invalid_key_format")

    prefix, secret = parsed

    stmt = select(Agent).where(Agent.api_key_prefix == prefix)
    result = await session.execute(stmt)
    agent = result.scalar_one_or_none()

    if agent is None:
        raise AuthError("agent_not_found")

    if agent.status != "active":
        raise AuthError("agent_disabled", agent_id=agent.id)

    if not verify_secret(secret, agent.api_key_hash):
        raise AuthError("invalid_credentials", agent_id=agent.id)

    return agent
