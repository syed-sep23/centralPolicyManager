"""Temporal Workflow for Periodic Metadata Syncing."""
from datetime import timedelta
from temporalio import workflow, activity

with workflow.unsafe.imports_passed_through():
    import structlog

log = structlog.get_logger()


@activity.defn
async def sync_platform_metadata_activity(platform_code: str) -> dict:
    """Simulates scanning platform schemas and updating postgres metadata tables."""
    log.info("metadata_sync.running", platform=platform_code)
    # In production, connects to platform information_schema and updates metadata_tables/metadata_columns
    return {"platform": platform_code, "synced_tables": 10, "synced_columns": 50, "status": "SUCCESS"}


@workflow.defn
class MetadataSyncCronWorkflow:
    @workflow.run
    async def run(self, platforms: list[str]) -> dict:
        sync_results = []
        for platform in platforms:
            res = await workflow.execute_activity(
                sync_platform_metadata_activity,
                platform,
                start_to_close_timeout=timedelta(seconds=120),
            )
            sync_results.append(res)
        return {"sync_results": sync_results, "status": "COMPLETED"}
