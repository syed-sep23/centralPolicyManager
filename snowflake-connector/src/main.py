"""Snowflake Connector — translate, test, and apply policies as Snowflake-native constructs.

All platform credentials (account, user, password, warehouse, etc.) are passed
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

from src.compiler import SnowflakePolicyCompiler

log = structlog.get_logger()

# ─── Module-level Snowflake driver import ──────────────────────────────────────
try:
    import snowflake.connector as sf_driver

    SNOWFLAKE_DRIVER_AVAILABLE = True
except ImportError:
    sf_driver = None
    SNOWFLAKE_DRIVER_AVAILABLE = False
    log.warning("snowflake.driver_not_installed", detail="snowflake-connector-python is not installed")


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
    title="Central Entitlement Service (CES) — Snowflake Connector",
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
    account_identifier: Optional[str] = None
    warehouse: Optional[str] = None
    default_database: Optional[str] = None
    role: Optional[str] = None
    db_user: Optional[str] = None
    db_password: Optional[str] = None


class ApplyResponse(BaseModel):
    success: bool
    applied_constructs: list[str]
    skipped: bool = False
    message: str = ""


class TestConnectionPayload(BaseModel):
    account_identifier: Optional[str] = None
    warehouse: Optional[str] = None
    default_database: Optional[str] = None
    role: Optional[str] = None
    db_user: Optional[str] = None
    db_password: Optional[str] = None


# ─── Helper: Create Snowflake Connection ───────────────────────────────────────

def _create_snowflake_connection(
    account: str,
    user: str,
    password: str = "",
    warehouse: Optional[str] = None,
    database: Optional[str] = None,
    role: Optional[str] = None,
    timeout: int = 10,
):
    """Create a Snowflake connection using the snowflake-connector-python driver.

    Raises ImportError if the driver is not installed.
    Raises snowflake.connector.Error on connection failure.
    """
    if not SNOWFLAKE_DRIVER_AVAILABLE:
        raise ImportError(
            "snowflake-connector-python is not installed. "
            "Install it with: pip install snowflake-connector-python"
        )

    return sf_driver.connect(
        account=account,
        user=user,
        password=password or "",
        warehouse=warehouse or None,
        database=database or None,
        role=role or None,
        login_timeout=timeout,
    )


# ─── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "snowflake-connector",
        "driver_available": SNOWFLAKE_DRIVER_AVAILABLE,
    }


@app.post("/api/v1/test-connection")
async def test_snowflake_connection(body: TestConnectionPayload):
    """
    Live connection test to target Snowflake account.
    All credentials are passed from the backend (sourced from metadata_platforms).
    """
    start = time.time()
    account = body.account_identifier
    user = body.db_user
    password = body.db_password
    warehouse = body.warehouse
    role = body.role

    if not account or not user:
        return {
            "status": "FAILED",
            "message": "Missing required Snowflake Account Identifier or User Name.",
        }

    try:
        conn = _create_snowflake_connection(
            account=account, user=user, password=password or "",
            warehouse=warehouse, role=role, timeout=10,
        )
        cur = conn.cursor()
        cur.execute("SELECT CURRENT_VERSION(), CURRENT_WAREHOUSE(), CURRENT_ROLE();")
        row = cur.fetchone()
        cur.close()
        conn.close()

        latency = int((time.time() - start) * 1000)
        sf_version = row[0] if row else "Unknown"
        sf_wh = row[1] if row else warehouse
        sf_role = row[2] if row else role
        return {
            "status": "SUCCESS",
            "message": (
                f"Successfully authenticated to Snowflake Account [{account}] "
                f"(v{sf_version}) as User [{user}] with Role [{sf_role or 'DEFAULT'}]!"
            ),
            "latency_ms": latency,
        }
    except ImportError as ie:
        return {"status": "FAILED", "message": str(ie), "latency_ms": 0}
    except Exception as e:
        latency = int((time.time() - start) * 1000)
        err_msg = str(e)
        log.error("snowflake.test_connection_failed", error=err_msg, account=account, user=user)
        return {
            "status": "FAILED",
            "message": f"Snowflake Driver Connection Error: {err_msg}",
            "latency_ms": latency,
        }


@app.post("/api/v1/compile")
async def compile_snowflake_policy(body: dict):
    """Compile policy definition into platform-specific Snowflake SQL script.

    The `db_user` field in the payload is used as the enforcing (admin) user.
    """
    enforcing_user = body.get("db_user")
    compiler = SnowflakePolicyCompiler(enforcing_user=enforcing_user)
    return {"platform": "SNOWFLAKE", "compiled_sql": compiler.compile(body)}


@app.post("/api/v1/apply", response_model=ApplyResponse)
async def apply_policy(body: ApplyRequest):
    """
    Apply native policy DDL directly to target Snowflake account.
    All credentials are passed from the backend (sourced from metadata_platforms).
    The db_user is both the connection user and the enforcing (admin) user.
    """
    account = body.account_identifier
    user = body.db_user
    password = body.db_password
    warehouse = body.warehouse
    database = body.default_database
    role = body.role

    if not account or not user:
        return ApplyResponse(
            success=False,
            applied_constructs=[],
            message="Snowflake deployment failed: Missing account_identifier or db_user.",
        )

    # 1. Compile policy DDL using the db_user as enforcing user
    sql = body.sql_ddl
    if not sql and body.raw_policy:
        compiler = SnowflakePolicyCompiler(enforcing_user=user)
        sql = compiler.compile(body.raw_policy)

    if not sql:
        return ApplyResponse(
            success=False,
            applied_constructs=[],
            message="Snowflake deployment failed: No SQL DDL or raw_policy provided to compile.",
        )

    # 2. Connect to Snowflake using credentials from metadata_platforms
    try:
        conn = _create_snowflake_connection(
            account=account, user=user, password=password or "",
            warehouse=warehouse, database=database, role=role, timeout=15,
        )
    except ImportError as ie:
        return ApplyResponse(success=False, applied_constructs=[], message=str(ie))
    except Exception as conn_err:
        err_msg = str(conn_err)
        log.error("snowflake.apply_connection_failed", error=err_msg, account=account, user=user)
        return ApplyResponse(
            success=False,
            applied_constructs=[],
            message=f"Snowflake Connection Failed: {err_msg}",
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
            message=f"Successfully applied {len(applied_constructs)} Snowflake security policy constructs.",
        )
    except Exception as exec_err:
        err_msg = str(exec_err)
        log.error("snowflake.apply_execution_failed", error=err_msg, applied=applied_constructs)
        try:
            conn.close()
        except Exception:
            pass
        return ApplyResponse(
            success=False,
            applied_constructs=applied_constructs,
            message=f"Snowflake SQL Execution Error: {err_msg}",
        )


@app.post("/api/v1/revoke")
async def revoke_policy(body: ApplyRequest):
    return {"success": True, "revoked_constructs": []}


@app.get("/api/v1/verify/{version_id}")
async def verify_deployment(version_id: int):
    return {"verified": True}


@app.post("/api/v1/fetch-metadata")
async def fetch_snowflake_metadata(body: Optional[dict] = None):
    """
    Fetch live catalog metadata (databases, schemas, tables, columns) from Snowflake.
    All credentials are passed from the backend (sourced from metadata_platforms).
    """
    params = body or {}
    account = params.get("account_identifier")
    user = params.get("db_user")
    password = params.get("db_password")
    warehouse = params.get("warehouse")
    database = params.get("default_database")
    role = params.get("role")

    if not account or not user:
        raise HTTPException(
            status_code=400,
            detail="Missing required Snowflake credentials (account_identifier and db_user are required).",
        )

    if not database:
        raise HTTPException(
            status_code=400,
            detail="Missing required Snowflake default_database for metadata introspection.",
        )

    try:
        conn = _create_snowflake_connection(
            account=account, user=user, password=password or "",
            warehouse=warehouse, database=database, role=role, timeout=10,
        )
        cur = conn.cursor()
        cur.execute("""
            SELECT table_schema, table_name, column_name, ordinal_position, data_type
            FROM information_schema.columns
            WHERE table_schema NOT IN ('INFORMATION_SCHEMA')
            ORDER BY table_schema, table_name, ordinal_position
            LIMIT 500;
        """)
        rows = cur.fetchall()
        cur.close()
        conn.close()

        schemas = _build_schema_tree(rows)
        return {"platform": "SNOWFLAKE", "database": database, "schemas": schemas, "source": "LIVE_SNOWFLAKE"}

    except ImportError as ie:
        raise HTTPException(status_code=500, detail=str(ie))
    except Exception as exc:
        err_msg = str(exc)
        log.error("snowflake.fetch_metadata_live_failed", error=err_msg, account=account, user=user)
        raise HTTPException(
            status_code=502,
            detail=f"Snowflake Metadata Introspection Failed: {err_msg}",
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
    """Normalize a Snowflake data type to a simplified category."""
    upper = d_type.upper()
    if "CHAR" in upper or "TEXT" in upper or "STRING" in upper:
        return "TEXT"
    if "NUM" in upper or "INT" in upper or "FLOAT" in upper or "DOUBLE" in upper or "DECIMAL" in upper:
        return "NUMBER"
    if "TIME" in upper or "DATE" in upper:
        return "TIMESTAMP"
    if "BOOL" in upper:
        return "BOOLEAN"
    if "BINARY" in upper:
        return "BINARY"
    if "VARIANT" in upper or "OBJECT" in upper or "ARRAY" in upper:
        return "VARIANT"
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
