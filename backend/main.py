"""
main.py — FastAPI application factory for Zel-EYE: OI.

Responsibilities:
  - Create the FastAPI app instance
  - Register CORS middleware
  - Lifespan: download DuckDB from S3 on startup
  - Mount all routers under /api/v1/
  - Global exception handlers
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.database import init_duckdb

# ---------------------------------------------------------------------------
# Routers — imported here; each module is generated in later phases
# ---------------------------------------------------------------------------
from app.routers import auth
from app.routers import portfolio
from app.routers import operation
from app.routers import analytics
from app.routers import comments
from app.routers import scb
from app.routers import reconnect
from app.routers import raw
from app.routers import meta
from app.routers.permit import s1, s2, s3


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """
    Startup: download DuckDB from S3 (ETag-checked, locked).
    Shutdown: nothing required — DuckDB connections are closed per-request.
    """
    settings = get_settings()
    print(
        f"[startup] Zel-EYE: OI API starting — environment: {settings.DUCKDB_LOCAL_PATH}",
        flush=True,
    )
    init_duckdb()
    print("[startup] DuckDB ready", flush=True)
    yield
    print("[shutdown] Zel-EYE: OI API stopped", flush=True)


# ---------------------------------------------------------------------------
# App factory
# ---------------------------------------------------------------------------


def create_app() -> FastAPI:
    settings = get_settings()

    app = FastAPI(
        title="Zel-EYE: OI",
        description="Solar Operations Intelligence — REST API",
        version="3.0.0",
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    # ------------------------------------------------------------------
    # CORS
    # ------------------------------------------------------------------
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ------------------------------------------------------------------
    # Routers
    # ------------------------------------------------------------------
    API_PREFIX = "/api/v1"

    app.include_router(auth.router,      prefix=f"{API_PREFIX}/auth",      tags=["auth"])
    app.include_router(portfolio.router, prefix=f"{API_PREFIX}/portfolio",  tags=["portfolio"])
    app.include_router(operation.router, prefix=f"{API_PREFIX}/operation",  tags=["operation"])
    app.include_router(analytics.router, prefix=f"{API_PREFIX}/analytics",  tags=["analytics"])
    app.include_router(comments.router,  prefix=f"{API_PREFIX}/comments",   tags=["comments"])
    app.include_router(scb.router,       prefix=f"{API_PREFIX}/scb",        tags=["scb"])
    app.include_router(reconnect.router, prefix=f"{API_PREFIX}/reconnect",  tags=["reconnect"])
    app.include_router(raw.router,       prefix=f"{API_PREFIX}/raw",        tags=["raw"])
    app.include_router(meta.router,      prefix=f"{API_PREFIX}/meta",       tags=["meta"])
    app.include_router(s1.router,        prefix=f"{API_PREFIX}/permits/s1", tags=["permits-s1"])
    app.include_router(s2.router,        prefix=f"{API_PREFIX}/permits/s2", tags=["permits-s2"])
    app.include_router(s3.router,        prefix=f"{API_PREFIX}/permits/s3", tags=["permits-s3"])

    # ------------------------------------------------------------------
    # Health check
    # ------------------------------------------------------------------
    @app.get("/api/health", tags=["health"])
    async def health() -> dict:
        return {"status": "ok"}

    # ------------------------------------------------------------------
    # Global exception handlers
    # ------------------------------------------------------------------
    @app.exception_handler(ValueError)
    async def value_error_handler(request: Request, exc: ValueError) -> JSONResponse:
        return JSONResponse(status_code=422, content={"detail": str(exc)})

    @app.exception_handler(ConnectionError)
    async def connection_error_handler(request: Request, exc: ConnectionError) -> JSONResponse:
        return JSONResponse(status_code=503, content={"detail": str(exc)})

    @app.exception_handler(PermissionError)
    async def permission_error_handler(request: Request, exc: PermissionError) -> JSONResponse:
        return JSONResponse(status_code=403, content={"detail": str(exc)})

    return app


# ---------------------------------------------------------------------------
# ASGI entry point
# ---------------------------------------------------------------------------
app = create_app()
