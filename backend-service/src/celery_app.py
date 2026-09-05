"""Celery Application Initialization & Beat Scheduling."""

import os
from celery import Celery
from celery.schedules import crontab

from core.config import settings

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
        # Scheduled cron job every 1 hour to fetch metadata from Snowflake and Redshift
        "sync_platform_metadata_hourly_cron": {
            "task": "tasks.metadata_tasks.sync_platform_metadata_cron",
            "schedule": crontab(minute="0", hour="*"),  # Exactly every hour
            "kwargs": {"task_type": "CRON_BEAT"},
        },
    },
)
