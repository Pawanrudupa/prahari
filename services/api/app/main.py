import contextlib
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine
from app.core.redis import redis_client
from app.gateway.router import router as gateway_router
from app.routers import agents, audit, auth, dev, graph, health, tools
from app.ws.router import router as ws_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Startup validation: warn if configured DB pool size could exhaust Postgres max_connections
    total_pool = settings.DB_POOL_SIZE + settings.DB_MAX_OVERFLOW
    if total_pool > 30:
        logger.warning(
            "Configured database connection pool total (%d) is high. "
            "Ensure workers × (DB_POOL_SIZE + DB_MAX_OVERFLOW) < PostgreSQL max_connections.",
            total_pool,
        )

    # Startup — graceful: don't crash if dependencies are unavailable
    with contextlib.suppress(Exception):
        await redis_client.ping()
    yield
    # Shutdown
    with contextlib.suppress(Exception):
        await engine.dispose()


def create_app(enable_lifespan: bool = True) -> FastAPI:
    """
    Create FastAPI application instance.

    CRITICAL INVARIANT: enable_lifespan defaults strictly to True and is NOT
    configurable via environment variables. It may only be explicitly set to
    False by targeted test harnesses requiring isolated background loops.
    """
    app = FastAPI(
        title="Prahari API",
        version="0.1.0",
        description="Agent Governance Console API",
        lifespan=lifespan if enable_lifespan else None,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register all router modules
    app.include_router(health.router)
    app.include_router(auth.router)
    app.include_router(gateway_router)
    app.include_router(audit.router)
    app.include_router(agents.router)
    app.include_router(tools.router)
    app.include_router(graph.router)
    app.include_router(ws_router)
    app.include_router(dev.router)

    return app
