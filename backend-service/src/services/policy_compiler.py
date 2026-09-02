"""Policy Compiler & Exporter Service.

Compiles Central Entitlement Service (CES) policy JSON structures into native
Snowflake DDL/SQL and Amazon Redshift DDL/SQL statements, and exports
before/after artifacts into project directory for reference.
"""
from datetime import datetime, date
import json
from pathlib import Path
from typing import Any, Optional
import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = structlog.get_logger()



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


def get_snowflake_mask_expr(mask_type: str, custom_expr: Optional[str] = None) -> str:
    if mask_type == "HASH_SHA256":
        return "SHA2(val, 256)"
    elif mask_type == "EMAIL_REDACT":
        return "REGEXP_REPLACE(val, '^(.{2})(.*)(@.*)$', '\\\\1****\\\\3')"
    elif mask_type == "PARTIAL_4_DIGITS":
        return "CONCAT('****-****-****-', RIGHT(val, 4))"
    elif mask_type == "NULLIFY":
        return "NULL"
    elif mask_type == "CUSTOM" and custom_expr:
        return custom_expr
    return "'***MASKED***'"


def get_redshift_mask_expr(mask_type: str, custom_expr: Optional[str] = None) -> str:
    if mask_type == "HASH_SHA256":
        return "SHA2(val, 256)"
    elif mask_type == "EMAIL_REDACT":
        return "REGEXP_REPLACE(val, '^(.{2})(.*)(@.*)$', '\\\\1****\\\\3')"
    elif mask_type == "PARTIAL_4_DIGITS":
        return "CONCAT('****-****-****-', RIGHT(val, 4))"
    elif mask_type == "NULLIFY":
        return "NULL"
    elif mask_type == "CUSTOM" and custom_expr:
        return custom_expr
    return "'***MASKED***'"


