"""Celery Worker Task for Asynchronous Policy Compilation & Cloud Platform Push."""

import asyncio
from datetime import datetime, timezone
import json
import time
from typing import Optional

import httpx
import redis
import structlog
from sqlalchemy import text

from celery_app import celery
from core.config import settings
from tasks import get_task_db
from services.policy_compiler import fetch_policy_raw_payload

log = structlog.get_logger()

CONNECTOR_MAP = {
    "SNOWFLAKE": lambda: settings.SNOWFLAKE_CONNECTOR_URL,
    "REDSHIFT": lambda: settings.REDSHIFT_CONNECTOR_URL,
}


def publish_event(event_id: str, data: dict):
    """Publish a real-time event to the Redis pub/sub channel for SSE streaming."""
    try:
        r = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)
        channel = f"deployment_events:{event_id}"
        payload = json.dumps(data)
        r.publish(channel, payload)
        # Also store latest event in key with TTL for reconnection
        r.setex(f"deployment_state:{event_id}", 3600, payload)
    except Exception as exc:
        log.warning("redis_pubsub.publish_failed", event_id=event_id, error=str(exc))


async def _async_deploy_policy(
    task_id: str,
    event_id: str,
    policy_id: int,
    version_id: int,
    target_platform_ids: Optional[list[int]],
) -> dict:
    """Async execution of policy compile, connector dispatch, and DB state persistence."""
    start_time = time.time()
    log.info("deploy_task.started", task_id=task_id, event_id=event_id, policy_id=policy_id)

    # 1. Notify UI that compilation has started
    publish_event(event_id, {
        "step": "COMPILING",
        "status": "IN_PROGRESS",
        "message": "Compiling global policy into platform-specific SQL DDL constructs...",
        "event_id": event_id,
        "policy_id": policy_id,
        "version_id": version_id,
        "timestamp": time.time(),
    })

    async with get_task_db() as db:
        # Create running history entry in celery_task_history
        await db.execute(
            text("""
                INSERT INTO celery_task_history (task_id, task_name, task_type, platform_code, status, started_at)
                VALUES (:tid, 'deploy_policy_task', 'POLICY_DEPLOYMENT', 'ALL', 'RUNNING', NOW())
            """),
            {"tid": task_id},
        )
        await db.commit()

        # Fetch raw policy AST and serialize dates
        raw_ast = await fetch_policy_raw_payload(version_id, db)
        raw_payload = json.loads(json.dumps(raw_ast, default=str))

        # Query targets and their platform credentials from metadata_platforms
        if not target_platform_ids:
            rows = (
                (
                    await db.execute(
                        text(
                            """
                            SELECT pvt.platform_id, mp.platform_code, mp.account_identifier,
                                   mp.warehouse, mp.default_database, mp.role_name,
                                   mp.host, mp.port, mp.db_user, mp.db_password
                            FROM policy_version_targets pvt
                            JOIN metadata_platforms mp ON mp.platform_id = pvt.platform_id
                            WHERE pvt.version_id = :v AND mp.is_active = TRUE
                            """
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
                                """
                                SELECT platform_id, platform_code, account_identifier,
                                       warehouse, default_database, role_name,
                                       host, port, db_user, db_password
                                FROM metadata_platforms
                                WHERE is_active = TRUE
                                """
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
                            """
                            SELECT platform_id, platform_code, account_identifier,
                                   warehouse, default_database, role_name,
                                   host, port, db_user, db_password
                            FROM metadata_platforms
                            WHERE platform_id = ANY(:ids) AND is_active = TRUE
                            """
                        ),
                        {"ids": target_platform_ids},
                    )
                )
                .mappings()
                .all()
            )
            platforms = [dict(r) for r in rows]

        # Update DB targets to IN_PROGRESS with celery_task_id
        for p in platforms:
            await db.execute(
                text("""
                    INSERT INTO policy_version_targets (version_id, platform_id, deployment_status, celery_task_id)
                    VALUES (:v, :p, 'IN_PROGRESS', :tid)
                    ON CONFLICT (version_id, platform_id)
                    DO UPDATE SET deployment_status='IN_PROGRESS', celery_task_id=:tid
                """),
                {"v": version_id, "p": p["platform_id"], "tid": task_id},
            )
        await db.commit()

        # 2. Dispatch to each target connector with credentials from database
        platform_statuses = []
        for p in platforms:
            p_code = p["platform_code"]
            connector_url = CONNECTOR_MAP.get(p_code, lambda: None)()
            p_start = time.time()
            p_started_at = datetime.now(timezone.utc)

            publish_event(event_id, {
                "step": f"PUSHING_{p_code}",
                "status": "IN_PROGRESS",
                "platform": p_code,
                "message": f"Pushing native policy constructs to {p_code} connector using database credentials...",
                "event_id": event_id,
            })

            p_status = {
                "platform_id": p["platform_id"],
                "platform_code": p_code,
                "status": "PENDING",
                "error_message": None,
            }

            if connector_url:
                try:
                    async with httpx.AsyncClient(timeout=25) as client:
                        resp = await client.post(
                            f"{connector_url}/api/v1/apply",
                            json={
                                "policy_id": policy_id,
                                "version_id": version_id,
                                "platform_code": p_code,
                                "sql_ddl": "",
                                "raw_policy": raw_payload,
                                "account_identifier": p.get("account_identifier"),
                                "warehouse": p.get("warehouse"),
                                "default_database": p.get("default_database"),
                                "role": p.get("role_name"),
                                "host": p.get("host"),
                                "port": p.get("port"),
                                "db_user": p.get("db_user"),
                                "db_password": p.get("db_password"),
                            },
                        )
                    res_json = resp.json()
                    if resp.status_code == 200 and res_json.get("success"):
                        p_status["status"] = "SUCCESS"
                        constructs = res_json.get("applied_constructs") or []
                        p_status["error_message"] = res_json.get("message") or f"Successfully applied {len(constructs)} constructs on {p_code}"
                    else:
                        p_status["status"] = "FAILED"
                        p_status["error_message"] = res_json.get("message") or res_json.get("detail") or res_json.get("error") or f"Connector returned HTTP {resp.status_code}"
                except Exception as e:
                    p_status["status"] = "FAILED"
                    p_status["error_message"] = f"Connector endpoint {connector_url} offline or unreachable: {e}"
            else:
                p_status["status"] = "FAILED"
                p_status["error_message"] = f"No connector configured for platform {p_code}"

            platform_statuses.append(p_status)
            p_duration = int((time.time() - p_start) * 1000)
            p_completed_at = datetime.now(timezone.utc)

            # Persist target platform outcome
            await db.execute(
                text("""
                    UPDATE policy_version_targets
                    SET deployment_status = :s, error_message = :err, deployed_at = NOW(), celery_task_id = :tid
                    WHERE version_id = :v AND platform_id = :p
                """),
                {
                    "s": p_status["status"],
                    "err": p_status["error_message"],
                    "tid": task_id,
                    "v": version_id,
                    "p": p["platform_id"],
                },
            )

            # Log platform-level deployment to celery_task_history
            await db.execute(
                text("""
                    INSERT INTO celery_task_history (task_id, task_name, task_type, platform_code, status, started_at, completed_at, duration_ms, error_message, result_summary)
                    VALUES (:tid, 'deploy_policy_task', 'POLICY_DEPLOYMENT', :pcode, :st, :started_at, :completed_at, :ms, :err, :summary)
                """),
                {
                    "tid": f"{task_id}-{p_code.lower()}",
                    "pcode": p_code,
                    "st": "SUCCESS" if p_status["status"] == "SUCCESS" else "FAILURE",
                    "started_at": p_started_at,
                    "completed_at": p_completed_at,
                    "ms": p_duration,
                    "err": p_status["error_message"] if p_status["status"] == "FAILED" else None,
                    "summary": p_status["error_message"],
                },
            )
            await db.commit()

        total_duration = int((time.time() - start_time) * 1000)
        all_success = len(platform_statuses) > 0 and all(p["status"] == "SUCCESS" for p in platform_statuses)
        final_policy_status = "ENFORCED" if all_success else "FAILED_VALIDATION"
        version_status = "DEPLOYED" if all_success else "DRAFT"
        history_status = "SUCCESS" if all_success else "FAILURE"

        policy_code = raw_payload.get("policy_code") or str(policy_id)
        summary = f"Deployment {history_status.lower()}: pushed policy '{policy_code}' across {len(platform_statuses)} platforms"
        if not all_success:
            failed_platforms = [p['platform_code'] for p in platform_statuses if p['status'] == 'FAILED']
            summary += f" (Failures on: {', '.join(failed_platforms)})"

        # Update policy & version state
        await db.execute(
            text("UPDATE policies SET status = :s WHERE policy_id = :p"),
            {"s": final_policy_status, "p": policy_id},
        )
        await db.execute(
            text("UPDATE policy_versions SET status = :vs, deployed_at = NOW() WHERE version_id = :v"),
            {"vs": version_status, "v": version_id},
        )

        # Update overarching celery_task_history record
        await db.execute(
            text("""
                UPDATE celery_task_history
                SET status = :st, completed_at = :completed_at, duration_ms = :dur,
                    result_summary = :sum, error_message = :err
                WHERE task_id = :tid AND platform_code = 'ALL'
            """),
            {
                "st": history_status,
                "completed_at": datetime.now(timezone.utc),
                "dur": total_duration,
                "sum": summary,
                "err": None if all_success else summary,
                "tid": task_id,
            },
        )

        # Record audit event
        try:
            await db.execute(
                text("""
                    INSERT INTO audit_events (organization_id, event_type, actor_service, policy_id, policy_version_id, outcome, detail_text)
                    VALUES (1, 'POLICY_DEPLOYED', 'celery_worker', :pid, :vid, :outcome, :detail)
                """),
                {
                    "pid": policy_id,
                    "vid": version_id,
                    "outcome": "SUCCESS" if all_success else "FAILURE",
                    "detail": json.dumps({
                        "message": summary,
                        "platforms": platform_statuses,
                        "celery_task_id": task_id,
                        "all_success": all_success,
                    }),
                },
            )
        except Exception as audit_exc:
            log.warning("audit_events.record_failed", error=str(audit_exc))

        await db.commit()

        # 3. IMMEDIATELY inform UI that deployment has completed
        completion_data = {
            "step": "COMPLETED",
            "status": "SUCCESS" if all_success else "FAILED",
            "message": summary,
            "event_id": event_id,
            "policy_id": policy_id,
            "version_id": version_id,
            "celery_task_id": task_id,
            "platforms": platform_statuses,
            "timestamp": time.time(),
        }
        publish_event(event_id, completion_data)
        log.info("deploy_task.completed", task_id=task_id, event_id=event_id, all_success=all_success)
        return completion_data


