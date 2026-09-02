"""Amazon Redshift Native Policy Compiler — Platform-Specific Format.

Generates directly-applicable Redshift SQL scripts including:
- Native Redshift Dynamic Data Masking (CREATE MASKING POLICY / ATTACH MASKING POLICY)
- Native Redshift Row-Level Security (CREATE RLS POLICY / ATTACH RLS POLICY)
- Automatic Table RLS enablement (ALTER TABLE ... ROW LEVEL SECURITY ON / CONJUNCTIVE)
- Schema/Table Privileges & Inspection Queries
"""
from datetime import datetime
from typing import Any, Optional


def get_redshift_mask_expr(mask_type: str, custom_expr: Optional[str] = None) -> str:
    """Return native Redshift SQL expression for the requested masking technique."""
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


class RedshiftPolicyCompiler:
    """Platform-specific policy compiler for Amazon Redshift."""

    def compile(self, raw_payload: dict[str, Any]) -> str:
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
