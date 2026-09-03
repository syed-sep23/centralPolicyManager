import uuid
from typing import Optional

import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from temporalio.client import Client

from api.v1.validation import ValidationRequest, validate_policy
from core.config import settings
from db.session import get_db
from services.policy_compiler import (
    compile_opa_rego,
    fetch_policy_raw_payload,
    generate_natural_language_summary,
)
from workflows.deployment_workflow import PolicyDeploymentWorkflow

router = APIRouter()
log = structlog.get_logger()

CONNECTOR_MAP = {
    "SNOWFLAKE": lambda: settings.SNOWFLAKE_CONNECTOR_URL,
    "REDSHIFT": lambda: settings.REDSHIFT_CONNECTOR_URL,
}


class DeployRequest(BaseModel):
    policy_id: int
    version_id: int
    target_platform_ids: Optional[list[int]] = None


class DeployResponse(BaseModel):
    deployment_id: str
    policy_id: int
    version_id: int
    status: str
    platforms: list[dict]


async def execute_policy_deployment(
    policy_id: int,
    version_id: int,
    target_platform_ids: Optional[list[int]],
    db: AsyncSession,
) -> DeployResponse:
    deployment_id = f"dep-{uuid.uuid4().hex[:8]}"

    # 0. ALWAYS check OPA decision first — only if OPA decision is positive (is_valid=True), proceed to Temporal & connector deployment
    val_res = await validate_policy(
        ValidationRequest(policy_id=policy_id, version_id=version_id), db
    )
    if not val_res.is_valid:
        err_details = (
            "; ".join(val_res.errors) if val_res.errors else "Policy failed OPA validation checks"
        )
        await db.execute(
            text("UPDATE policies SET status = 'FAILED_VALIDATION' WHERE policy_id = :p"),
            {"p": policy_id},
        )
        raise HTTPException(
            status_code=400,
            detail=f"OPA Policy Validation Rejected (Decision: Negative). Violations: {err_details}. Temporal workflow deployment aborted.",
        )

    # 1. Fetch policy definition from catalog
    compile_result = {
        "raw_payload": await fetch_policy_raw_payload(version_id, db),
        "snowflake_sql": "",
        "redshift_sql": "",
    }

    if not target_platform_ids:
        rows = (
            (
                await db.execute(
                    text(
                        "SELECT pvt.platform_id, mp.platform_code FROM policy_version_targets pvt JOIN metadata_platforms mp ON mp.platform_id = pvt.platform_id WHERE pvt.version_id = :v"
                    ),
                    {"v": version_id},
                )
            )
            .mappings()
            .all()
        )
        platforms = [dict(r) for r in rows]
        if not platforms:
            rows = (
                (
                    await db.execute(
                        text(
                            "SELECT platform_id, platform_code FROM metadata_platforms WHERE is_active = TRUE"
                        )
                    )
                )
                .mappings()
                .all()
            )
            platforms = [dict(r) for r in rows]
    else:
        rows = (
            (
                await db.execute(
                    text(
                        "SELECT platform_id, platform_code FROM metadata_platforms WHERE platform_id = ANY(:ids)"
                    ),
                    {"ids": target_platform_ids},
                )
            )
            .mappings()
            .all()
        )
        platforms = [dict(r) for r in rows]

    for p in platforms:
        await db.execute(
            text("""
                INSERT INTO policy_version_targets (version_id, platform_id, deployment_status, temporal_workflow_id)
                VALUES (:v, :p, 'IN_PROGRESS', :wid)
                ON CONFLICT (version_id, platform_id)
                DO UPDATE SET deployment_status='IN_PROGRESS', temporal_workflow_id=:wid
            """),
            {"v": version_id, "p": p["platform_id"], "wid": deployment_id},
        )

    # 2. Trigger Temporal workflow
    try:
        temporal_client = await Client.connect(
            settings.TEMPORAL_HOST, namespace=settings.TEMPORAL_NAMESPACE
        )
        workflow_input = {
            "policy_id": policy_id,
            "version_id": version_id,
            "targets": [
                {
                    "platform_code": p["platform_code"],
                    "connector_url": CONNECTOR_MAP.get(p["platform_code"], lambda: None)(),
                    "policy_id": policy_id,
                    "version_id": version_id,
                }
                for p in platforms
            ],
        }
        await temporal_client.start_workflow(
            PolicyDeploymentWorkflow.run,
            workflow_input,
            id=deployment_id,
            task_queue=settings.TEMPORAL_TASK_QUEUE,
        )
    except Exception as e:
        log.warning("temporal_workflow.trigger_failed", error=str(e))

    # 3. Direct Connector Dispatch & Detailed Error / Status Updates
    platform_statuses = []
    for p in platforms:
        p_code = p["platform_code"]
        connector_url = CONNECTOR_MAP.get(p_code, lambda: None)()
        sql_ddl = (
            compile_result["snowflake_sql"]
            if p_code == "SNOWFLAKE"
            else compile_result["redshift_sql"]
        )

        p_status = {
            "platform_id": p["platform_id"],
            "platform_code": p_code,
            "status": "PENDING",
            "error_message": None,
        }

        if connector_url:
            try:
                async with httpx.AsyncClient(timeout=15) as client:
                    resp = await client.post(
                        f"{connector_url}/api/v1/apply",
                        json={
                            "policy_id": policy_id,
                            "version_id": version_id,
                            "platform_code": p_code,
                            "sql_ddl": sql_ddl,
                            "raw_policy": compile_result["raw_payload"],
                        },
                    )
                result = resp.json()
                if resp.status_code == 200 and result.get("success"):
                    p_status["status"] = "SUCCESS"
                    p_status["error_message"] = (
                        result.get("message") or f"Successfully deployed native DDL to {p_code}"
                    )
                else:
                    p_status["status"] = "FAILED"
                    p_status["error_message"] = (
                        result.get("error") or f"Connector error (HTTP {resp.status_code})"
                    )
            except Exception as e:
                p_status["status"] = "FAILED"
                p_status["error_message"] = f"Connector endpoint {connector_url} offline: {e}"
        else:
            p_status["status"] = "FAILED"
            p_status["error_message"] = f"No connector configured for {p_code}."

        platform_statuses.append(p_status)

        # Update DB target status & error message
        await db.execute(
            text("""
                UPDATE policy_version_targets
                SET deployment_status = :s, error_message = :err, deployed_at = NOW()
                WHERE version_id = :v AND platform_id = :p
            """),
            {
                "s": p_status["status"],
                "err": p_status["error_message"],
                "v": version_id,
                "p": p["platform_id"],
            },
        )

    all_success = all(p["status"] == "SUCCESS" for p in platform_statuses)
    final_policy_status = "ENFORCED"

    await db.execute(
        text("UPDATE policies SET status = :s WHERE policy_id = :p"),
        {"s": final_policy_status, "p": policy_id},
    )
    await db.execute(
        text(
            "UPDATE policy_versions SET status = 'DEPLOYED', deployed_at = NOW() WHERE version_id = :v"
        ),
        {"v": version_id},
    )
    await db.commit()

    return DeployResponse(
        deployment_id=deployment_id,
        policy_id=policy_id,
        version_id=version_id,
        status="COMPLETED" if all_success else "PARTIAL_SUCCESS",
        platforms=platform_statuses,
    )


