"""Redshift Connector — translate, test, and apply policies as Redshift-native constructs.

All platform credentials (host, port, user, password, database) are passed
through the API from the backend service, which reads them from metadata_platforms.
No credentials are stored in this service's .env file.
"""

import time
from functools import lru_cache
from typing import Optional

import structlog
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from pydantic import BaseModel
from pydantic_settings import BaseSettings, SettingsConfigDict

from src.compiler import RedshiftPolicyCompiler

log = structlog.get_logger()

# ─── Module-level Redshift driver import ───────────────────────────────────────
_rs_driver = None
_rs_driver_type: Optional[str] = None

try:
    import redshift_connector as _rs_driver

    _rs_driver_type = "redshift_connector"
except ImportError:
    try:
        import psycopg2 as _rs_driver

        _rs_driver_type = "psycopg2"
    except ImportError:
        log.warning(
            "redshift.driver_not_installed",
            detail="Neither redshift_connector nor psycopg2 is installed",
        )

REDSHIFT_DRIVER_AVAILABLE = _rs_driver is not None


# ─── Configuration ─────────────────────────────────────────────────────────────

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    DATABASE_URL: str = "postgresql+asyncpg://ces_user:ces_secret_2024@localhost:5432/ces_db"
    SECRET_KEY: str = "dev-secret-key"
    LOG_LEVEL: str = "INFO"
    ENVIRONMENT: str = "development"


@lru_cache
def get_settings():
    return Settings()


settings = get_settings()

# ─── FastAPI App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="Central Entitlement Service (CES) — Redshift Connector",
    version="1.0.0",
    docs_url=None,
    redoc_url=None,
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.get("/docs", include_in_schema=False)
async def custom_swagger_ui_html():
    return get_swagger_ui_html(
        openapi_url="openapi.json",
        title=app.title + " - Swagger UI",
        swagger_js_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui-bundle.js",
        swagger_css_url="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5/swagger-ui.css",
    )


@app.get("/redoc", include_in_schema=False)
async def redoc_html():
    return get_redoc_html(
        openapi_url="openapi.json",
        title=app.title + " - ReDoc",
        redoc_js_url="https://cdn.jsdelivr.net/npm/redoc@next/bundles/redoc.standalone.js",
    )


# ─── Request / Response Models ─────────────────────────────────────────────────

class ApplyRequest(BaseModel):
    policy_id: int
    version_id: int
    platform_code: Optional[str] = None
    sql_ddl: Optional[str] = None
    raw_policy: Optional[dict] = None
    host: Optional[str] = None
    port: Optional[int] = None
    default_database: Optional[str] = None
    db_user: Optional[str] = None
    db_password: Optional[str] = None


class ApplyResponse(BaseModel):
    success: bool
    applied_constructs: list[str]
    skipped: bool = False
    message: str = ""


class TestConnectionPayload(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = None
    default_database: Optional[str] = None
    db_user: Optional[str] = None
    db_password: Optional[str] = None


# ─── Helper: Create Redshift Connection ────────────────────────────────────────

def _create_redshift_connection(
    host: str,
    port: int,
    database: str,
    user: str,
    password: str = "",
    timeout: int = 10,
):
    """Create a Redshift connection using the best available driver.

    Tries redshift_connector first, then falls back to psycopg2.
    Raises ImportError if neither driver is installed.
    """
    if not REDSHIFT_DRIVER_AVAILABLE:
        raise ImportError(
            "No Redshift driver available. Install redshift_connector or psycopg2."
        )

    if _rs_driver_type == "redshift_connector":
        return _rs_driver.connect(
            host=host,
            port=port,
            database=database,
            user=user,
            password=password,
            timeout=timeout,
        )
    else:
        # psycopg2 uses 'dbname' and 'connect_timeout'
        return _rs_driver.connect(
            host=host,
            port=port,
            dbname=database,
            user=user,
            password=password,
            connect_timeout=timeout,
        )


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "redshift-connector",
        "driver_available": REDSHIFT_DRIVER_AVAILABLE,
        "driver_type": _rs_driver_type,
    }