def compile_snowflake_sql(raw_payload: dict[str, Any]) -> str:
    """Compile policy definition into native, platform-specific Snowflake SQL script."""
    policy_code = (raw_payload.get("policy_code") or "UNKNOWN").upper().replace("-", "_")
    policy_name = raw_payload.get("policy_name") or "UNKNOWN"
    version_id = raw_payload.get("version_id") or "1"
    tags = raw_payload.get("tags") or []

    lines = [
        "-- ============================================================================",
        "-- SNOWFLAKE PLATFORM SPECIFIC SECURITY POLICY SCRIPT",
        f"-- Policy Code: {policy_code}",
        f"-- Policy Name: {policy_name}",
        f"-- Version ID: {version_id}",
        f"-- Generated At: {datetime.now().isoformat()}",
        "-- Platform: Snowflake Data Cloud (Native SQL DDL)",
        "-- ============================================================================",
        "",
        "-- ─── 1. Role Context & Governance Database Setup ────────────────────────────",
        "USE ROLE ACCOUNTADMIN;",
        "CREATE DATABASE IF NOT EXISTS GOVERNANCE_DB;",
        "CREATE SCHEMA IF NOT EXISTS GOVERNANCE_DB.POLICIES;",
        "CREATE SCHEMA IF NOT EXISTS GOVERNANCE_DB.TAGS;",
        "",
    ]

    rules = raw_payload.get("rules", [])
    if not rules:
        lines.append("-- No active rules defined for this policy version.")
        return "\n".join(lines)

    for idx, rule in enumerate(rules, 1):
        rule_name = rule.get("rule_name", f"Rule {idx}")
        effect = rule.get("effect", "ALLOW")
        lines.append(f"-- ─── Rule #{idx}: {rule_name} (Effect: {effect}) ─────────────────────")

        role_codes = []
        for s in rule.get("subjects", []):
            code = s.get("role_code") or (s.get("subject_type") if s.get("subject_type") != "ROLE" else None)
            if code:
                role_codes.append(f"CES_{code.upper()}")

        purposes = [
            c.get("compare_value") for c in rule.get("conditions", [])
            if c.get("attribute_key") == "purpose" and c.get("compare_value")
        ]

        resources = rule.get("resources", [])
        has_tag_resource = any(r.get("resource_scope") == "TAG" for r in resources) or len(tags) > 0

        exempt_roles = ["'ACCOUNTADMIN'"]
        if role_codes:
            exempt_roles.extend([f"'{r}'" for r in role_codes])
        roles_clause = ", ".join(exempt_roles)

        for action in rule.get("actions", []):
            act_type = action.get("action_type")

            if act_type == "MASK_COLUMN":
                mask_type = action.get("mask_type", "HASH_SHA256")
                mask_col = (action.get("filter_column") or "EMAIL").upper()
                custom_expr = action.get("mask_expression")
                mask_expr = get_snowflake_mask_expr(mask_type, custom_expr)

                policy_name_sf = f"GOVERNANCE_DB.POLICIES.mask_{policy_code.lower()}_{mask_col.lower()}"

                purpose_clause = ""
                if purposes:
                    purpose_list = ", ".join([f"'{p}'" for p in purposes])
                    purpose_clause = f"\n    WHEN GETVARIABLE('CES_PURPOSE') IN ({purpose_list}) THEN val"

                lines.append(f"-- Create Native Snowflake Masking Policy")
                lines.append(f"CREATE OR REPLACE MASKING POLICY {policy_name_sf} AS (val VARCHAR) RETURNS VARCHAR ->")
                lines.append(f"  CASE")
                lines.append(f"    WHEN CURRENT_ROLE() IN ({roles_clause}) THEN val{purpose_clause}")
                lines.append(f"    ELSE {mask_expr}")
                lines.append(f"  END")
                lines.append(f"  COMMENT = 'CES Managed Masking Policy for {policy_code}';")
                lines.append("")

                if has_tag_resource and tags:
                    for tag in tags:
                        tag_clean = tag.replace(".", "_").upper()
                        lines.append(f"-- Bind Masking Policy directly to Snowflake Tag: {tag}")
                        lines.append(f"CREATE TAG IF NOT EXISTS GOVERNANCE_DB.TAGS.{tag_clean} COMMENT = 'CES Tag {tag}';")
                        lines.append(f"ALTER TAG GOVERNANCE_DB.TAGS.{tag_clean} SET MASKING POLICY {policy_name_sf};")
                else:
                    for res in (resources or [{"database_name": "FINANCE_DB", "schema_name": "PUBLIC", "table_name": "CUSTOMER_PROFILES"}]):
                        db_name = (res.get("database_name") or "FINANCE_DB").upper()
                        sch_name = (res.get("schema_name") or "PUBLIC").upper()
                        tbl_name = (res.get("table_name") or "CUSTOMER_PROFILES").upper()
                        full_path = f"{db_name}.{sch_name}.{tbl_name}"
                        lines.append(f"-- Apply Masking Policy to Table Column")
                        lines.append(f"ALTER TABLE {full_path} MODIFY COLUMN {mask_col} SET MASKING POLICY {policy_name_sf};")

                for r_code in role_codes:
                    lines.append(f"GRANT APPLY ON MASKING POLICY {policy_name_sf} TO ROLE {r_code};")

                lines.append(f"-- Verification: Run in Snowflake to inspect active policy references")
                lines.append(f"SELECT * FROM TABLE(INFORMATION_SCHEMA.POLICY_REFERENCES(POLICY_NAME => '{policy_name_sf}'));")
                lines.append("")

            elif act_type == "FILTER_ROWS":
                filter_col = (action.get("filter_column") or "REGION").upper()
                filter_val = action.get("filter_value") or "US_EAST"
                rap_name = f"GOVERNANCE_DB.POLICIES.rap_{policy_code.lower()}_{filter_col.lower()}"

                lines.append(f"-- Create Native Snowflake Row Access Policy (RAP)")
                lines.append(f"CREATE OR REPLACE ROW ACCESS POLICY {rap_name} AS (col_val VARCHAR) RETURNS BOOLEAN ->")
                lines.append(f"  CURRENT_ROLE() IN ('ACCOUNTADMIN') OR (CURRENT_ROLE() IN ({roles_clause}) AND col_val = '{filter_val}');")
                lines.append("")

                for res in (resources or [{"database_name": "FINANCE_DB", "schema_name": "PUBLIC", "table_name": "CUSTOMER_PROFILES"}]):
                    db_name = (res.get("database_name") or "FINANCE_DB").upper()
                    sch_name = (res.get("schema_name") or "PUBLIC").upper()
                    tbl_name = (res.get("table_name") or "CUSTOMER_PROFILES").upper()
                    full_path = f"{db_name}.{sch_name}.{tbl_name}"
                    lines.append(f"-- Apply Row Access Policy to Table")
                    lines.append(f"ALTER TABLE {full_path} ADD ROW ACCESS POLICY {rap_name} ON ({filter_col});")

                lines.append("")

            elif act_type in ("GRANT_SELECT", "GRANT_INSERT", "GRANT_UPDATE"):
                sql_verb = "SELECT" if act_type == "GRANT_SELECT" else "INSERT" if act_type == "GRANT_INSERT" else "UPDATE"
                for res in (resources or [{"database_name": "FINANCE_DB", "schema_name": "PUBLIC", "table_name": "CUSTOMER_PROFILES"}]):
                    db_name = (res.get("database_name") or "FINANCE_DB").upper()
                    sch_name = (res.get("schema_name") or "PUBLIC").upper()
                    tbl_name = (res.get("table_name") or "CUSTOMER_PROFILES").upper()
                    full_path = f"{db_name}.{sch_name}.{tbl_name}"
                    for r_code in role_codes:
                        lines.append(f"GRANT USAGE ON DATABASE {db_name} TO ROLE {r_code};")
                        lines.append(f"GRANT USAGE ON SCHEMA {db_name}.{sch_name} TO ROLE {r_code};")
                        lines.append(f"GRANT {sql_verb} ON TABLE {full_path} TO ROLE {r_code};")
                lines.append("")

    return "\n".join(lines)


