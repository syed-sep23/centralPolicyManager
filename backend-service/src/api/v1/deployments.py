"""Deployments Router — Celery Task Orchestration, OPA Validation & Server-Sent Events (SSE)."""

import asyncio
import json
import uuid
from typing import AsyncGenerator, Optional

import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sse_starlette.sse import EventSourceResponse

from api.v1.validation import ValidationRequest, validate_policy
from core.config import settings
from db.session import get_db
from services.policy_compiler import (
    compile_opa_rego,
    fetch_policy_raw_payload,
    generate_natural_language_summary,
)
from tasks.deployment_tasks import deploy_policy_task, publish_event
from tasks.metadata_tasks import sync_platform_metadata_cron

router = APIRouter()
log = structlog.get_logger()


class DeployRequest(BaseModel):
    policy_id: int
    version_id: int
    target_platform_ids: Optional[list[int]] = None


class DeployResponse(BaseModel):
    event_id: str
    celery_task_id: str
    policy_id: int
    version_id: int
    status: str
    stream_url: str
    message: str


class ManualSyncRequest(BaseModel):
    platform_codes: Optional[list[str]] = None
    platform_ids: Optional[list[int]] = None


@router.post("", response_model=DeployResponse, status_code=status.HTTP_202_ACCEPTED)
async def trigger_policy_deployment(
    body: DeployRequest, db: AsyncSession = Depends(get_db)
):
    """
    1. Validate Policy with Open Policy Agent (OPA).
    2. If valid, generate a unique Event ID.
    3. Dispatch asynchronous Celery Worker deployment to push policy to Snowflake and Redshift.
    4. Return Event ID and SSE stream endpoint for real-time frontend streaming.
    """
    policy_id = body.policy_id
    version_id = body.version_id

    # 1. ALWAYS validate policy against OPA first
    val_res = await validate_policy(
        ValidationRequest(policy_id=policy_id, version_id=version_id), db
    )
    if not val_res.is_valid:
        err_details = (
            "; ".join(val_res.errors)
            if val_res.errors
            else "Policy failed declarative OPA validation checks"
        )
        await db.execute(
            text("UPDATE policies SET status = 'FAILED_VALIDATION' WHERE policy_id = :p"),
            {"p": policy_id},
        )
        await db.commit()
        raise HTTPException(
            status_code=400,
            detail=f"OPA Policy Validation Rejected (Decision: Negative). Violations: {err_details}. Deployment aborted.",
        )

    # 2. Generate Unique Event ID for Server-Sent Events
    event_id = f"evt_{uuid.uuid4().hex[:12]}"

    # Publish initial OPA validation passed event
    publish_event(
        event_id,
        {
            "step": "OPA_VALIDATED",
            "status": "SUCCESS",
            "message": "OPA Validation Gate Passed ✅ Declarative Rego policy verified.",
            "event_id": event_id,
            "policy_id": policy_id,
            "version_id": version_id,
        },
    )

    # 3. Asynchronously dispatch Celery Worker task
    celery_async_result = deploy_policy_task.delay(
        event_id=event_id,
        policy_id=policy_id,
        version_id=version_id,
        target_platform_ids=body.target_platform_ids,
    )
    task_id = celery_async_result.id

    log.info(
        "policy_deployment.dispatched",
        event_id=event_id,
        celery_task_id=task_id,
        policy_id=policy_id,
    )

    return DeployResponse(
        event_id=event_id,
        celery_task_id=task_id,
        policy_id=policy_id,
        version_id=version_id,
        status="PENDING",
        stream_url=f"/api/v1/deployments/stream/{event_id}",
        message="OPA validation passed. Asynchronous Celery worker deployment initiated.",
    )


@router.get("/stream/{event_id}")
async def stream_deployment_events(event_id: str, request: Request):
    """
    Stream Server-Sent Events (SSE) to the frontend during policy deployment.
    Listens to the Redis Pub/Sub channel 'deployment_events:{event_id}' and yields events in real time.
    """
    async def event_generator() -> AsyncGenerator[dict, None]:
        r = None
        pubsub = None
        try:
            r = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
            pubsub = r.pubsub()
            channel_name = f"deployment_events:{event_id}"
            await pubsub.subscribe(channel_name)

            # Check if there is already an initial cached state
            cached = await r.get(f"deployment_state:{event_id}")
            if cached:
                yield {
                    "event": "deployment_update",
                    "data": cached,
                    "id": event_id,
                }

            # Listen for new events from Celery worker
            timeout_seconds = 60
            start_time = asyncio.get_event_loop().time()

            while True:
                if await request.is_disconnected():
                    log.info("sse_client.disconnected", event_id=event_id)
                    break

                message = await pubsub.get_message(
                    ignore_subscribe_messages=True, timeout=1.0
                )
                if message and message["type"] == "message":
                    raw_data = message["data"]
                    yield {
                        "event": "deployment_update",
                        "data": raw_data,
                        "id": event_id,
                    }
                    try:
                        parsed = json.loads(raw_data)
                        if parsed.get("step") in ("COMPLETED", "FAILED"):
                            # Final event reached; allow brief pause then end stream
                            await asyncio.sleep(0.5)
                            break
                    except Exception:
                        pass
                else:
                    # Keepalive ping
                    yield {
                        "event": "ping",
                        "data": json.dumps({"heartbeat": True, "event_id": event_id}),
                    }

                if (asyncio.get_event_loop().time() - start_time) > timeout_seconds:
                    yield {
                        "event": "timeout",
                        "data": json.dumps({"message": "Stream timeout reached"}),
                    }
                    break

                await asyncio.sleep(0.5)

        except Exception as exc:
            log.warning("sse_stream.error", event_id=event_id, error=str(exc))
            yield {
                "event": "error",
                "data": json.dumps({"error": str(exc), "event_id": event_id}),
            }
        finally:
            if pubsub:
                await pubsub.unsubscribe(f"deployment_events:{event_id}")
                await pubsub.close()
            if r:
                await r.aclose()

    return EventSourceResponse(event_generator())


