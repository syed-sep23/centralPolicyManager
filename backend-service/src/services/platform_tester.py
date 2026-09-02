"""
Unified Universal Database Driver Engine — Live Connection Testing Module.
Uses SQLAlchemy & standard DBAPI drivers to test live database authentication
and query execution across all cloud data platforms.
"""
import time
import urllib.parse
from typing import Dict, Any, Tuple
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
import structlog

log = structlog.get_logger()


def test_db_connection(platform_code: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """
    Attempt live authentication and diagnostic query execution using SQLAlchemy & DBAPI drivers.
    Returns standardized status dict:
    {
      "status": "SUCCESS" | "FAILED",
      "message": "...",
      "latency_ms": 12
    }
    """
    start_time = time.time()
    code = (platform_code or "").upper().strip()

    # Extract connection parameters
    account = params.get("account_identifier", "").strip()
    host = params.get("host", "").strip()
    port = params.get("port")
    db_name = params.get("default_database", "").strip()
    user = params.get("db_user", "").strip()
    password = params.get("db_password", "").strip()
    warehouse = params.get("warehouse", "").strip()
    role = params.get("role", "").strip()
    http_path = params.get("http_path", "").strip()

    if not code:
        return {"status": "FAILED", "message": "Missing platform driver code."}

    # Validate required minimum fields
    if "SNOWFLAKE" in code:
        if not account or not user:
            return {"status": "FAILED", "message": "Snowflake requires Account Identifier and User Name."}
    elif any(k in code for k in ["REDSHIFT", "POSTGRES", "TRINO", "DATABRICKS"]):
        if not host or not user:
            return {"status": "FAILED", "message": f"{code} requires Host/Endpoint and User Name."}

    engine_url, test_sql = _build_sqlalchemy_url(
        code=code,
        account=account,
        host=host,
        port=port,
        db_name=db_name,
        user=user,
        password=password,
        warehouse=warehouse,
        role=role,
        http_path=http_path,
    )

    try:
        # Build SQLAlchemy engine with strict connection timeout
        engine = create_engine(
            engine_url,
            pool_pre_ping=True,
            connect_args=_get_connect_args(code),
        )

        with engine.connect() as conn:
            result = conn.execute(text(test_sql))
            row = result.fetchone()
            version_info = row[0] if row else "Connected"

        engine.dispose()
        latency = int((time.time() - start_time) * 1000)

        return {
            "status": "SUCCESS",
            "message": f"Successfully connected to {code} [{account or host or 'Database'}]. Engine response: {str(version_info)[:60]}",
            "latency_ms": latency,
        }

    except SQLAlchemyError as err:
        latency = int((time.time() - start_time) * 1000)
        # Extract underlying DBAPI exception message
        raw_msg = str(err.orig) if hasattr(err, "orig") and err.orig else str(err)
        log.error("platform_tester.connection_failed", platform_code=code, error=raw_msg)
        return {
            "status": "FAILED",
            "message": f"{code} Connection Failed: {_clean_error_message(raw_msg)}",
            "latency_ms": latency,
        }
    except Exception as err:
        latency = int((time.time() - start_time) * 1000)
        raw_msg = str(err)
        log.error("platform_tester.generic_error", platform_code=code, error=raw_msg)
        return {
            "status": "FAILED",
            "message": f"{code} Driver Error: {_clean_error_message(raw_msg)}",
            "latency_ms": latency,
        }


def _build_sqlalchemy_url(
    code: str,
    account: str,
    host: str,
    port: Any,
    db_name: str,
    user: str,
    password: str,
    warehouse: str,
    role: str,
    http_path: str,
) -> Tuple[str, str]:
    """Construct standard SQLAlchemy connection URL string and diagnostic test query."""
    enc_user = urllib.parse.quote_plus(user)
    enc_pass = urllib.parse.quote_plus(password)
    db_path = f"/{db_name}" if db_name else ""

    if "SNOWFLAKE" in code:
        # snowflake://<user>:<password>@<account_identifier>/<database>?warehouse=<wh>&role=<role>
        query_params = []
        if warehouse:
            query_params.append(f"warehouse={urllib.parse.quote_plus(warehouse)}")
        if role:
            query_params.append(f"role={urllib.parse.quote_plus(role)}")
        
        q_str = f"?{'&'.join(query_params)}" if query_params else ""
        url = f"snowflake://{enc_user}:{enc_pass}@{account}{db_path}{q_str}"
        test_sql = "SELECT CURRENT_VERSION();"

    elif "REDSHIFT" in code or "POSTGRES" in code:
        p = port or (5439 if "REDSHIFT" in code else 5432)
        url = f"postgresql+psycopg2://{enc_user}:{enc_pass}@{host}:{p}{db_path}"
        test_sql = "SELECT version();"

    elif "TRINO" in code:
        p = port or 8080
        url = f"trino://{enc_user}:{enc_pass}@{host}:{p}{db_path}"
        test_sql = "SELECT version();"

    else:
        p = port or 5432
        url = f"postgresql+psycopg2://{enc_user}:{enc_pass}@{host}:{p}{db_path}"
        test_sql = "SELECT 1;"

    return url, test_sql


def _get_connect_args(code: str) -> Dict[str, Any]:
    """Return platform-specific connection timeout and socket parameters."""
    if "SNOWFLAKE" in code:
        return {"login_timeout": 8}
    elif "REDSHIFT" in code or "POSTGRES" in code:
        return {"connect_timeout": 8}
    return {"connect_timeout": 8}


def _clean_error_message(raw_msg: str) -> str:
    """Format driver stacktrace into clear user-facing error sentence."""
    if "Connection refused" in raw_msg:
        return "Connection Refused: Target server host endpoint is unreachable or port is blocked by firewall."
    if "password authentication failed" in raw_msg:
        return "Authentication Failed: Incorrect username or password."
    if "250001 (08001)" in raw_msg or "Incorrect username or password" in raw_msg:
        return "Snowflake Authentication Failed: Incorrect Account Identifier, User, or Password."
    if "could not translate host name" in raw_msg or "Name or service not known" in raw_msg:
        return "DNS Lookup Failed: Invalid server hostname endpoint."
    
    # Trim overly verbose Python traceback prefixes
    cleaned = raw_msg.replace("psycopg2.OperationalError: ", "").replace("(psycopg2.OperationalError) ", "")
    cleaned = cleaned.replace("snowflake.connector.errors.DatabaseError: ", "")
    return cleaned.strip()
