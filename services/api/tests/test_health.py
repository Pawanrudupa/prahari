import pytest
from httpx import AsyncClient

from app.schemas.health import HealthResponse


@pytest.mark.asyncio
async def test_health_returns_ok(client: AsyncClient) -> None:
    response = await client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["version"] == "0.1.0"


@pytest.mark.asyncio
async def test_health_matches_schema(client: AsyncClient) -> None:
    response = await client.get("/health")
    data = response.json()
    health = HealthResponse(**data)
    assert health.status == "ok"
    assert isinstance(health.db, bool)
    assert isinstance(health.redis, bool)