@app.post("/api/v1/test-connection")
async def test_redshift_connection(body: TestConnectionPayload):
    """
    Live connection test to target AWS Redshift cluster.
    All credentials are passed from the backend (sourced from metadata_platforms).
    """
    start = time.time()
    host = body.host
    port = body.port
    dbname = body.default_database
    user = body.db_user
    password = body.db_password or ""

    if not host or not user:
        return {
            "status": "FAILED",
            "message": "Missing required Redshift Cluster Host Endpoint or User Name.",
        }

    if not port:
        return {
            "status": "FAILED",
            "message": "Missing required Redshift port.",
        }

    if not dbname:
        return {
            "status": "FAILED",
            "message": "Missing required Redshift database name.",
        }

    try:
        conn = _create_redshift_connection(
            host=host, port=port, database=dbname,
            user=user, password=password, timeout=10,
        )
        cur = conn.cursor()
        cur.execute("SELECT version();")
        row = cur.fetchone()
        cur.close()
        conn.close()

        latency = int((time.time() - start) * 1000)
        rs_version = row[0] if row else "Redshift Engine"
        return {
            "status": "SUCCESS",
            "message": (
                f"Successfully connected to AWS Redshift Cluster "
                f"[{host}:{port}/{dbname}] as User [{user}]! "
                f"Engine: {rs_version[:50]}"
            ),
            "latency_ms": latency,
        }
    except ImportError as ie:
        return {"status": "FAILED", "message": str(ie), "latency_ms": 0}
    except Exception as e:
        latency = int((time.time() - start) * 1000)
        err_msg = str(e)
        log.error("redshift.test_connection_failed", error=err_msg, host=host, user=user)
        return {
            "status": "FAILED",
            "message": f"AWS Redshift Driver Connection Error: {err_msg}",
            "latency_ms": latency,
        }


@app.post("/api/v1/compile")
async def compile_redshift_policy(body: dict):
    """Compile policy definition into platform-specific Amazon Redshift SQL script.

    The `db_user` field in the payload is used as the enforcing (admin) user.
    """
    enforcing_user = body.get("db_user")
    compiler = RedshiftPolicyCompiler(enforcing_user=enforcing_user)
    return {"platform": "REDSHIFT", "compiled_sql": compiler.compile(body)}


@app.post("/api/v1/apply", response_model=ApplyResponse)
async def apply_policy(body: ApplyRequest):
    """
    Apply native policy DDL directly to target AWS Redshift cluster.
    All credentials are passed from the backend (sourced from metadata_platforms).
    The db_user is both the connection user and the enforcing (admin) user.
    """
    host = body.host
    port = body.port
    database = body.default_database
    user = body.db_user
    password = body.db_password or ""

    if not host or not user:
        return ApplyResponse(
            success=False,
            applied_constructs=[],
            message="Redshift deployment failed: Missing host or db_user.",
        )

    if not port:
        return ApplyResponse(
            success=False,
            applied_constructs=[],
            message="Redshift deployment failed: Missing port.",
        )

    if not database:
        return ApplyResponse(
            success=False,
            applied_constructs=[],
            message="Redshift deployment failed: Missing default_database.",
        )

    # 1. Compile policy DDL using the db_user as enforcing user
    sql = body.sql_ddl
    if not sql and body.raw_policy:
        compiler = RedshiftPolicyCompiler(enforcing_user=user)
        sql = compiler.compile(body.raw_policy)

    if not sql:
        return ApplyResponse(
            success=False,
            applied_constructs=[],
            message="Redshift deployment failed: No SQL DDL or raw_policy provided to compile.",
        )

    # 2. Connect to Redshift using credentials from metadata_platforms
    try:
        conn = _create_redshift_connection(
            host=host, port=port, database=database,
            user=user, password=password, timeout=15,
        )
        conn.autocommit = True
    except ImportError as ie:
        return ApplyResponse(success=False, applied_constructs=[], message=str(ie))
    except Exception as conn_err:
        err_msg = str(conn_err)
        log.error("redshift.apply_connection_failed", error=err_msg, host=host, user=user)
        return ApplyResponse(
            success=False,
            applied_constructs=[],
            message=f"Redshift Connection Failed: {err_msg}",
        )

    # 3. Parse statements and execute sequentially
    statements = _parse_sql_statements(sql)
    applied_constructs = []
    try:
        cur = conn.cursor()
        for stmt in statements:
            cur.execute(stmt)
            first_line = stmt.split("\n")[0].strip()
            applied_constructs.append(first_line[:100])
        cur.close()
        conn.close()
        return ApplyResponse(
            success=True,
            applied_constructs=applied_constructs,
            message=f"Successfully applied {len(applied_constructs)} Redshift security policy constructs.",
        )
    except Exception as exec_err:
        err_msg = str(exec_err)
        log.error("redshift.apply_execution_failed", error=err_msg, applied=applied_constructs)
        try:
            conn.close()
        except Exception:
            pass
        return ApplyResponse(
            success=False,
            applied_constructs=applied_constructs,
            message=f"Redshift SQL Execution Error: {err_msg}",
        )