@celery.task(bind=True, name="tasks.deployment_tasks.deploy_policy_task")
def deploy_policy_task(
    self,
    event_id: str,
    policy_id: int,
    version_id: int,
    target_platform_ids: Optional[list[int]] = None,
) -> dict:
    """Synchronous Celery task wrapper calling the async deployment pipeline."""
    task_id = self.request.id or f"task-{int(time.time())}"
    try:
        return asyncio.run(
            _async_deploy_policy(
                task_id=task_id,
                event_id=event_id,
                policy_id=policy_id,
                version_id=version_id,
                target_platform_ids=target_platform_ids,
            )
        )
    except Exception as exc:
        log.exception("deploy_task.failed_unhandled", task_id=task_id, event_id=event_id, error=str(exc))
        try:
            async def _mark_failed():
                async with get_task_db() as db:
                    await db.execute(
                        text("UPDATE celery_task_history SET status = 'FAILURE', completed_at = NOW(), error_message = :err WHERE task_id = :tid AND status = 'RUNNING'"),
                        {"err": str(exc), "tid": task_id},
                    )
                    await db.commit()
            asyncio.run(_mark_failed())
        except Exception:
            pass
        fail_payload = {
            "step": "FAILED",
            "status": "FAILED",
            "message": f"Celery worker deployment error: {exc}",
            "event_id": event_id,
            "policy_id": policy_id,
            "version_id": version_id,
            "celery_task_id": task_id,
            "timestamp": time.time(),
        }
        publish_event(event_id, fail_payload)
        raise exc
