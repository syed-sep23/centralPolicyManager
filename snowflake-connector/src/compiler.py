"""Snowflake Native Policy Compiler — Platform-Specific Format.

Generates directly-applicable Snowflake SQL scripts including:
- Tag-Based Masking Policies (CES Global Scope)
- Column-Level Masking Policies (Targeted Scope)
- Row Access Policies (RAP)
- Role Privilege Grants & Verification Queries

All credentials and admin/bypass users are determined by the platform
connection owner (db_user from metadata_platforms), never from env vars.
"""

from datetime import datetime
from typing import Any, Optional


def get_snowflake_mask_expr(mask_type: str, custom_expr: Optional[str] = None) -> str:
    """Return native Snowflake SQL expression for the requested masking technique."""
    expressions = {
        "HASH_SHA256": "SHA2(val, 256)",
        "EMAIL_REDACT": "REGEXP_REPLACE(val, '^(.{2})(.*)(@.*)$', '\\\\1****\\\\3')",
        "PARTIAL_4_DIGITS": "CONCAT('****-****-****-', RIGHT(val, 4))",
        "NULLIFY": "NULL",
    }
    if mask_type == "CUSTOM" and custom_expr:
        return custom_expr
    return expressions.get(mask_type, "'***MASKED***'")


class SnowflakePolicyCompiler:
    """Platform-specific policy compiler for Snowflake Data Cloud.

    The `enforcing_user` is the platform connection owner (db_user from
    metadata_platforms) — this user is used as the admin bypass in masking
    and row access policies.
    """

    def __init__(self, enforcing_user: Optional[str] = None):
        self._enforcing_user = (enforcing_user or "").upper() or None

    def compile(self, raw_payload: dict[str, Any]) -> str:
        """Compile full policy into Snowflake-native SQL DDL script."""
        policy_code = (raw_payload.get("policy_code") or "UNKNOWN").upper().replace("-", "_")
        policy_name = raw_payload.get("policy_name") or "UNKNOWN"
        version_id = raw_payload.get("version_id") or "1"
        target_users = raw_payload.get("target_users") or []

        lines = self._emit_header(policy_code, policy_name, version_id)

        if target_users:
            lines.extend(self._emit_target_users(target_users))

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
            lines.extend(self._compile_rule(idx, rule, policy_code))

        return "\n".join(lines)

    # ─── Header ────────────────────────────────────────────────────────────────

    def _emit_header(self, policy_code: str, policy_name: str, version_id: Any) -> list[str]:
        """Generate the SQL script header block."""
        lines = [
            "-- ============================================================================",
            "-- SNOWFLAKE PLATFORM SPECIFIC SECURITY POLICY SCRIPT",
            f"-- Policy Code: {policy_code}",
            f"-- Policy Name: {policy_name}",
            f"-- Version ID: {version_id}",
            f"-- Enforcing User: {self._enforcing_user or 'NOT SET'}",
            f"-- Generated At: {datetime.now().isoformat()}",
            "-- Platform: Snowflake Data Cloud (Native SQL DDL)",
            "-- Per-User Compilation: Enabled (Separately compiled for each user in groups)",
            "-- ============================================================================",
            "",
        ]
        return lines

    def _emit_target_users(self, target_users: list[dict]) -> list[str]:
        """Generate comments listing all target users in scope."""
        lines = ["-- ─── Target Users in Scope (Resolved from Groups) ──────────────────────────"]
        for tu in target_users:
            uname = tu.get("username", "unknown")
            disp = tu.get("display_name", uname)
            sf_id = tu.get("snowflake_user")
            grp = tu.get("role_code") or "MEMBER"
            if sf_id:
                lines.append(f"--  * User: {disp} ({uname}) | Snowflake ID: {sf_id} | Group: {grp}")
            else:
                lines.append(f"--  * User: {disp} ({uname}) | WARNING: No Snowflake mapping | Group: {grp}")
        lines.append("")
        return lines

    # ─── Rule Dispatch ─────────────────────────────────────────────────────────

    def _compile_rule(self, idx: int, rule: dict, policy_code: str) -> list[str]:
        """Compile a single rule into Snowflake DDL statements."""
        rule_name = rule.get("rule_name", f"Rule {idx}")
        effect = rule.get("effect", "ALLOW")
        member_users = rule.get("member_users", [])
        resources = rule.get("resources", [])

        lines = [f"-- ─── Rule #{idx}: {rule_name} (Effect: {effect}) ─────────────────────"]

        # Resolve role codes from subjects
        role_codes = self._extract_role_codes(rule.get("subjects", []))

        for action in rule.get("actions", []):
            act_type = action.get("action_type")
            if act_type == "MASK_COLUMN":
                lines.extend(self._compile_masking(action, policy_code, member_users, role_codes, resources))
            elif act_type == "FILTER_ROWS":
                lines.extend(self._compile_row_access(action, policy_code, member_users, role_codes, resources))
            elif act_type in ("GRANT_SELECT", "GRANT_INSERT", "GRANT_UPDATE"):
                lines.extend(self._compile_grants(action, member_users, role_codes, resources))

        return lines

    def _extract_role_codes(self, subjects: list) -> list[str]:
        """Extract CES role codes from subject definitions."""
        role_codes = []
        for s in subjects:
            code = s.get("role_code") or (
                s.get("subject_type") if s.get("subject_type") != "ROLE" else None
            )
            if code:
                role_codes.append(f"CES_{code.upper()}")
        return role_codes

    # ─── Masking Policy ────────────────────────────────────────────────────────

    def _compile_masking(
        self,
        action: dict,
        policy_code: str,
        member_users: list[dict],
        role_codes: list[str],
        resources: list[dict],
    ) -> list[str]:
        """Compile a MASK_COLUMN action into Snowflake Masking Policy DDL."""
        lines: list[str] = []
        mask_type = action.get("mask_type", "HASH_SHA256")
        mask_col = (action.get("filter_column") or "").upper()
        custom_expr = action.get("mask_expression")
        mask_expr = get_snowflake_mask_expr(mask_type, custom_expr)

        if not mask_col:
            lines.append("-- WARNING: No column specified for masking action. Skipping.")
            lines.append("")
            return lines

        policy_name_sf = f"GOVERNANCE_DB.POLICIES.mask_{policy_code.lower()}_{mask_col.lower()}"

        # Build the masking policy CASE expression
        lines.append("-- Create Native Snowflake Masking Policy (Compiled per User)")
        lines.append(
            f"CREATE OR REPLACE MASKING POLICY {policy_name_sf} AS (val VARCHAR) RETURNS VARCHAR ->"
        )
        lines.append("  CASE")

        # Admin bypass: the enforcing user (platform connection owner)
        if self._enforcing_user:
            lines.append(f"    -- Admin Bypass: Platform connection owner")
            lines.append(f"    WHEN CURRENT_USER() = '{self._enforcing_user}' THEN val")

        # Per-user entitlements
        if member_users:
            skipped = []
            for u in member_users:
                sf_uid = u.get("snowflake_user")
                disp_name = u.get("display_name") or u.get("username")
                grp_code = u.get("role_code") or "MEMBER"
                if sf_uid:
                    lines.append(
                        f"    -- User Entitlement: {disp_name} ({u.get('username')}) [Group: {grp_code}]"
                    )
                    lines.append(f"    WHEN CURRENT_USER() = '{sf_uid}' THEN val")
                else:
                    skipped.append(f"{disp_name} ({u.get('username')})")

            if skipped:
                for s in skipped:
                    lines.append(f"    -- WARNING: Skipped user {s} — no Snowflake platform_user_mapping")
        else:
            # Role-based bypass
            if role_codes:
                exempt_roles = ", ".join([f"'{r}'" for r in role_codes])
                lines.append(f"    WHEN CURRENT_ROLE() IN ({exempt_roles}) THEN val")

        lines.append(f"    ELSE {mask_expr}")
        lines.append("  END")
        lines.append(f"  COMMENT = 'CES Managed User-Level Masking Policy for {policy_code}';")
        lines.append("")

        # Apply to target resources
        if not resources:
            lines.append("-- WARNING: No target resources specified for masking policy application.")
            lines.append("")
            return lines

        for res in resources:
            db_name = (res.get("database_name") or "").upper()
            sch_name = (res.get("schema_name") or "").upper()
            tbl_name = (res.get("table_name") or "").upper()
            if not all([db_name, sch_name, tbl_name]):
                lines.append(f"-- WARNING: Incomplete resource definition, skipping: {res}")
                continue
            full_path = f"{db_name}.{sch_name}.{tbl_name}"
            lines.append("-- Apply Masking Policy to Table Column")
            lines.append(
                f"ALTER TABLE {full_path} MODIFY COLUMN {mask_col} SET MASKING POLICY {policy_name_sf};"
            )

        # Grant access
        if member_users:
            for u in member_users:
                sf_uid = u.get("snowflake_user")
                if not sf_uid:
                    continue
                grp_code = (u.get("role_code") or "MEMBER").upper()
                lines.append(
                    f"-- Grant Masking Policy Access to User: {u.get('display_name')} ({sf_uid})"
                )
                lines.append(
                    f"GRANT APPLY ON MASKING POLICY {policy_name_sf} TO ROLE CES_{grp_code};"
                )
                lines.append(f"GRANT ROLE CES_{grp_code} TO USER {sf_uid};")
        else:
            for r_code in role_codes:
                lines.append(
                    f"GRANT APPLY ON MASKING POLICY {policy_name_sf} TO ROLE {r_code};"
                )

        lines.append("-- Verification: Run in Snowflake to inspect active policy references")
        lines.append(
            f"SELECT * FROM TABLE(INFORMATION_SCHEMA.POLICY_REFERENCES(POLICY_NAME => '{policy_name_sf}'));"
        )
        lines.append("")
        return lines

    # ─── Row Access Policy ─────────────────────────────────────────────────────

    def _compile_row_access(
        self,
        action: dict,
        policy_code: str,
        member_users: list[dict],
        role_codes: list[str],
        resources: list[dict],
    ) -> list[str]:
        """Compile a FILTER_ROWS action into Snowflake Row Access Policy DDL."""
        lines: list[str] = []
        filter_col = (action.get("filter_column") or "").upper()
        filter_val = action.get("filter_value") or ""
        filter_op = action.get("filter_operator") or "="

        if not filter_col:
            lines.append("-- WARNING: No column specified for row filter action. Skipping.")
            lines.append("")
            return lines

        rap_name = f"GOVERNANCE_DB.POLICIES.rap_{policy_code.lower()}_{filter_col.lower()}"

        lines.append("-- Create Native Snowflake Row Access Policy (RAP) (Compiled per User)")
        lines.append(
            f"CREATE OR REPLACE ROW ACCESS POLICY {rap_name} AS (col_val VARCHAR) RETURNS BOOLEAN ->"
        )

        # Admin bypass
        if self._enforcing_user:
            lines.append(f"  CURRENT_USER() = '{self._enforcing_user}'")
        else:
            lines.append("  FALSE")

        if member_users:
            skipped = []
            for u in member_users:
                sf_uid = u.get("snowflake_user")
                disp_name = u.get("display_name") or u.get("username")
                if sf_uid:
                    lines.append(f"  -- User Filter: {disp_name} ({sf_uid})")
                    lines.append(
                        f"  OR (CURRENT_USER() = '{sf_uid}' AND col_val {filter_op} '{filter_val}')"
                    )
                else:
                    skipped.append(f"{disp_name} ({u.get('username')})")

            if skipped:
                for s in skipped:
                    lines.append(f"  -- WARNING: Skipped user {s} — no Snowflake platform_user_mapping")
        else:
            if role_codes:
                roles_clause = ", ".join([f"'{r}'" for r in role_codes])
                lines.append(
                    f"  OR (CURRENT_ROLE() IN ({roles_clause}) AND col_val {filter_op} '{filter_val}')"
                )

        lines.append(";")
        lines.append("")

        if not resources:
            lines.append("-- WARNING: No target resources specified for row access policy application.")
            lines.append("")
            return lines

        for res in resources:
            db_name = (res.get("database_name") or "").upper()
            sch_name = (res.get("schema_name") or "").upper()
            tbl_name = (res.get("table_name") or "").upper()
            if not all([db_name, sch_name, tbl_name]):
                lines.append(f"-- WARNING: Incomplete resource definition, skipping: {res}")
                continue
            full_path = f"{db_name}.{sch_name}.{tbl_name}"
            lines.append("-- Apply Row Access Policy to Table")
            lines.append(
                f"ALTER TABLE {full_path} ADD ROW ACCESS POLICY {rap_name} ON ({filter_col});"
            )

        lines.append("")
        return lines

    # ─── Grant Privileges ──────────────────────────────────────────────────────

    def _compile_grants(
        self,
        action: dict,
        member_users: list[dict],
        role_codes: list[str],
        resources: list[dict],
    ) -> list[str]:
        """Compile GRANT_SELECT/INSERT/UPDATE actions into Snowflake privilege DDL."""
        lines: list[str] = []
        act_type = action.get("action_type", "GRANT_SELECT")
        verb_map = {
            "GRANT_SELECT": "SELECT",
            "GRANT_INSERT": "INSERT",
            "GRANT_UPDATE": "UPDATE",
        }
        sql_verb = verb_map.get(act_type, "SELECT")

        if not resources:
            lines.append(f"-- WARNING: No target resources specified for {act_type}. Skipping.")
            lines.append("")
            return lines

        for res in resources:
            db_name = (res.get("database_name") or "").upper()
            sch_name = (res.get("schema_name") or "").upper()
            tbl_name = (res.get("table_name") or "").upper()
            if not all([db_name, sch_name, tbl_name]):
                lines.append(f"-- WARNING: Incomplete resource definition, skipping: {res}")
                continue
            full_path = f"{db_name}.{sch_name}.{tbl_name}"

            if member_users:
                for u in member_users:
                    sf_uid = u.get("snowflake_user")
                    disp_name = u.get("display_name") or u.get("username")
                    grp_code = (u.get("role_code") or "MEMBER").upper()

                    if not sf_uid:
                        lines.append(
                            f"-- WARNING: Skipped user {disp_name} ({u.get('username')}) — no Snowflake platform_user_mapping"
                        )
                        continue

                    r_tag = f"CES_{grp_code}"
                    lines.append(
                        f"-- ─── User Privileges: {disp_name} ({u.get('username')}) | Snowflake ID: {sf_uid} [Group: {grp_code}] ───"
                    )
                    lines.append(f"GRANT USAGE ON DATABASE {db_name} TO ROLE {r_tag};")
                    lines.append(f"GRANT USAGE ON SCHEMA {db_name}.{sch_name} TO ROLE {r_tag};")
                    lines.append(f"GRANT {sql_verb} ON TABLE {full_path} TO ROLE {r_tag};")
                    lines.append(f"GRANT ROLE {r_tag} TO USER {sf_uid};")
                    lines.append(f"-- Verification: Run query as user {sf_uid}")
                    lines.append(
                        f"-- EXECUTE AS USER = '{sf_uid}'; SELECT * FROM {full_path} LIMIT 10;"
                    )
                    lines.append("")
            else:
                for r_code in role_codes:
                    lines.append(f"GRANT USAGE ON DATABASE {db_name} TO ROLE {r_code};")
                    lines.append(
                        f"GRANT USAGE ON SCHEMA {db_name}.{sch_name} TO ROLE {r_code};"
                    )
                    lines.append(f"GRANT {sql_verb} ON TABLE {full_path} TO ROLE {r_code};")
                lines.append("")

        return lines
