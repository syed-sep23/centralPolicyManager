"""Core Backend Service — Single FastAPI Application Entry Point."""
from contextlib import asynccontextmanager

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.core.config import settings
from src.core.logging import configure_logging
from src.db.session import engine, Base
from src.api.v1 import (
    auth, policies, versions, rules, conditions,
    validation, metadata, user_rbac, deployments,
)
from src.core.auth import configure_auth

import asyncio
from temporalio.client import Client
from temporalio.worker import Worker
from src.workflows.deployment_workflow import (
    PolicyDeploymentWorkflow,
    compile_policy_activity,
    deploy_to_platform_activity,
)
from src.workflows.metadata_sync_workflow import MetadataSyncCronWorkflow, sync_platform_metadata_activity

configure_logging()
log = structlog.get_logger()


async def run_temporal_worker():
    """Background task running Temporal worker listening on policy-deployment task queue."""
    try:
        log.info("temporal_worker.connecting", host=settings.TEMPORAL_HOST)
        client = await Client.connect(settings.TEMPORAL_HOST, namespace=settings.TEMPORAL_NAMESPACE)
        worker = Worker(
            client,
            task_queue=settings.TEMPORAL_TASK_QUEUE,
            workflows=[PolicyDeploymentWorkflow, MetadataSyncCronWorkflow],
            activities=[compile_policy_activity, deploy_to_platform_activity, sync_platform_metadata_activity],
        )
        log.info("temporal_worker.started", task_queue=settings.TEMPORAL_TASK_QUEUE)
        await worker.run()
    except asyncio.CancelledError:
        log.info("temporal_worker.stopped")
    except Exception as e:
        log.warning("temporal_worker.error", error=str(e))


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("backend_service.starting", env=settings.ENVIRONMENT)
    configure_auth(
        secret_key=settings.SECRET_KEY,
        access_expire_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    worker_task = asyncio.create_task(run_temporal_worker())
    yield
    worker_task.cancel()
    log.info("backend_service.shutdown")
    await engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Central Policy Management (CPM) — Core Backend Service",
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
    app.include_router(auth.router,        prefix="/api/v1/auth",        tags=["Auth"])
    app.include_router(policies.router,    prefix="/api/v1/policies",    tags=["Policies"])
    app.include_router(versions.router,    prefix="/api/v1/policies",    tags=["Versions"])
    app.include_router(rules.router,       prefix="/api/v1/policies",    tags=["Rules"])
    app.include_router(conditions.router,  prefix="/api/v1/policies",    tags=["Conditions"])
    app.include_router(validation.router,  prefix="/api/v1",             tags=["Validation"])
    app.include_router(metadata.router,    prefix="/api/v1/metadata",    tags=["Metadata"])
    app.include_router(user_rbac.router,   prefix="/api/v1",             tags=["Users & Roles"])
    app.include_router(deployments.router, prefix="/api/v1/deployments", tags=["Deployments"])

    @app.get("/health", tags=["Health"])
    async def health():
        return {"status": "ok", "service": "backend-service"}

    return app


app = create_app()