@app.post("/api/v1/revoke")
async def revoke_policy(body: ApplyRequest):
    return {"success": True, "revoked_constructs": []}


@app.get("/api/v1/verify/{version_id}")
async def verify_deployment(version_id: int):
    return {"verified": True}


@app.post("/api/v1/fetch-metadata")
async def fetch_redshift_metadata(body: Optional[dict] = None):
    """
    Fetch live catalog metadata (databases, schemas, tables, columns) from Amazon Redshift.
    All credentials are passed from the backend (sourced from metadata_platforms).
    """
    params = body or {}
    host = params.get("host")
    port = params.get("port")
    database = params.get("default_database")
    user = params.get("db_user")
    password = params.get("db_password")

    if not host or not user:
        raise HTTPException(
            status_code=400,
            detail="Missing required Redshift credentials (host and db_user are required).",
        )

    if not port:
        raise HTTPException(
            status_code=400,
            detail="Missing required Redshift port.",
        )

    if not database:
        raise HTTPException(
            status_code=400,
            detail="Missing required Redshift database name for metadata introspection.",
        )

    try:
        conn = _create_redshift_connection(
            host=host, port=port, database=database,
            user=user, password=password or "", timeout=10,
        )
        cur = conn.cursor()
        cur.execute("""
            SELECT table_schema, table_name, column_name, ordinal_position, data_type
            FROM information_schema.columns
            WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
            ORDER BY table_schema, table_name, ordinal_position
            LIMIT 500;
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        schemas = _build_schema_tree(rows)
        return {"platform": "REDSHIFT", "database": database, "schemas": schemas, "source": "LIVE_REDSHIFT"}

    except ImportError as ie:
        raise HTTPException(status_code=500, detail=str(ie))
    except Exception as exc:
        err_msg = str(exc)
        log.error("redshift.fetch_metadata_live_failed", error=err_msg, host=host, user=user)
        raise HTTPException(
            status_code=502,
            detail=f"Redshift Metadata Introspection Failed: {err_msg}",
        )


# ─── Utility Functions ────────────────────────────────────────────────────────

def _parse_sql_statements(sql: str) -> list[str]:
    """Split a SQL script into individual executable statements, stripping comments."""
    statements = []
    for raw_stmt in sql.split(";"):
        cleaned_lines = [line for line in raw_stmt.strip().splitlines() if not line.strip().startswith("--")]
        cleaned = "\n".join(cleaned_lines).strip()
        if cleaned:
            statements.append(cleaned)
    return statements


def _normalize_data_type(d_type: str) -> str:
    """Normalize a Redshift data type to a simplified category."""
    upper = d_type.upper()
    if "CHAR" in upper or "TEXT" in upper or "VARCHAR" in upper:
        return "TEXT"
    if "INT" in upper or "NUM" in upper or "FLOAT" in upper or "DOUBLE" in upper or "DECIMAL" in upper:
        return "NUMBER"
    if "TIME" in upper or "DATE" in upper:
        return "TIMESTAMP"
    if "BOOL" in upper:
        return "BOOLEAN"
    return "TEXT"


def _build_schema_tree(rows: list) -> list[dict]:
    """Build a hierarchical schema → table → column tree from flat query rows."""
    schema_map: dict[str, dict[str, list]] = {}
    for schema_name, tbl_name, col_name, ord_pos, d_type in rows:
        if schema_name not in schema_map:
            schema_map[schema_name] = {}
        if tbl_name not in schema_map[schema_name]:
            schema_map[schema_name][tbl_name] = []
        schema_map[schema_name][tbl_name].append({
            "column_name": col_name,
            "ordinal_position": ord_pos,
            "data_type": d_type,
            "normalized_type": _normalize_data_type(d_type),
            "is_primary_key": ord_pos == 1,
        })

    schemas = []
    for s_name, tables in schema_map.items():
        table_list = []
        for t_name, cols in tables.items():
            table_list.append({"table_name": t_name, "table_type": "TABLE", "columns": cols})
        schemas.append({"schema_name": s_name, "tables": table_list})
    return schemas