def compile_redshift_sql(raw_payload: dict[str, Any]) -> str:
    """Compile policy definition into native, platform-specific Amazon Redshift SQL script."""
    policy_code = (raw_payload.get("policy_code") or "UNKNOWN").lower().replace("-", "_")
    policy_name = raw_payload.get("policy_name") or "UNKNOWN"
    version_id = raw_payload.get("version_id") or "1"

    lines = [
        "-- ============================================================================",
        "-- AMAZON REDSHIFT PLATFORM SPECIFIC SECURITY POLICY SCRIPT",
        f"-- Policy Code: {policy_code}",
        f"-- Policy Name: {policy_name}",
        f"-- Version ID: {version_id}",
        f"-- Generated At: {datetime.now().isoformat()}",
        "-- Platform: Amazon Redshift (Native DDM & RLS SQL)",
        "-- ============================================================================",
        "",
        "-- ─── 1. Redshift Environment Context ─────────────────────────────────────────",
        "-- Ensure this script is executed with superuser or sys:secadmin permissions.",
        "",
    ]

    rules = raw_payload.get("rules", [])
    if not rules:
        lines.append("-- No active rules defined for this policy version.")
        return "\n".join(lines)

    for idx, rule in enumerate(rules, 1):
        rule_name = rule.get("rule_name", f"Rule {idx}")
        effect = rule.get("effect", "ALLOW")
        lines.append(f"-- ─── Rule #{idx}: {rule_name} (Effect: {effect}) ─────────────────────")

        role_codes = []
        for s in rule.get("subjects", []):
            code = s.get("role_code") or (s.get("subject_type") if s.get("subject_type") != "ROLE" else None)
            if code:
                role_codes.append(f"ces_{code.lower()}")

        purposes = [
            c.get("compare_value") for c in rule.get("conditions", [])
            if c.get("attribute_key") == "purpose" and c.get("compare_value")
        ]

        resources = rule.get("resources", [])
        if not resources:
            resources = [{"database_name": "acme_dw", "schema_name": "public", "table_name": "customer_profiles"}]

        for res in resources:
            schema_name = (res.get("schema_name") or "public").lower()
            table_name = (res.get("table_name") or "customer_profiles").lower()
            full_table_path = f"{schema_name}.{table_name}"

            for action in rule.get("actions", []):
                act_type = action.get("action_type")

                if act_type == "MASK_COLUMN":
                    mask_type = action.get("mask_type", "HASH_SHA256")
                    mask_col = (action.get("filter_column") or "email").lower()
                    custom_expr = action.get("mask_expression")
                    mask_expr = get_redshift_mask_expr(mask_type, custom_expr)

                    mask_policy_name = f"mask_{table_name}_{mask_col}"

                    role_checks = []
                    for r in role_codes:
                        role_checks.append(f"pg_has_role(CURRENT_USER, '{r}', 'MEMBER')")
                    role_checks_sql = " OR ".join(role_checks) if role_checks else "FALSE"

                    purpose_clause = ""
                    if purposes:
                        purpose_list = ", ".join([f"'{p}'" for p in purposes])
                        purpose_clause = f" OR CURRENT_SETTING('ces.purpose', true) IN ({purpose_list})"

                    lines.append(f"-- Native Redshift Dynamic Data Masking (DDM)")
                    lines.append(f"CREATE MASKING POLICY {mask_policy_name}")
                    lines.append(f"WITH (val VARCHAR)")
                    lines.append(f"USING (")
                    lines.append(f"  CASE")
                    lines.append(f"    WHEN CURRENT_USER IN ('admin', 'awsuser') OR {role_checks_sql}{purpose_clause} THEN val")
                    lines.append(f"    ELSE {mask_expr}")
                    lines.append(f"  END")
                    lines.append(f");")
                    lines.append("")

                    if role_codes:
                        for r in role_codes:
                            lines.append(f"ATTACH MASKING POLICY {mask_policy_name} ON {full_table_path}({mask_col}) TO ROLE {r};")
                    else:
                        lines.append(f"ATTACH MASKING POLICY {mask_policy_name} ON {full_table_path}({mask_col}) TO PUBLIC;")

                    lines.append(f"-- Verification: Inspect active Redshift masking policy catalog")
                    lines.append(f"SELECT * FROM SVV_MASKING_POLICY WHERE policy_name = '{mask_policy_name}';")
                    lines.append("")

                elif act_type == "FILTER_ROWS":
                    filter_col = (action.get("filter_column") or "region").lower()
                    filter_val = action.get("filter_value") or "US_EAST"
                    rls_policy_name = f"rls_{table_name}_{filter_col}"

                    lines.append(f"-- Native Redshift Row-Level Security (RLS)")
                    lines.append(f"CREATE RLS POLICY {rls_policy_name}")
                    lines.append(f"WITH ({filter_col} VARCHAR)")
                    lines.append(f"USING ({filter_col} = '{filter_val}');")
                    lines.append("")

                    if role_codes:
                        for r in role_codes:
                            lines.append(f"ATTACH RLS POLICY {rls_policy_name} ON {full_table_path} TO ROLE {r};")
                    else:
                        lines.append(f"ATTACH RLS POLICY {rls_policy_name} ON {full_table_path} TO PUBLIC;")

                    lines.append(f"-- Enable Row-Level Security on Table (Required in Amazon Redshift)")
                    lines.append(f"ALTER TABLE {full_table_path} ROW LEVEL SECURITY ON;")
                    lines.append(f"ALTER TABLE {full_table_path} ROW LEVEL SECURITY CONJUNCTIVE;")
                    lines.append("")
                    lines.append(f"-- Verification: Inspect active Redshift RLS policy catalog")
                    lines.append(f"SELECT * FROM SVV_RLS_POLICY WHERE policy_name = '{rls_policy_name}';")
                    lines.append("")

                elif act_type in ("GRANT_SELECT", "GRANT_INSERT", "GRANT_UPDATE"):
                    sql_verb = "SELECT" if act_type == "GRANT_SELECT" else "INSERT" if act_type == "GRANT_INSERT" else "UPDATE"
                    for r in role_codes:
                        lines.append(f"GRANT USAGE ON SCHEMA {schema_name} TO ROLE {r};")
                        lines.append(f"GRANT {sql_verb} ON TABLE {full_table_path} TO ROLE {r};")
                    lines.append("")

    return "\n".join(lines)




