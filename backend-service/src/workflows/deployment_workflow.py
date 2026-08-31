"""Temporal Workflow for Policy Deployment, Compilation & Execution."""
from datetime import timedelta
from temporalio import workflow, activity
from temporalio.common import RetryPolicy

with workflow.unsafe.imports_passed_through():
    import httpx
    import structlog
    from src.db.session import AsyncSessionLocal
    from src.services.policy_compiler import export_and_compile_policy

log = structlog.get_logger()

# Temporal Retry Policy: Try 3 times with exponential backoff on failure
activity_retry_policy = RetryPolicy(
    initial_interval=timedelta(seconds=2),
    backoff_coefficient=2.0,
    maximum_interval=timedelta(seconds=10),
    maximum_attempts=3,
)


@activity.defn
async def compile_policy_activity(params: dict) -> dict:
    """Activity that compiles raw policy into Snowflake & Redshift DDL in memory."""
    policy_id = params["policy_id"]
    version_id = params["version_id"]
    async with AsyncSessionLocal() as db:
        res = await export_and_compile_policy(policy_id, version_id, db)
        return {
            "snowflake_sql": res["snowflake_sql"],
            "redshift_sql": res["redshift_sql"],
            "raw_payload": res["raw_payload"],
        }


@activity.defn
async def deploy_to_platform_activity(params: dict) -> dict:
    """Activity that sends compiled deploy requests to platform connectors (retries 3 times on failure)."""
    connector_url = params.get("connector_url")
    platform_code = params["platform_code"]
    policy_id = params["policy_id"]
    version_id = params["version_id"]
    sql_ddl = params.get("sql_ddl", "")
    raw_policy = params.get("raw_policy", {})

    if not connector_url:
        return {
            "platform_code": platform_code,
            "status": "NO_CONNECTOR",
            "message": f"No connector configured for {platform_code}",
        }

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{connector_url}/api/v1/apply",
                json={
                    "policy_id": policy_id,
                    "version_id": version_id,
                    "platform_code": platform_code,
                    "sql_ddl": sql_ddl,
                    "raw_policy": raw_policy,
                },
            )
            result = resp.json()
            if resp.status_code == 200 and result.get("success"):
                return {
                    "platform_code": platform_code,
                    "status": "SUCCESS",
                    "result": result,
                    "message": result.get("message") or f"Successfully applied native {platform_code} DDL",
                }
            else:
                err_msg = result.get("error") or result.get("message") or f"Connector returned HTTP {resp.status_code}"
                # Raise RuntimeError to trigger Temporal RetryPolicy (up to 3 attempts)
                raise RuntimeError(f"Connector failure on {platform_code}: {err_msg}")
    except httpx.ConnectError as exc:
        log.warning("connector.deploy_unreachable", platform=platform_code, error=str(exc))
        # Raise RuntimeError to trigger Temporal RetryPolicy (up to 3 attempts)
        raise RuntimeError(f"Connector endpoint {connector_url} offline/unreachable: {exc}")


@workflow.defn
class PolicyDeploymentWorkflow:
    @workflow.run
    async def run(self, payload: dict) -> dict:
        policy_id = payload["policy_id"]
        version_id = payload["version_id"]
        targets = payload.get("targets", [])

        # 1. Compile policy JSON to native Snowflake & Redshift DDL SQL
        compile_res = await workflow.execute_activity(
            compile_policy_activity,
            {"policy_id": policy_id, "version_id": version_id},
            start_to_close_timeout=timedelta(seconds=30),
            retry_policy=activity_retry_policy,
        )

        # 2. Deploy to each target platform connector with Retry Policy (3 attempts)
        results = []
        failed_errors = []

        for target in targets:
            platform_code = target["platform_code"]
            sql_ddl = compile_res["snowflake_sql"] if platform_code == "SNOWFLAKE" else compile_res["redshift_sql"]

            target_payload = {
                **target,
                "sql_ddl": sql_ddl,
                "raw_policy": compile_res["raw_payload"],
            }

            try:
                res = await workflow.execute_activity(
                    deploy_to_platform_activity,
                    target_payload,
                    start_to_close_timeout=timedelta(seconds=45),
                    retry_policy=activity_retry_policy,
                )
                results.append(res)
            except Exception as err:
                err_msg = f"Failed after 3 attempts: {err}"
                failed_errors.append(err_msg)
                results.append({
                    "platform_code": platform_code,
                    "status": "FAILED",
                    "error": err_msg,
                    "message": err_msg,
                })

        if failed_errors:
            # Mark Temporal Workflow as FAILED if any connector deployment failed 3 times
            raise RuntimeError(f"Workflow execution failed after 3 retry attempts: {'; '.join(failed_errors)}")

        return {
            "policy_id": policy_id,
            "version_id": version_id,
            "results": results,
            "overall_status": "COMPLETED",
        }