@router.post("", response_model=DeployResponse, status_code=202)
async def trigger_deployment(body: DeployRequest, db: AsyncSession = Depends(get_db)):
    return await execute_policy_deployment(
        body.policy_id, body.version_id, body.target_platform_ids, db
    )


@router.get("/{policy_id}/status")
async def deployment_status(policy_id: int, db: AsyncSession = Depends(get_db)):
    rows = (
        (
            await db.execute(
                text("""
            SELECT pvt.*, mp.platform_code, pv.version_number, pv.version_label
            FROM policy_version_targets pvt
            JOIN metadata_platforms mp ON mp.platform_id = pvt.platform_id
            JOIN policy_versions pv ON pv.version_id = pvt.version_id
            WHERE pv.policy_id = :p
            ORDER BY pvt.deployed_at DESC NULLS LAST, pvt.version_id DESC
        """),
                {"p": policy_id},
            )
        )
        .mappings()
        .all()
    )

    temporal_client = None
    try:
        temporal_client = await Client.connect(
            settings.TEMPORAL_HOST, namespace=settings.TEMPORAL_NAMESPACE
        )
    except Exception as exc:
        log.warning("temporal_client.connect_failed", error=str(exc))

    wf_status_cache = {}
    results = []
    for r in rows:
        item = dict(r)
        wid = item.get("temporal_workflow_id")
        if wid and temporal_client:
            if wid not in wf_status_cache:
                try:
                    handle = temporal_client.get_workflow_handle(wid)
                    desc = await handle.describe()
                    wf_status_cache[wid] = {
                        "workflow_status": desc.status.name,
                        "workflow_close_time": (
                            desc.close_time.isoformat() if desc.close_time else None
                        ),
                    }
                except Exception:
                    wf_status_cache[wid] = {
                        "workflow_status": "NOT_FOUND",
                        "workflow_close_time": None,
                    }
            item.update(wf_status_cache[wid])
        else:
            item["workflow_status"] = (
                "COMPLETED" if item.get("deployment_status") == "SUCCESS" else "PENDING"
            )
            item["workflow_close_time"] = None
        results.append(item)

    return results


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
