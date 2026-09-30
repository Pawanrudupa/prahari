import contextlib
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine
from app.core.redis import redis_client
from app.gateway.router import router as gateway_router
from app.routers import agents, audit, auth, graph, health, tools
from app.ws.router import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    # Startup — graceful: don't crash if dependencies are unavailable
    with contextlib.suppress(Exception):
        await redis_client.ping()
    yield
    # Shutdown
    await engine.dispose()
    with contextlib.suppress(Exception):
        await redis_client.aclose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Prahari API",
        version="0.1.0",
        description="Agent Governance Console API",
        lifespan=lifespan,
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

    return app

