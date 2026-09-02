"""Snowflake Native Policy Compiler — Platform-Specific Format.

Generates directly-applicable Snowflake SQL scripts including:
- Tag-Based Masking Policies (Immuta Global Scope)
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
