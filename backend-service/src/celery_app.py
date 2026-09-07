from datetime import timedelta
import os
from typing import Union

from celery import Celery
from celery.schedules import crontab
import structlog

from core.config import settings

log = structlog.get_logger()

broker_url = os.getenv("CELERY_BROKER_URL", settings.CELERY_BROKER_URL)
result_backend = os.getenv("CELERY_RESULT_BACKEND", settings.CELERY_RESULT_BACKEND)

celery = Celery(
    "ces_tasks",
    broker=broker_url,
    backend=result_backend,
    include=[
        "tasks.deployment_tasks",
        "tasks.metadata_tasks",
    ],
)


def get_metadata_sync_schedule() -> Union[crontab, timedelta]:
    """
    Resolve Celery Beat schedule for periodic metadata sync from environment variables:
    1. SYNC_METADATA_CRON: Standard 5-part cron string, e.g. "0 * * * *" or "*/30 * * * *"
    2. SYNC_METADATA_INTERVAL_MINUTES: Integer minutes, e.g. 30
    3. SYNC_METADATA_INTERVAL_HOURS: Integer hours, e.g. 1 or 2 (Default: 1)
    """
    # 1. Check for standard 5-part cron expression (e.g. "0 * * * *")
    cron_str = (
        os.getenv("SYNC_METADATA_CRON")
        or getattr(settings, "SYNC_METADATA_CRON", None)
    )
    if cron_str and cron_str.strip():
        parts = cron_str.strip().split()
        if len(parts) == 5:
            log.info("celery_beat.configured_cron", cron=cron_str.strip())
            return crontab(
                minute=parts[0],
                hour=parts[1],
                day_of_month=parts[2],
                month_of_year=parts[3],
                day_of_week=parts[4],
            )
        log.warning(
            "celery_beat.invalid_cron_syntax",
            cron=cron_str,
            hint="Expected 5 fields: minute hour day month day_of_week. Falling back to interval settings.",
        )

    # 2. Check for minutes interval (e.g. SYNC_METADATA_INTERVAL_MINUTES=30)
    mins_val = (
        os.getenv("SYNC_METADATA_INTERVAL_MINUTES")
        or getattr(settings, "SYNC_METADATA_INTERVAL_MINUTES", None)
    )
    if mins_val:
        try:
            mins = int(mins_val)
            if mins > 0:
                log.info("celery_beat.configured_minutes_interval", minutes=mins)
                if mins < 60 and 60 % mins == 0:
                    return crontab(minute=f"*/{mins}")
                return timedelta(minutes=mins)
        except (ValueError, TypeError):
            pass

    # 3. Check for hours interval (e.g. SYNC_METADATA_INTERVAL_HOURS=2)
    hours_val = (
        os.getenv("SYNC_METADATA_INTERVAL_HOURS")
        or getattr(settings, "SYNC_METADATA_INTERVAL_HOURS", 1)
    )
    try:
        hours = int(hours_val)
        if hours > 1:
            log.info("celery_beat.configured_hours_interval", hours=hours)
            if 24 % hours == 0:
                return crontab(minute="0", hour=f"*/{hours}")
            return timedelta(hours=hours)
    except (ValueError, TypeError):
        pass

    # Default fallback: Every 1 hour at minute 0
    log.info("celery_beat.configured_default_hourly")
    return crontab(minute="0", hour="*")


celery.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_time_limit=3600,
    worker_prefetch_multiplier=1,
    broker_connection_retry_on_startup=True,
    beat_schedule={
        # Configurable periodic sync from environment variables
        "sync_platform_metadata_hourly_cron": {
            "task": "tasks.metadata_tasks.sync_platform_metadata_cron",
            "schedule": get_metadata_sync_schedule(),
            "kwargs": {"task_type": "CRON_BEAT"},
        },
    },
)
