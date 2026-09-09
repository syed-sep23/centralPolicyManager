"""Backend Service Configuration."""

from functools import lru_cache
from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://ces_user:ces_secret_2024@postgresql:5432/ces_db"

    # JWT Auth
    SECRET_KEY: str = "dev-secret-key-change-in-production-at-least-32-chars"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # OPA Service URL
    OPA_URL: str = "http://opa:8181"

    # Celery & Redis Distributed Task Queue
    CELERY_BROKER_URL: str = "redis://redis:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/0"
    REDIS_URL: str = "redis://redis:6379/0"
    SYNC_METADATA_INTERVAL_HOURS: int = 1
    SYNC_METADATA_INTERVAL_MINUTES: Optional[int] = None
    SYNC_METADATA_CRON: Optional[str] = None

    # Connectors
    SNOWFLAKE_CONNECTOR_URL: str = "http://snowflake-connector:8006"
    REDSHIFT_CONNECTOR_URL: str = "http://redshift-connector:8007"
    SNOWFLAKE_URL: Optional[str] = None
    REDSHIFT_URL: Optional[str] = None

    def model_post_init(self, __context) -> None:
        if not self.SNOWFLAKE_URL:
            self.SNOWFLAKE_URL = self.SNOWFLAKE_CONNECTOR_URL
        if not self.REDSHIFT_URL:
            self.REDSHIFT_URL = self.REDSHIFT_CONNECTOR_URL

    def __getitem__(self, key: str):
        if not isinstance(key, str):
            return None
        key_upper = key.upper()
        if hasattr(self, key_upper):
            val = getattr(self, key_upper)
            if val is not None:
                return val
        if key_upper.endswith("_URL") and not key_upper.endswith("_CONNECTOR_URL"):
            alt = key_upper[:-4] + "_CONNECTOR_URL"
            if hasattr(self, alt):
                return getattr(self, alt)
        elif key_upper.endswith("_CONNECTOR_URL"):
            alt = key_upper[:-14] + "_URL"
            if hasattr(self, alt):
                return getattr(self, alt)
        return None

    def get(self, key: str, default=None):
        val = self[key]
        return val if val is not None else default

    # App Settings
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:80", "http://localhost"]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
