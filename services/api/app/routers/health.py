from fastapi import APIRouter
from sqlalchemy import text

from app.core.database import engine
from app.core.redis import redis_client
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    db_ok = False
    redis_ok = False

    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        pass

    try:
        await redis_client.ping()
        redis_ok = True
    except Exception:
        pass

    return HealthResponse(
        status="ok",
        version="0.1.0",
        db=db_ok,
        redis=redis_ok,
    )
