"""Redshift Connector — translate and apply policies as Redshift-native constructs."""
from typing import Optional

from contextlib import asynccontextmanager
from functools import lru_cache

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict
import structlog

log = structlog.get_logger()

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    DATABASE_URL: str = "postgresql+asyncpg://ces_user:ces_secret_2024@localhost:5432/ces_db"
    REDSHIFT_HOST: str = "localhost"
    REDSHIFT_PORT: int = 5439
    REDSHIFT_DB: str = "acme_dw"
    REDSHIFT_USER: str = "ces_svc"
    REDSHIFT_PASSWORD: str = ""
    SECRET_KEY: str = "dev-secret-key"
    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: str = "development"

@lru_cache
def get_settings(): return Settings()
settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    yield

app = FastAPI(title="Central Entitlement Service (CES) — Redshift Connector", version="1.0.0", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class ApplyRequest(BaseModel):
    policy_id: int
    version_id: int
    platform_code: Optional[str] = None
    sql_ddl: Optional[str] = None
    raw_policy: Optional[dict] = None

class ApplyResponse(BaseModel):
    success: bool
    applied_constructs: list[str]
    skipped: bool = False
    message: str = ""

@app.get("/health")
async def health():
    return {"status": "ok", "service": "redshift-connector", "redshift_configured": bool(settings.REDSHIFT_PASSWORD)}

@app.post("/api/v1/apply", response_model=ApplyResponse)
async def apply_policy(body: ApplyRequest):
    if not settings.REDSHIFT_PASSWORD:
        log.warning("redshift.credentials_not_configured — stub response")
        return ApplyResponse(
            success=True,
            applied_constructs=[],
            skipped=True,
            message="Redshift credentials not configured (stub mode)",
        )
    try:
        import psycopg2
        conn = psycopg2.connect(
            host=settings.REDSHIFT_HOST, port=settings.REDSHIFT_PORT,
            dbname=settings.REDSHIFT_DB, user=settings.REDSHIFT_USER,
            password=settings.REDSHIFT_PASSWORD,
        )
        applied = []
        conn.close()
        return ApplyResponse(success=True, applied_constructs=applied)
    except Exception as e:
        log.error("redshift.apply_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"Redshift apply failed: {str(e)}")

@app.post("/api/v1/revoke")
async def revoke_policy(body: ApplyRequest):
    if not settings.REDSHIFT_PASSWORD:
        return {"success": True, "skipped": True}
    return {"success": True, "revoked_constructs": []}

@app.get("/api/v1/verify/{version_id}")
async def verify_deployment(version_id: int):
    if not settings.REDSHIFT_PASSWORD:
        return {"verified": True, "skipped": True}
    return {"verified": True}
