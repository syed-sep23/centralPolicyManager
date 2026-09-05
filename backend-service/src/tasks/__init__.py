"""Celery Tasks Package."""

from contextlib import asynccontextmanager
from typing import AsyncGenerator
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from sqlalchemy.pool import NullPool
from core.config import settings


@asynccontextmanager
async def get_task_db() -> AsyncGenerator[AsyncSession, None]:
    """Provides an isolated AsyncSession with NullPool for Celery worker processes."""
    engine = create_async_engine(settings.DATABASE_URL, echo=False, poolclass=NullPool)
    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    async with session_factory() as session:
        try:
            yield session
        finally:
            await engine.dispose()