async def export_and_compile_policy(policy_id: int, version_id: int, db: AsyncSession) -> dict[str, Any]:
    """Fetch policy and compile to Snowflake & Redshift SQL in memory."""
    raw_payload = await fetch_policy_raw_payload(version_id, db)
    if not raw_payload:
        raise ValueError(f"Policy version {version_id} not found in DB")

    snowflake_sql = compile_snowflake_sql(raw_payload)
    redshift_sql = compile_redshift_sql(raw_payload)
    opa_rego = compile_opa_rego(raw_payload)

    log.info("policy_compiled", policy_id=policy_id, version_id=version_id)

    return {
        "raw_payload": raw_payload,
        "snowflake_sql": snowflake_sql,
        "redshift_sql": redshift_sql,
        "opa_rego": opa_rego,
    }


def compile_opa_rego(raw_payload: dict[str, Any]) -> str:
    """Compile policy definition into declarative Open Policy Agent (OPA) Rego policy."""
    policy_code = (raw_payload.get("policy_code") or "CES_POLICY").lower().replace("-", "_")
    lines = [
        f"# ============================================================================",
        f"# OPEN POLICY AGENT (OPA) REGO EVALUATION POLICY",
        f"# Policy Code: {raw_payload.get('policy_code', 'UNKNOWN')}",
        f"# Generated At: {datetime.now().isoformat()}",
        f"# ============================================================================",
        "",
        f"package ces.policies.{policy_code}",
        "",
        "import rego.v1",
        "",
        "default allow := false",
        "default mask_action := null",
        "",
    ]

    rules = raw_payload.get("rules", [])
    for idx, rule in enumerate(rules, 1):
        roles = [s.get("role_code") for s in rule.get("subjects", []) if s.get("role_code")]
        conds = rule.get("conditions", [])

        roles_check = ""
        if roles:
            roles_set = ", ".join([f'"{r}"' for r in roles])
            roles_check = f"    input.user.roles[_] in [{roles_set}]\n"

        attr_checks = ""
        for c in conds:
            k = c.get("attribute_key")
            v = c.get("compare_value")
            op = c.get("operator", "EQ")
            if k and v:
                op_sym = "==" if op == "EQ" else "!=" if op == "NEQ" else ">=" if op == "GTE" else "<=" if op == "LTE" else "=="
                attr_checks += f'    input.user.attributes.{k} {op_sym} "{v}"\n'

        for action in rule.get("actions", []):
            act_type = action.get("action_type")
            if act_type in ("GRANT_SELECT", "GRANT_INSERT", "GRANT_UPDATE"):
                lines.append(f"# Rule #{idx}: {rule.get('rule_name')}")
                lines.append(f"allow if {{\n{roles_check}{attr_checks}}}")
                lines.append("")
            elif act_type == "MASK_COLUMN":
                mask_type = action.get("mask_type") or "HASH_SHA256"
                mask_col = action.get("filter_column") or "column"
                lines.append(f"# Rule #{idx} Column Mask: {mask_col} ({mask_type})")
                lines.append(f'mask_action := "{mask_type}" if {{\n    input.resource.column == "{mask_col}"\n    not is_exempt\n}}')
                lines.append("")
                lines.append(f"is_exempt if {{\n{roles_check}{attr_checks}}}")
                lines.append("")
            elif act_type == "FILTER_ROWS":
                filter_col = action.get("filter_column") or "region"
                filter_val = action.get("filter_value") or "EAST"
                lines.append(f"# Rule #{idx} Row Filter: {filter_col} = {filter_val}")
                lines.append(f"row_filter := \"{filter_col} == '{filter_val}'\" if {{\n{roles_check}{attr_checks}}}")
                lines.append("")

    return "\n".join(lines)


