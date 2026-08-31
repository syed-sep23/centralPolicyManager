"""Policy Compiler & Exporter Service.

Compiles Central Policy Management (CPM) policy JSON structures into native
Snowflake DDL/SQL and Amazon Redshift DDL/SQL statements, and exports
before/after artifacts into project directory for reference.
"""
from datetime import datetime, date
import json
from pathlib import Path
from typing import Any
import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = structlog.get_logger()

# Export directory path in project workspace
EXPORT_BASE_DIR = Path("exported_policies")


async def fetch_policy_raw_payload(version_id: int, db: AsyncSession) -> dict[str, Any]:
    """Fetch complete policy version hierarchy from PostgreSQL as raw dict."""
    ver_row = (await db.execute(
        text("""
            SELECT v.*, p.policy_name, p.policy_code, p.description, p.enforce_mode, p.domain_id, p.product_id
            FROM policy_versions v
            JOIN policies p ON p.policy_id = v.policy_id
            WHERE v.version_id = :vid
        """),
        {"vid": version_id},
    )).mappings().first()
    if not ver_row:
        return {}

    rules_rows = (await db.execute(
        text("SELECT * FROM policy_rules WHERE version_id = :vid AND is_active = TRUE ORDER BY rule_order"),
        {"vid": version_id},
    )).mappings().all()

    rules = []
    for rule in rules_rows:
        rid = rule["rule_id"]
        subjects = (await db.execute(
            text("SELECT prs.*, r.role_code, r.role_name FROM policy_rule_subjects prs LEFT JOIN roles r ON r.role_id = prs.role_id WHERE prs.rule_id = :rid"),
            {"rid": rid},
        )).mappings().all()
        actions = (await db.execute(text("SELECT * FROM policy_rule_actions WHERE rule_id = :rid"), {"rid": rid})).mappings().all()
        conditions = (await db.execute(text("SELECT * FROM policy_rule_conditions WHERE rule_id = :rid"), {"rid": rid})).mappings().all()
        resources = (await db.execute(
            text("""
                SELECT prr.*, mp.platform_code, md.database_name, ms.schema_name, mt.table_name
                FROM policy_rule_resources prr
                LEFT JOIN metadata_platforms mp ON mp.platform_id = prr.platform_id
                LEFT JOIN metadata_databases md ON md.database_id = prr.database_id
                LEFT JOIN metadata_schemas ms ON ms.schema_id = prr.schema_id
                LEFT JOIN metadata_tables mt ON mt.table_id = prr.table_id
                WHERE prr.rule_id = :rid
            """),
            {"rid": rid},
        )).mappings().all()

        def _clean_dict(d: dict) -> dict:
            return {k: (v.isoformat() if isinstance(v, (datetime, date)) else v) for k, v in dict(d).items()}

        rules.append({
            "rule_id": rid,
            "rule_name": rule["rule_name"],
            "rule_description": rule["rule_description"],
            "rule_order": rule["rule_order"],
            "rule_type": rule["rule_type"],
            "effect": rule["effect"],
            "subjects": [_clean_dict(s) for s in subjects],
            "actions": [_clean_dict(a) for a in actions],
            "conditions": [_clean_dict(c) for c in conditions],
            "resources": [_clean_dict(r) for r in resources],
        })

    return {
        "policy_id": ver_row["policy_id"],
        "version_id": version_id,
        "policy_name": ver_row["policy_name"],
        "policy_code": ver_row["policy_code"],
        "enforce_mode": ver_row["enforce_mode"],
        "version_number": ver_row["version_number"],
        "version_label": ver_row["version_label"],
        "status": ver_row["status"],
        "created_at": ver_row["created_at"].isoformat() if hasattr(ver_row["created_at"], "isoformat") else str(ver_row["created_at"]),
        "rules": rules,
    }


