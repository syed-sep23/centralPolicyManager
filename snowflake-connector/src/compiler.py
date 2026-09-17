"""Snowflake Native Policy Compiler — Platform-Specific Format.

Generates directly-applicable Snowflake SQL scripts including:
- Tag-Based Masking Policies (CES Global Scope)
- Column-Level Masking Policies (Targeted Scope)
- Row Access Policies (RAP)
- Role Privilege Grants & Verification Queries
"""

from datetime import datetime
from typing import Any, Optional


def get_snowflake_mask_expr(mask_type: str, custom_expr: Optional[str] = None) -> str:
    """Return native Snowflake SQL expression for the requested masking technique."""
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


class SnowflakePolicyCompiler:
    """Platform-specific policy compiler for Snowflake Data Cloud."""

    def compile(self, raw_payload: dict[str, Any]) -> str:
        policy_code = (raw_payload.get("policy_code") or "UNKNOWN").upper().replace("-", "_")
        policy_name = raw_payload.get("policy_name") or "UNKNOWN"
        version_id = raw_payload.get("version_id") or "1"
        target_users = raw_payload.get("target_users") or []

        lines = [
            "-- ============================================================================",
            "-- SNOWFLAKE PLATFORM SPECIFIC SECURITY POLICY SCRIPT",
            f"-- Policy Code: {policy_code}",
            f"-- Policy Name: {policy_name}",
            f"-- Version ID: {version_id}",
            f"-- Generated At: {datetime.now().isoformat()}",
            "-- Platform: Snowflake Data Cloud (Native SQL DDL)",
            "-- Per-User Compilation: Enabled (Separately compiled for each user in groups)",
            "-- ============================================================================",
            "",
        ]

        if target_users:
            lines.append("-- ─── Target Users in Scope (Resolved from Groups) ──────────────────────────")
            for tu in target_users:
                uname = tu.get("username", "unknown")
                disp = tu.get("display_name", uname)
                sf_id = tu.get("snowflake_user") or uname.upper()
                grp = tu.get("role_code") or "MEMBER"
                lines.append(f"--  * User: {disp} ({uname}) | Snowflake ID: {sf_id} | Group: {grp}")
            lines.append("")

        lines.extend([
            "-- ─── 1. Role Context & Governance Database Setup ────────────────────────────",
            "USE ROLE ACCOUNTADMIN;",
            "CREATE DATABASE IF NOT EXISTS GOVERNANCE_DB;",
            "CREATE SCHEMA IF NOT EXISTS GOVERNANCE_DB.POLICIES;",
            "",
        ])

        rules = raw_payload.get("rules", [])
        if not rules:
            lines.append("-- No active rules defined for this policy version.")
            return "\n".join(lines)

        for idx, rule in enumerate(rules, 1):
            rule_name = rule.get("rule_name", f"Rule {idx}")
            effect = rule.get("effect", "ALLOW")
            member_users = rule.get("member_users", [])

            lines.append(
                f"-- ─── Rule #{idx}: {rule_name} (Effect: {effect}) ─────────────────────"
            )

            role_codes = []
            for s in rule.get("subjects", []):
                code = s.get("role_code") or (
                    s.get("subject_type") if s.get("subject_type") != "ROLE" else None
                )
                if code:
                    role_codes.append(f"CES_{code.upper()}")

            resources = rule.get("resources", [])

            for action in rule.get("actions", []):
                act_type = action.get("action_type")

                if act_type == "MASK_COLUMN":
                    mask_type = action.get("mask_type", "HASH_SHA256")
                    mask_col = (action.get("filter_column") or "EMAIL").upper()
                    custom_expr = action.get("mask_expression")
                    mask_expr = get_snowflake_mask_expr(mask_type, custom_expr)

                    policy_name_sf = (
                        f"GOVERNANCE_DB.POLICIES.mask_{policy_code.lower()}_{mask_col.lower()}"
                    )

                    lines.append("-- Create Native Snowflake Masking Policy (Compiled per User)")
                    lines.append(
                        f"CREATE OR REPLACE MASKING POLICY {policy_name_sf} AS (val VARCHAR) RETURNS VARCHAR ->"
                    )
                    lines.append("  CASE")
                    lines.append("    WHEN CURRENT_ROLE() IN ('ACCOUNTADMIN') THEN val")

                    if member_users:
                        for u in member_users:
                            sf_uid = u.get("snowflake_user") or u.get("username", "").upper()
                            disp_name = u.get("display_name") or u.get("username")
                            grp_code = u.get("role_code") or "MEMBER"
                            lines.append(
                                f"    -- User Entitlement: {disp_name} ({u.get('username')}) [Group: {grp_code}]"
                            )
                            lines.append(f"    WHEN CURRENT_USER() = '{sf_uid}' THEN val")
                    else:
                        exempt_roles = ["'ACCOUNTADMIN'"]
                        if role_codes:
                            exempt_roles.extend([f"'{r}'" for r in role_codes])
                        roles_clause = ", ".join(exempt_roles)
                        lines.append(
                            f"    WHEN CURRENT_ROLE() IN ({roles_clause}) THEN val"
                        )

                    lines.append(f"    ELSE {mask_expr}")
                    lines.append("  END")
                    lines.append(f"  COMMENT = 'CES Managed User-Level Masking Policy for {policy_code}';")
                    lines.append("")

                    for res in resources or [
                        {
                            "database_name": "FINANCE_DB",
                            "schema_name": "PUBLIC",
                            "table_name": "CUSTOMER_PROFILES",
                        }
                    ]:
                        db_name = (res.get("database_name") or "FINANCE_DB").upper()
                        sch_name = (res.get("schema_name") or "PUBLIC").upper()
                        tbl_name = (res.get("table_name") or "CUSTOMER_PROFILES").upper()
                        full_path = f"{db_name}.{sch_name}.{tbl_name}"
                        lines.append("-- Apply Masking Policy to Table Column")
                        lines.append(
                            f"ALTER TABLE {full_path} MODIFY COLUMN {mask_col} SET MASKING POLICY {policy_name_sf};"
                        )

                    if member_users:
                        for u in member_users:
                            sf_uid = u.get("snowflake_user") or u.get("username", "").upper()
                            grp_code = (u.get("role_code") or "MEMBER").upper()
                            lines.append(
                                f"-- Grant Masking Policy Access to User: {u.get('display_name')} ({sf_uid})"
                            )
                            lines.append(
                                f"GRANT APPLY ON MASKING POLICY {policy_name_sf} TO ROLE CES_{grp_code};"
                            )
                            lines.append(
                                f"GRANT ROLE CES_{grp_code} TO USER {sf_uid};"
                            )
                    else:
                        for r_code in role_codes:
                            lines.append(
                                f"GRANT APPLY ON MASKING POLICY {policy_name_sf} TO ROLE {r_code};"
                            )

                    lines.append(
                        "-- Verification: Run in Snowflake to inspect active policy references"
                    )
                    lines.append(
                        f"SELECT * FROM TABLE(INFORMATION_SCHEMA.POLICY_REFERENCES(POLICY_NAME => '{policy_name_sf}'));"
                    )
                    lines.append("")

                elif act_type == "FILTER_ROWS":
                    filter_col = (action.get("filter_column") or "REGION").upper()
                    filter_val = action.get("filter_value") or "US_EAST"
                    rap_name = (
                        f"GOVERNANCE_DB.POLICIES.rap_{policy_code.lower()}_{filter_col.lower()}"
                    )

                    lines.append("-- Create Native Snowflake Row Access Policy (RAP) (Compiled per User)")
                    lines.append(
                        f"CREATE OR REPLACE ROW ACCESS POLICY {rap_name} AS (col_val VARCHAR) RETURNS BOOLEAN ->"
                    )
                    lines.append("  CURRENT_ROLE() IN ('ACCOUNTADMIN')")

                    if member_users:
                        for u in member_users:
                            sf_uid = u.get("snowflake_user") or u.get("username", "").upper()
                            disp_name = u.get("display_name") or u.get("username")
                            lines.append(
                                f"  -- User Filter: {disp_name} ({sf_uid})"
                            )
                            lines.append(
                                f"  OR (CURRENT_USER() = '{sf_uid}' AND col_val = '{filter_val}')"
                            )
                    else:
                        exempt_roles = ["'ACCOUNTADMIN'"]
                        if role_codes:
                            exempt_roles.extend([f"'{r}'" for r in role_codes])
                        roles_clause = ", ".join(exempt_roles)
                        lines.append(
                            f"  OR (CURRENT_ROLE() IN ({roles_clause}) AND col_val = '{filter_val}')"
                        )
                    lines.append(";")
                    lines.append("")

                    for res in resources or [
                        {
                            "database_name": "FINANCE_DB",
                            "schema_name": "PUBLIC",
                            "table_name": "CUSTOMER_PROFILES",
                        }
                    ]:
                        db_name = (res.get("database_name") or "FINANCE_DB").upper()
                        sch_name = (res.get("schema_name") or "PUBLIC").upper()
                        tbl_name = (res.get("table_name") or "CUSTOMER_PROFILES").upper()
                        full_path = f"{db_name}.{sch_name}.{tbl_name}"
                        lines.append("-- Apply Row Access Policy to Table")
                        lines.append(
                            f"ALTER TABLE {full_path} ADD ROW ACCESS POLICY {rap_name} ON ({filter_col});"
                        )

                    lines.append("")

                elif act_type in ("GRANT_SELECT", "GRANT_INSERT", "GRANT_UPDATE"):
                    sql_verb = (
                        "SELECT"
                        if act_type == "GRANT_SELECT"
                        else "INSERT" if act_type == "GRANT_INSERT" else "UPDATE"
                    )
                    target_resources = resources or [
                        {
                            "database_name": "FINANCE_DB",
                            "schema_name": "PUBLIC",
                            "table_name": "CUSTOMER_PROFILES",
                        }
                    ]

                    for res in target_resources:
                        db_name = (res.get("database_name") or "FINANCE_DB").upper()
                        sch_name = (res.get("schema_name") or "PUBLIC").upper()
                        tbl_name = (res.get("table_name") or "CUSTOMER_PROFILES").upper()
                        full_path = f"{db_name}.{sch_name}.{tbl_name}"

                        if member_users:
                            for u in member_users:
                                sf_uid = u.get("snowflake_user") or u.get("username", "").upper()
                                disp_name = u.get("display_name") or u.get("username")
                                grp_code = (u.get("role_code") or "MEMBER").upper()
                                r_tag = f"CES_{grp_code}"
                                lines.append(
                                    f"-- ─── User Privileges: {disp_name} ({u.get('username')}) | Snowflake ID: {sf_uid} [Group: {grp_code}] ───"
                                )
                                lines.append(f"GRANT USAGE ON DATABASE {db_name} TO ROLE {r_tag};")
                                lines.append(f"GRANT USAGE ON SCHEMA {db_name}.{sch_name} TO ROLE {r_tag};")
                                lines.append(f"GRANT {sql_verb} ON TABLE {full_path} TO ROLE {r_tag};")
                                lines.append(f"GRANT ROLE {r_tag} TO USER {sf_uid};")
                                lines.append(f"-- Verification: Run query as user {sf_uid}")
                                lines.append(f"-- EXECUTE AS USER = '{sf_uid}'; SELECT * FROM {full_path} LIMIT 10;")
                                lines.append("")
                        else:
                            for r_code in role_codes:
                                lines.append(f"GRANT USAGE ON DATABASE {db_name} TO ROLE {r_code};")
                                lines.append(
                                    f"GRANT USAGE ON SCHEMA {db_name}.{sch_name} TO ROLE {r_code};"
                                )
                                lines.append(f"GRANT {sql_verb} ON TABLE {full_path} TO ROLE {r_code};")
                            lines.append("")

        return "\n".join(lines)