def generate_natural_language_summary(raw_payload: dict[str, Any]) -> str:
    """Generate an Immuta-style plain English natural language sentence explaining the policy."""
    rules = raw_payload.get("rules", [])
    if not rules:
        return "Draft policy with no rules configured."

    summaries = []
    for r in rules:
        actions = r.get("actions", [])
        subjects = r.get("subjects", [])
        conditions = r.get("conditions", [])
        tags = raw_payload.get("tags") or []

        roles = [s.get("role_code") for s in subjects if s.get("role_code")]
        purposes = [c.get("compare_value") for c in conditions if c.get("attribute_key") == "purpose"]
        attr_conds = [f"{c.get('attribute_key')} {c.get('operator')} '{c.get('compare_value')}'" for c in conditions if c.get("attribute_key") != "purpose"]

        exemptions = []
        if roles:
            exemptions.append(f"have role {' or '.join(roles)}")
        if purposes:
            exemptions.append(f"possess purpose {' or '.join(purposes)}")
        if attr_conds:
            exemptions.append(f"meet condition {' and '.join(attr_conds)}")

        exempt_str = f" for everyone EXCEPT users who {' OR '.join(exemptions)}" if exemptions else ""
        target_str = f"columns/tables tagged with [{', '.join(tags)}]" if tags else "all targeted data sources"

        for a in actions:
            act_type = a.get("action_type")
            if act_type == "MASK_COLUMN":
                m_type = a.get("mask_type", "HASH_SHA256")
                col = a.get("filter_column") or "target column"
                summaries.append(f"Mask values in {col} ({target_str}) using technique {m_type}{exempt_str}.")
            elif act_type == "FILTER_ROWS":
                col = a.get("filter_column") or "attribute"
                val = a.get("filter_value") or "value"
                summaries.append(f"Only show rows where {col} = '{val}' on {target_str}{exempt_str}.")
            elif act_type in ("GRANT_SELECT", "GRANT_ACCESS"):
                summaries.append(f"Allow query access to {target_str} for users who {' and '.join(exemptions) if exemptions else 'all authenticated users'}.")
            else:
                summaries.append(f"Apply {act_type} rule to {target_str}{exempt_str}.")

    return " ".join(summaries)


def compile_policy_preview(draft_payload: dict[str, Any]) -> dict[str, Any]:
    """Compile policy draft in-memory and return Snowflake DDL, Redshift DDL, OPA Rego, and Natural Language summary."""
    snowflake_sql = compile_snowflake_sql(draft_payload)
    redshift_sql = compile_redshift_sql(draft_payload)
    opa_rego = compile_opa_rego(draft_payload)
    nl_summary = generate_natural_language_summary(draft_payload)

    return {
        "natural_language": nl_summary,
        "snowflake_sql": snowflake_sql,
        "redshift_sql": redshift_sql,
        "opa_rego": opa_rego,
    }