def compile_snowflake_sql(raw_payload: dict[str, Any]) -> str:
    """Compile policy definition into native Snowflake DDL & Security Statements."""
    lines = [
        f"-- ============================================================================",
        f"-- SNOWFLAKE NATIVE SECURITY POLICY DDL",
        f"-- Policy Code: {raw_payload.get('policy_code', 'UNKNOWN')}",
        f"-- Policy Name: {raw_payload.get('policy_name', 'UNKNOWN')}",
        f"-- Version ID: {raw_payload.get('version_id')}",
        f"-- Generated At: {datetime.now().isoformat()}",
        f"-- ============================================================================",
        "",
        "USE ROLE SECURITYADMIN;",
        "",
    ]

    rules = raw_payload.get("rules", [])
    if not rules:
        lines.append("-- No active rules defined for this policy version.")
        return "\n".join(lines)

    for idx, rule in enumerate(rules, 1):
        lines.append(f"-- ─── Rule #{idx}: {rule.get('rule_name')} (Effect: {rule.get('effect')}) ─────────────────────")

        role_codes = []
        for s in rule.get("subjects", []):
            code = s.get("role_code") or (s.get("subject_type") if s.get("subject_type") != "ROLE" else None)
            if code:
                role_codes.append(f"CPM_{code.upper()}")

        resources = rule.get("resources", [])
        if not resources:
            resources = [{"database_name": "FINANCE_DB", "schema_name": "PUBLIC", "table_name": "CUSTOMER_PROFILES"}]

        for res in resources:
            db_name = res.get("database_name") or "FINANCE_DB"
            schema_name = res.get("schema_name") or "PUBLIC"
            table_name = res.get("table_name") or "CUSTOMER_PROFILES"
            full_table_path = f"{db_name}.{schema_name}.{table_name}"

            for action in rule.get("actions", []):
                act_type = action.get("action_type")

                if act_type in ("GRANT_SELECT", "GRANT_INSERT", "GRANT_UPDATE"):
                    sql_verb = "SELECT" if act_type == "GRANT_SELECT" else "INSERT" if act_type == "GRANT_INSERT" else "UPDATE"
                    for role_code in role_codes:
                        lines.append(f"GRANT USAGE ON DATABASE {db_name} TO ROLE {role_code};")
                        lines.append(f"GRANT USAGE ON SCHEMA {db_name}.{schema_name} TO ROLE {role_code};")
                        lines.append(f"GRANT {sql_verb} ON TABLE {full_table_path} TO ROLE {role_code};")

                elif act_type == "MASK_COLUMN":
                    mask_type = action.get("mask_type", "SHA256")
                    mask_col = action.get("filter_column") or "EMAIL"
                    policy_name = f"{db_name}.{schema_name}.mask_{table_name.lower()}_{mask_col.lower()}"

                    roles_cond = ", ".join([f"'{r}'" for r in role_codes]) if role_codes else "'ACCOUNTADMIN'"
                    mask_expr = "SHA2(val, 256)" if mask_type == "HASH_SHA256" else "'***MASKED***'"

                    lines.append(f"CREATE OR REPLACE MASKING POLICY {policy_name} AS (val string) RETURNS string ->")
                    lines.append(f"  CASE WHEN CURRENT_ROLE() IN ({roles_cond}) THEN val ELSE {mask_expr} END;")
                    lines.append(f"ALTER TABLE {full_table_path} MODIFY COLUMN {mask_col} SET MASKING POLICY {policy_name};")

                elif act_type == "FILTER_ROWS":
                    filter_col = action.get("filter_column") or "REGION"
                    filter_val = action.get("filter_value") or "US_EAST"
                    rap_name = f"{db_name}.{schema_name}.rap_{table_name.lower()}"

                    roles_cond = ", ".join([f"'{r}'" for r in role_codes]) if role_codes else "'ACCOUNTADMIN'"

                    lines.append(f"CREATE OR REPLACE ROW ACCESS POLICY {rap_name} AS (col_val string) RETURNS BOOLEAN ->")
                    lines.append(f"  CURRENT_ROLE() IN ({roles_cond}) AND col_val = '{filter_val}';")
                    lines.append(f"ALTER TABLE {full_table_path} ADD ROW ACCESS POLICY {rap_name} ON ({filter_col});")

        lines.append("")

    return "\n".join(lines)


