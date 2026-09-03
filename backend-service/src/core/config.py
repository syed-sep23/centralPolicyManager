"""Backend Service Configuration."""

from functools import lru_cache

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

    # Temporal Configuration
    TEMPORAL_HOST: str = "temporal:7233"
    TEMPORAL_NAMESPACE: str = "default"
    TEMPORAL_TASK_QUEUE: str = "policy-deployment"

    # Connectors
    SNOWFLAKE_CONNECTOR_URL: str = "http://snowflake-connector:8006"
    REDSHIFT_CONNECTOR_URL: str = "http://redshift-connector:8007"

    # App Settings
    ENVIRONMENT: str = "development"
    LOG_LEVEL: str = "INFO"
    CORS_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:80", "http://localhost"]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
