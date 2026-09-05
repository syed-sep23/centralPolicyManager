"""Celery Beat Scheduled Task & Worker for Periodic Platform Metadata Synchronization."""

import asyncio
from datetime import datetime, timezone
import time
from typing import Optional

import httpx
import structlog
from sqlalchemy import text

from celery_app import celery
from core.config import settings
from tasks import get_task_db

log = structlog.get_logger()

CONNECTOR_MAP = {
    "SNOWFLAKE": lambda: settings.SNOWFLAKE_CONNECTOR_URL,
    "REDSHIFT": lambda: settings.REDSHIFT_CONNECTOR_URL,
}


async def _async_sync_metadata(task_id: str, task_type: str = "CRON_BEAT", target_platform_codes: Optional[list[str]] = None) -> dict:
    """Introspects platform schemas and updates PostgreSQL catalog tables & celery_task_history."""
    start_time = time.time()
    log.info("metadata_sync.started", task_id=task_id, task_type=task_type)

    total_tables = 0
    total_columns = 0
    results_by_platform = []

    async with get_task_db() as db:
        # 1. Create running history entry
        await db.execute(
            text("""
                INSERT INTO celery_task_history (task_id, task_name, task_type, platform_code, status, started_at)
                VALUES (:tid, 'sync_platform_metadata_cron', :ttype, 'ALL', 'RUNNING', NOW())
            """),
            {"tid": task_id, "ttype": task_type},
        )
        await db.commit()

        # 2. Fetch target platforms
        if target_platform_codes:
            rows = (
                (
                    await db.execute(
                        text("SELECT * FROM metadata_platforms WHERE platform_code = ANY(:codes) AND is_active = TRUE"),
                        {"codes": target_platform_codes},
                    )
                )
                .mappings()
                .all()
            )
        else:
            rows = (
                (
                    await db.execute(
                        text("SELECT * FROM metadata_platforms WHERE is_active = TRUE ORDER BY platform_code")
                    )
                )
                .mappings()
                .all()
            )
        platforms = [dict(r) for r in rows]

        # 3. For each platform, call connector & persist metadata
        for p in platforms:
            p_code = p["platform_code"]
            p_id = p["platform_id"]
            connector_url = CONNECTOR_MAP.get(p_code, lambda: None)()
            p_start = time.time()
            p_started_at = datetime.now(timezone.utc)
            p_tables_count = 0
            p_cols_count = 0

            if not connector_url:
                continue

            try:
                async with httpx.AsyncClient(timeout=25) as client:
                    resp = await client.post(
                        f"{connector_url}/api/v1/fetch-metadata",
                        json={
                            "account_identifier": p.get("account_identifier"),
                            "host": p.get("host"),
                            "port": p.get("port"),
                            "default_database": p.get("default_database"),
                            "warehouse": p.get("warehouse"),
                            "role": p.get("role_name"),
                            "db_user": p.get("db_user"),
                            "db_password": p.get("db_password"),
                        },
                    )

                if resp.status_code != 200:
                    err_msg = resp.text
                    try:
                        res_data = resp.json()
                        err_msg = res_data.get("detail") or res_data.get("message") or err_msg
                    except Exception:
                        pass
                    raise RuntimeError(f"{p_code} Connector HTTP {resp.status_code}: {err_msg}")

                data = resp.json()
                db_name = data.get("database") or p.get("default_database") or "DEFAULT_DB"

                # Upsert metadata_databases
                await db.execute(
                    text("""
                        INSERT INTO metadata_databases (platform_id, database_name, last_synced_at)
                        VALUES (:pid, :dbname, NOW())
                        ON CONFLICT (platform_id, database_name)
                        DO UPDATE SET last_synced_at = NOW()
                    """),
                    {"pid": p_id, "dbname": db_name},
                )
                db_row = (
                    await db.execute(
                        text("SELECT database_id FROM metadata_databases WHERE platform_id = :pid AND database_name = :dbname"),
                        {"pid": p_id, "dbname": db_name},
                    )
                ).first()
                database_id = db_row.database_id if db_row else None

                # Upsert schemas, tables, columns
                for sch in data.get("schemas", []):
                    sch_name = sch["schema_name"]
                    if database_id:
                        await db.execute(
                            text("""
                                INSERT INTO metadata_schemas (database_id, schema_name, last_synced_at)
                                VALUES (:dbid, :sname, NOW())
                                ON CONFLICT (database_id, schema_name)
                                DO UPDATE SET last_synced_at = NOW()
                            """),
                            {"dbid": database_id, "sname": sch_name},
                        )
                        sch_row = (
                            await db.execute(
                                text("SELECT schema_id FROM metadata_schemas WHERE database_id = :dbid AND schema_name = :sname"),
                                {"dbid": database_id, "sname": sch_name},
                            )
                        ).first()
                        schema_id = sch_row.schema_id if sch_row else None

                        for tbl in sch.get("tables", []):
                            t_name = tbl["table_name"]
                            raw_type = str(tbl.get("table_type", "TABLE")).upper()
                            t_type = "VIEW" if "VIEW" in raw_type else "TABLE"
                            r_count = tbl.get("row_count_estimate") or tbl.get("row_count_approx") or 0
                            if schema_id:
                                await db.execute(
                                    text("""
                                        INSERT INTO metadata_tables (schema_id, table_name, table_type, row_count_estimate, last_synced_at)
                                        VALUES (:sid, :tname, :ttype, :rcount, NOW())
                                        ON CONFLICT (schema_id, table_name)
                                        DO UPDATE SET table_type = :ttype, row_count_estimate = :rcount, last_synced_at = NOW()
                                    """),
                                    {"sid": schema_id, "tname": t_name, "ttype": t_type, "rcount": r_count},
                                )
                                tbl_row = (
                                    await db.execute(
                                        text("SELECT table_id FROM metadata_tables WHERE schema_id = :sid AND table_name = :tname"),
                                        {"sid": schema_id, "tname": t_name},
                                    )
                                ).first()
                                table_id = tbl_row.table_id if tbl_row else None

                                if table_id:
                                    p_tables_count += 1
                                    for col in tbl.get("columns", []):
                                        c_name = col["column_name"]
                                        ord_pos = col.get("ordinal_position", 1)
                                        d_type = col.get("data_type", "VARCHAR")
                                        norm_type = col.get("normalized_type", "TEXT")
                                        is_pk = col.get("is_primary_key", False)
                                        await db.execute(
                                            text("""
                                                INSERT INTO metadata_columns (table_id, column_name, ordinal_position, data_type, normalized_type, is_primary_key, last_synced_at)
                                                VALUES (:tid, :cname, :pos, :dtype, :norm, :pk, NOW())
                                                ON CONFLICT (table_id, column_name)
                                                DO UPDATE SET data_type = :dtype, normalized_type = :norm, is_primary_key = :pk, last_synced_at = NOW()
                                            """),
                                            {
                                                "tid": table_id,
                                                "cname": c_name,
                                                "pos": ord_pos,
                                                "dtype": d_type,
                                                "norm": norm_type,
                                                "pk": is_pk,
                                            },
                                        )
                                        p_cols_count += 1

                # Update platform connection status
                await db.execute(
                    text("UPDATE metadata_platforms SET connection_status = 'CONNECTED', last_tested_at = NOW() WHERE platform_id = :p"),
                    {"p": p_id},
                )
                p_duration = int((time.time() - p_start) * 1000)
                p_completed_at = datetime.now(timezone.utc)

                # Insert platform-specific history record
                await db.execute(
                    text("""
                        INSERT INTO celery_task_history (task_id, task_name, task_type, platform_code, status, started_at, completed_at, duration_ms, tables_synced, columns_synced, result_summary)
                        VALUES (:tid, 'sync_platform_metadata_cron', :ttype, :pcode, 'SUCCESS', :started_at, :completed_at, :ms, :tbls, :cols, :summary)
                    """),
                    {
                        "tid": f"{task_id}-{p_code.lower()}",
                        "ttype": task_type,
                        "pcode": p_code,
                        "started_at": p_started_at,
                        "completed_at": p_completed_at,
                        "ms": p_duration,
                        "tbls": p_tables_count,
                        "cols": p_cols_count,
                        "summary": f"Synchronized {p_tables_count} tables and {p_cols_count} columns from {p_code} catalog",
                    },
                )
                await db.commit()

                total_tables += p_tables_count
                total_columns += p_cols_count
                results_by_platform.append({
                    "platform": p_code,
                    "status": "SUCCESS",
                    "tables_synced": p_tables_count,
                    "columns_synced": p_cols_count,
                    "duration_ms": p_duration,
                })
            except Exception as p_err:
                log.warning("metadata_sync.platform_failed", platform=p_code, error=str(p_err))
                await db.rollback()
                p_duration = int((time.time() - p_start) * 1000)
                p_completed_at = datetime.now(timezone.utc)
                results_by_platform.append({
                    "platform": p_code,
                    "status": "FAILED",
                    "error": str(p_err),
                })
                # Update platform connection status to FAILED in database
                await db.execute(
                    text("UPDATE metadata_platforms SET connection_status = 'FAILED', last_tested_at = NOW() WHERE platform_id = :p"),
                    {"p": p_id},
                )
                await db.execute(
                    text("""
                        INSERT INTO celery_task_history (task_id, task_name, task_type, platform_code, status, started_at, completed_at, duration_ms, tables_synced, columns_synced, error_message, result_summary)
                        VALUES (:tid, 'sync_platform_metadata_cron', :ttype, :pcode, 'FAILURE', :started_at, :completed_at, :ms, 0, 0, :err, :summary)
                    """),
                    {
                        "tid": f"{task_id}-{p_code.lower()}",
                        "ttype": task_type,
                        "pcode": p_code,
                        "started_at": p_started_at,
                        "completed_at": p_completed_at,
                        "ms": p_duration,
                        "err": str(p_err)[:500],
                        "summary": f"Failed to sync metadata from {p_code}: {str(p_err)[:200]}",
                    },
                )
                await db.commit()

        # 4. Finalize overarching history record
        total_duration = int((time.time() - start_time) * 1000)
        all_succeeded = len(results_by_platform) > 0 and all(r["status"] == "SUCCESS" for r in results_by_platform)
        final_overall_status = "SUCCESS" if all_succeeded else "FAILURE"
        summary = f"Metadata sync {final_overall_status.lower()}: {total_tables} tables and {total_columns} columns synced across {len(platforms)} platforms"
        if not all_succeeded:
            failed_names = [r["platform"] for r in results_by_platform if r["status"] == "FAILED"]
            summary += f" (Failures on: {', '.join(failed_names)})"

        await db.execute(
            text("""
                UPDATE celery_task_history
                SET status = :status, completed_at = :completed_at, duration_ms = :dur,
                    tables_synced = :tbls, columns_synced = :cols, result_summary = :sum
                WHERE task_id = :tid AND platform_code = 'ALL'
            """),
            {
                "status": final_overall_status,
                "completed_at": datetime.now(timezone.utc),
                "dur": total_duration,
                "tbls": total_tables,
                "cols": total_columns,
                "sum": summary,
                "tid": task_id,
            },
        )
        await db.commit()

    log.info("metadata_sync.finished", total_tables=total_tables, total_columns=total_columns, duration_ms=total_duration)
    return {
        "status": final_overall_status,
        "task_id": task_id,
        "tables_synced": total_tables,
        "columns_synced": total_columns,
        "duration_ms": total_duration,
        "platforms": results_by_platform,
    }


@celery.task(bind=True, name="tasks.metadata_tasks.sync_platform_metadata_cron")
def sync_platform_metadata_cron(
    self,
    task_type: str = "CRON_BEAT",
    platform_codes: Optional[list[str]] = None,
) -> dict:
    """Scheduled cron task executing metadata synchronization every 1 hour."""
    task_id = self.request.id or f"cron-{int(time.time())}"
    return asyncio.run(_async_sync_metadata(task_id=task_id, task_type=task_type, target_platform_codes=platform_codes))