def compile_redshift_sql(raw_payload: dict[str, Any]) -> str:
    """Compile policy definition into native Amazon Redshift DDL & RLS Statements."""
    lines = [
        f"-- ============================================================================",
        f"-- AMAZON REDSHIFT NATIVE SECURITY POLICY DDL",
        f"-- Policy Code: {raw_payload.get('policy_code', 'UNKNOWN')}",
        f"-- Policy Name: {raw_payload.get('policy_name', 'UNKNOWN')}",
        f"-- Version ID: {raw_payload.get('version_id')}",
        f"-- Generated At: {datetime.now().isoformat()}",
        f"-- ============================================================================",
        "",
    ]

    rules = raw_payload.get("rules", [])
    if not rules:
        lines.append("-- No active rules defined for this policy version.")
        return "\n".join(lines)

    for idx, rule in enumerate(rules, 1):
        lines.append(f"-- ─── Rule #{idx}: {rule.get('rule_name')} (Effect: {rule.get('effect')}) ─────────────────────")

        role_codes = []
        for s in rule.get("subjects", []):
            code = s.get("role_code") or (s.get("subject_type") if s.get("subject_type") != "ROLE" else None)
            if code:
                role_codes.append(f"cpm_{code.lower()}")

        resources = rule.get("resources", [])
        if not resources:
            resources = [{"database_name": "acme_dw", "schema_name": "marketing", "table_name": "customer_profiles"}]

        for res in resources:
            schema_name = (res.get("schema_name") or "public").lower()
            table_name = (res.get("table_name") or "customer_profiles").lower()
            full_table_path = f"{schema_name}.{table_name}"

            for action in rule.get("actions", []):
                act_type = action.get("action_type")

                if act_type in ("GRANT_SELECT", "GRANT_INSERT", "GRANT_UPDATE"):
                    sql_verb = "SELECT" if act_type == "GRANT_SELECT" else "INSERT" if act_type == "GRANT_INSERT" else "UPDATE"
                    for role_code in role_codes:
                        lines.append(f"GRANT USAGE ON SCHEMA {schema_name} TO ROLE {role_code};")
                        lines.append(f"GRANT {sql_verb} ON TABLE {full_table_path} TO ROLE {role_code};")

                elif act_type == "FILTER_ROWS":
                    filter_col = (action.get("filter_column") or "region").lower()
                    filter_val = action.get("filter_value") or "US_EAST"
                    policy_name = f"rls_{table_name}_{filter_col}"

                    lines.append(f"CREATE RLS POLICY {policy_name}")
                    lines.append(f"WITH ({filter_col} VARCHAR)")
                    lines.append(f"USING ({filter_col} = '{filter_val}');")

                    for role_code in role_codes:
                        lines.append(f"ATTACH RLS POLICY {policy_name} ON {full_table_path} TO ROLE {role_code};")

                elif act_type == "MASK_COLUMN":
                    mask_col = (action.get("filter_column") or "email").lower()
                    lines.append(f"-- Redshift Column Level Permissions for column: {mask_col}")
                    for role_code in role_codes:
                        lines.append(f"GRANT SELECT({mask_col}) ON {full_table_path} TO ROLE {role_code};")

        lines.append("")

    return "\n".join(lines)


async def export_and_compile_policy(policy_id: int, version_id: int, db: AsyncSession) -> dict[str, Any]:
    """Fetch policy, compile to Snowflake & Redshift SQL, and save files to disk."""
    raw_payload = await fetch_policy_raw_payload(version_id, db)
    if not raw_payload:
        raise ValueError(f"Policy version {version_id} not found in DB")

    snowflake_sql = compile_snowflake_sql(raw_payload)
    redshift_sql = compile_redshift_sql(raw_payload)

    # Create export target directory
    out_dir = EXPORT_BASE_DIR / f"policy_{policy_id}_v{version_id}"
    out_dir.mkdir(parents=True, exist_ok=True)

    json_path = out_dir / f"raw_policy_v{version_id}.json"
    sf_path = out_dir / f"snowflake_v{version_id}.sql"
    rs_path = out_dir / f"redshift_v{version_id}.sql"

    json_path.write_text(json.dumps(raw_payload, indent=2), encoding="utf-8")
    sf_path.write_text(snowflake_sql, encoding="utf-8")
    rs_path.write_text(redshift_sql, encoding="utf-8")

    # Place copies in respective connector service directories
    sf_conn_path_str = f"snowflake-connector/exported_policies/policy_{policy_id}_v{version_id}/snowflake_v{version_id}.sql"
    rs_conn_path_str = f"redshift-connector/exported_policies/policy_{policy_id}_v{version_id}/redshift_v{version_id}.sql"

    sf_target_dirs = [
        Path("snowflake-connector/exported_policies") / f"policy_{policy_id}_v{version_id}",
        Path("../snowflake-connector/exported_policies") / f"policy_{policy_id}_v{version_id}",
        Path("/app/snowflake-connector/exported_policies") / f"policy_{policy_id}_v{version_id}",
    ]
    rs_target_dirs = [
        Path("redshift-connector/exported_policies") / f"policy_{policy_id}_v{version_id}",
        Path("../redshift-connector/exported_policies") / f"policy_{policy_id}_v{version_id}",
        Path("/app/redshift-connector/exported_policies") / f"policy_{policy_id}_v{version_id}",
    ]

    for d in sf_target_dirs:
        try:
            d.mkdir(parents=True, exist_ok=True)
            (d / f"snowflake_v{version_id}.sql").write_text(snowflake_sql, encoding="utf-8")
        except Exception:
            pass

    for d in rs_target_dirs:
        try:
            d.mkdir(parents=True, exist_ok=True)
            (d / f"redshift_v{version_id}.sql").write_text(redshift_sql, encoding="utf-8")
        except Exception:
            pass

    log.info("policy_compiled_and_exported", out_dir=str(out_dir), sf_conn=sf_conn_path_str, rs_conn=rs_conn_path_str)

    return {
        "export_dir": str(out_dir),
        "raw_json_path": str(json_path),
        "snowflake_sql_path": sf_conn_path_str,
        "redshift_sql_path": rs_conn_path_str,
        "raw_payload": raw_payload,
        "snowflake_sql": snowflake_sql,
        "redshift_sql": redshift_sql,
    }