@router.get("/tasks/history")
async def get_celery_task_history(
    task_type: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    """
    Return historical execution records of Celery Beat cron tasks and worker runs.
    Reflected when user loads or views the Deployments history UI.
    """
    query_str = """
        SELECT id, task_id, task_name, task_type, platform_code, status,
               started_at, completed_at, duration_ms, tables_synced, columns_synced,
               result_summary, error_message
        FROM celery_task_history
    """
    params = {"limit": limit}
    if task_type:
        query_str += " WHERE task_type = :ttype"
        params["ttype"] = task_type
    query_str += " ORDER BY started_at DESC LIMIT :limit"

    rows = (await db.execute(text(query_str), params)).mappings().all()
    return [dict(r) for r in rows]


@router.post("/tasks/sync-now", status_code=status.HTTP_202_ACCEPTED)
async def trigger_manual_metadata_sync(
    body: Optional[ManualSyncRequest] = None,
    platform_codes: Optional[list[str]] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """
    Trigger an immediate on-demand metadata synchronization task via Celery worker.
    Accepts target platform codes or IDs in the body or query params.
    Results will be committed to PostgreSQL celery_task_history upon completion.
    """
    target_codes: list[str] = []
    if platform_codes:
        target_codes.extend(platform_codes)
    if body:
        if body.platform_codes:
            target_codes.extend(body.platform_codes)
        if body.platform_ids:
            res = await db.execute(
                text("SELECT platform_code FROM metadata_platforms WHERE platform_id = ANY(:pids) AND is_active = TRUE"),
                {"pids": body.platform_ids},
            )
            target_codes.extend(res.scalars().all())

    final_codes = list(set(target_codes)) if target_codes else None

    async_result = sync_platform_metadata_cron.delay(
        task_type="MANUAL_SYNC", platform_codes=final_codes
    )
    return {
        "status": "DISPATCHED",
        "task_id": async_result.id,
        "platform_codes": final_codes,
        "message": "Metadata synchronization task dispatched to Celery worker.",
    }


@router.get("/{policy_id}/status")
async def deployment_status(
    policy_id: int,
    version_id: Optional[int] = None,
    all_versions: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Return status of deployment targets for a specific policy (defaults to current/active version)."""
    if version_id:
        filter_clause = "pv.policy_id = :p AND pv.version_id = :v"
        params = {"p": policy_id, "v": version_id}
    elif all_versions:
        filter_clause = "pv.policy_id = :p"
        params = {"p": policy_id}
    else:
        filter_clause = """
            pv.policy_id = :p AND pv.version_id = (
                SELECT version_id FROM policy_versions 
                WHERE policy_id = :p 
                ORDER BY is_current DESC, version_number DESC 
                LIMIT 1
            )
        """
        params = {"p": policy_id}

    query = f"""
        SELECT pvt.target_id, pvt.version_id, pvt.platform_id, pvt.deployment_status,
               pvt.celery_task_id, pvt.deployed_at, pvt.error_message,
               mp.platform_code, pv.version_number, pv.version_label
        FROM policy_version_targets pvt
        JOIN metadata_platforms mp ON mp.platform_id = pvt.platform_id
        JOIN policy_versions pv ON pv.version_id = pvt.version_id
        WHERE {filter_clause}
        ORDER BY pvt.deployed_at DESC NULLS LAST, pvt.version_id DESC
    """
    rows = (await db.execute(text(query), params)).mappings().all()
    return [dict(r) for r in rows]


@router.get("/{policy_id}/compiled")
async def get_compiled_policy_artifacts(
    policy_id: int, version_id: Optional[int] = None, db: AsyncSession = Depends(get_db)
):
    """Fetch raw universal policy JSON payload, OPA Rego, and governance summary."""
    if not version_id:
        ver_row = (
            await db.execute(
                text(
                    "SELECT version_id FROM policy_versions WHERE policy_id = :p ORDER BY version_number DESC LIMIT 1"
                ),
                {"p": policy_id},
            )
        ).first()
        if not ver_row:
            raise HTTPException(status_code=404, detail="No policy versions found")
        version_id = ver_row.version_id

    raw_payload = await fetch_policy_raw_payload(version_id, db)
    opa_rego = compile_opa_rego(raw_payload)
    natural_language = generate_natural_language_summary(raw_payload)

    return {
        "policy_id": policy_id,
        "version_id": version_id,
        "raw_payload": raw_payload,
        "opa_rego": opa_rego,
        "natural_language": natural_language,
    }
