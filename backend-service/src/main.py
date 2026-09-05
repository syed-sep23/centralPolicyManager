"""Core Backend Service — Single FastAPI Application Entry Point."""

import asyncio
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from api.v1 import (
    auth,
    conditions,
    deployments,
    metadata,
    policies,
    purposes,
    requests,
    rules,
    scim,
    user_rbac,
    validation,
    versions,
)
from core.auth import configure_auth
from core.config import settings
from core.logging import configure_logging
from db.session import Base, engine


configure_logging()
log = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("backend_service.starting", env=settings.ENVIRONMENT)
    configure_auth(
        secret_key=settings.SECRET_KEY,
        access_expire_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield
    log.info("backend_service.shutdown")
    await engine.dispose()



def create_app() -> FastAPI:
    app = FastAPI(
        title="Central Entitlement Service (CES) — Core Backend Service",
        description="Unified REST API for policy governance, validation, metadata, user management, and deployment",
        version="1.0.0",
        lifespan=lifespan,
        docs_url="/docs",
        redoc_url="/redoc",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # API Routers
    app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
    app.include_router(purposes.router, prefix="/api/v1/purposes", tags=["Purposes (PBAC)"])
    app.include_router(requests.router, prefix="/api/v1/requests", tags=["Entitlement Requests"])
    app.include_router(scim.router, prefix="/api/v1/scim/v2", tags=["SCIM 2.0 Identity Sync"])
    app.include_router(policies.router, prefix="/api/v1/policies", tags=["Policies"])
    app.include_router(versions.router, prefix="/api/v1/policies", tags=["Versions"])
    app.include_router(rules.router, prefix="/api/v1/policies", tags=["Rules"])
    app.include_router(conditions.router, prefix="/api/v1/policies", tags=["Conditions"])
    app.include_router(validation.router, prefix="/api/v1", tags=["Validation"])
    app.include_router(metadata.router, prefix="/api/v1/metadata", tags=["Metadata"])
    app.include_router(user_rbac.router, prefix="/api/v1", tags=["Users & Roles"])
    app.include_router(deployments.router, prefix="/api/v1/deployments", tags=["Deployments"])

    @app.get("/health", tags=["Health"])
    async def health():
        return {"status": "ok", "service": "backend-service"}

    return app


app = create_app()
