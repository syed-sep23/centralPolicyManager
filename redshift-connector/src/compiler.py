"""Amazon Redshift Native Policy Compiler — Platform-Specific Format.

Generates directly-applicable Redshift SQL scripts including:
- Native Redshift Dynamic Data Masking (CREATE MASKING POLICY / ATTACH MASKING POLICY)
- Native Redshift Row-Level Security (CREATE RLS POLICY / ATTACH RLS POLICY)
- Automatic Table RLS enablement (ALTER TABLE ... ROW LEVEL SECURITY ON / CONJUNCTIVE)
- Schema/Table Privileges & Inspection Queries

All credentials and admin/bypass users are determined by the platform
connection owner (db_user from metadata_platforms), never from env vars.
"""

from datetime import datetime
from typing import Any, Optional


def get_redshift_mask_expr(
    mask_type: str,
    custom_expr: Optional[str] = None,
    data_type: Optional[str] = None,
    normalized_type: Optional[str] = None,
) -> str:
    """Return native Redshift SQL expression for the requested masking technique and column data type.

    Redshift DDM uses CASE expressions within CREATE MASKING POLICY ... USING (...).
    All functions used must be valid Redshift SQL and evaluate to a type compatible with the input data type.
    """
    if mask_type == "CUSTOM" and custom_expr:
        return custom_expr

    mtype = (mask_type or "HASH_SHA256").upper()
    dtype = (data_type or "VARCHAR").lower()
    ntype = (normalized_type or "").upper()

    is_numeric = (
        ntype == "NUMBER"
        or any(t in dtype for t in ("int", "num", "dec", "float", "double", "real", "bigint", "smallint"))
    )
    is_date_time = (
        ntype in ("DATE", "TIMESTAMP")
        or any(t in dtype for t in ("date", "time", "timestamp"))
    )
    is_boolean = ntype == "BOOLEAN" or "bool" in dtype

    if mtype in ("NULLIFY", "NULL_MASK"):
        return "NULL"

    if mtype == "HASH_SHA256":
        if is_numeric:
            return "0"
        if is_date_time:
            return "NULL"
        if is_boolean:
            return "FALSE"
        return "SHA2(val, 256)"

    if mtype in ("EMAIL_REDACT", "EMAIL_MASK"):
        if is_numeric or is_date_time or is_boolean:
            return "NULL"
        return "REGEXP_REPLACE(val, '^(.{2})(.*)(@.*)$', '\\\\1****\\\\3')"

    if mtype == "PHONE_MASK":
        if is_numeric or is_date_time or is_boolean:
            return "NULL"
        return "CONCAT('***-***-', RIGHT(val, 4))"

    if mtype in ("PARTIAL_4_DIGITS", "PARTIAL_MASK"):
        if is_numeric:
            return "0"
        if is_date_time:
            return "NULL"
        if is_boolean:
            return "FALSE"
        return "CONCAT('****-****-****-', RIGHT(val, 4))"

    # Default fallback
    if is_numeric:
        return "0"
    if is_date_time:
        return "NULL"
    if is_boolean:
        return "FALSE"
    return "'***MASKED***'"


class RedshiftPolicyCompiler:
    """Platform-specific policy compiler for Amazon Redshift.

    The `enforcing_user` is the platform connection owner (db_user from
    metadata_platforms) — this user is used as the admin bypass in masking
    and RLS policies.
    """

    def __init__(self, enforcing_user: Optional[str] = None):
        self._enforcing_user = (enforcing_user or "").lower() or None

    def compile(self, raw_payload: dict[str, Any]) -> str:
        """Compile full policy into Redshift-native SQL DDL script."""
        policy_code = (raw_payload.get("policy_code") or "UNKNOWN").lower().replace("-", "_")
        policy_name = raw_payload.get("policy_name") or "UNKNOWN"
        version_id = raw_payload.get("version_id") or "1"
        target_users = raw_payload.get("target_users") or []

        lines = self._emit_header(policy_code, policy_name, version_id)

        if target_users:
            lines.extend(self._emit_target_users(target_users))

        lines.extend([
            "-- ─── 1. Redshift Environment Context ─────────────────────────────────────────",
            "-- Ensure this script is executed with superuser or sys:secadmin permissions.",
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
        return [
            "-- ============================================================================",
            "-- AMAZON REDSHIFT PLATFORM SPECIFIC SECURITY POLICY SCRIPT",
            f"-- Policy Code: {policy_code}",
            f"-- Policy Name: {policy_name}",
            f"-- Version ID: {version_id}",
            f"-- Enforcing User: {self._enforcing_user or 'NOT SET'}",
            f"-- Generated At: {datetime.now().isoformat()}",
            "-- Platform: Amazon Redshift (Native DDM & RLS SQL)",
            "-- Per-User Compilation: Enabled (Separately compiled for each user in groups)",
            "-- ============================================================================",
            "",
        ]

    def _emit_target_users(self, target_users: list[dict]) -> list[str]:
        """Generate comments listing all target users in scope."""
        lines = ["-- ─── Target Users in Scope (Resolved from Groups) ──────────────────────────"]
        for tu in target_users:
            uname = tu.get("username", "unknown")
            disp = tu.get("display_name", uname)
            rs_id = tu.get("redshift_user")
            grp = tu.get("role_code") or "MEMBER"
            if rs_id:
                lines.append(f"--  * User: {disp} ({uname}) | Redshift User: {rs_id} | Group: {grp}")
            else:
                lines.append(f"--  * User: {disp} ({uname}) | WARNING: No Redshift mapping | Group: {grp}")
        lines.append("")
        return lines

    # ─── Rule Dispatch ─────────────────────────────────────────────────────────

    def _compile_rule(self, idx: int, rule: dict, policy_code: str) -> list[str]:
        """Compile a single rule into Redshift DDL statements."""
        rule_name = rule.get("rule_name", f"Rule {idx}")
        effect = rule.get("effect", "ALLOW")
        member_users = rule.get("member_users", [])
        resources = rule.get("resources", [])

        lines = [f"-- ─── Rule #{idx}: {rule_name} (Effect: {effect}) ─────────────────────"]

        role_codes = self._extract_role_codes(rule.get("subjects", []))

        if not resources:
            lines.append("-- WARNING: No target resources specified for this rule. Skipping.")
            lines.append("")
            return lines

        for res in resources:
            schema_name = (res.get("schema_name") or "").lower()
            table_name = (res.get("table_name") or "").lower()
            if not schema_name or not table_name:
                lines.append(f"-- WARNING: Incomplete resource definition, skipping: {res}")
                continue
            full_table_path = f"{schema_name}.{table_name}"
            columns = res.get("columns") or []

            for action in rule.get("actions", []):
                act_type = action.get("action_type")
                if act_type == "MASK_COLUMN":
                    lines.extend(
                        self._compile_masking(
                            action, table_name, full_table_path, member_users, role_codes, columns=columns
                        )
                    )
                elif act_type == "FILTER_ROWS":
                    lines.extend(
                        self._compile_rls(
                            action, table_name, full_table_path, member_users, role_codes, columns=columns
                        )
                    )
                elif act_type in ("GRANT_SELECT", "GRANT_INSERT", "GRANT_UPDATE"):
                    lines.extend(
                        self._compile_grants(action, schema_name, full_table_path, member_users, role_codes)
                    )

        return lines

    def _extract_role_codes(self, subjects: list) -> list[str]:
        """Extract CES role codes from subject definitions."""
        role_codes = []
        for s in subjects:
            code = s.get("role_code") or (
                s.get("subject_type") if s.get("subject_type") != "ROLE" else None
            )
            if code:
                role_codes.append(f"ces_{code.lower()}")
        return role_codes

    # ─── Masking Policy (Redshift DDM) ─────────────────────────────────────────

    def _compile_masking(
        self,
        action: dict,
        table_name: str,
        full_table_path: str,
        member_users: list[dict],
        role_codes: list[str],
        columns: Optional[list[dict]] = None,
    ) -> list[str]:
        """Compile a MASK_COLUMN action into Redshift Dynamic Data Masking DDL."""
        lines: list[str] = []
        mask_type = action.get("mask_type", "HASH_SHA256")
        mask_col = action.get("filter_column") or ""
        custom_expr = action.get("mask_expression")

        # Map existing columns by lower-cased column name
        col_lookup: dict[str, dict] = {}
        if columns:
            for c in columns:
                cname = (c.get("column_name") or "").lower()
                if cname:
                    col_lookup[cname] = c

        # Determine target columns to mask (supports comma-separated string or column list)
        cols_to_mask: list[str] = []
        if mask_col:
            cols_to_mask = [c.strip() for c in mask_col.split(",") if c.strip()]
        elif columns:
            scoped = [c.get("column_name") for c in columns if c.get("is_scoped")]
            cols_to_mask = scoped or [c.get("column_name") for c in columns]

        if not cols_to_mask:
            lines.append("-- WARNING: No column specified for masking action. Skipping.")
            lines.append("")
            return lines

        for target_col in cols_to_mask:
            clean_col = target_col.lower()
            col_meta = col_lookup.get(clean_col)

            data_type = "VARCHAR"
            normalized_type = "TEXT"
            col_display = clean_col

            if col_meta:
                data_type = col_meta.get("data_type") or "VARCHAR"
                normalized_type = col_meta.get("normalized_type") or "TEXT"
                col_display = f"{clean_col} (Type: {data_type}, Normalized: {normalized_type})"

            mask_expr = get_redshift_mask_expr(
                mask_type=mask_type,
                custom_expr=custom_expr,
                data_type=data_type,
                normalized_type=normalized_type,
            )

            mask_policy_name = f"mask_{table_name}_{clean_col}"

            lines.append(f"-- Native Redshift Dynamic Data Masking (DDM) for Column: {col_display}")
            lines.append(f"CREATE MASKING POLICY {mask_policy_name}")
            lines.append(f"WITH (val {data_type.upper()})")
            lines.append("USING (")
            lines.append("  CASE")

            # Admin bypass: the enforcing user (platform connection owner)
            if self._enforcing_user:
                lines.append("    -- Admin Bypass: Platform connection owner")
                lines.append(f"    WHEN CURRENT_USER = '{self._enforcing_user}' THEN val")

            # Per-user entitlements
            if member_users:
                skipped = []
                for u in member_users:
                    rs_uid = u.get("redshift_user")
                    disp_name = u.get("display_name") or u.get("username")
                    grp_code = u.get("role_code") or "MEMBER"
                    if rs_uid:
                        lines.append(
                            f"    -- User Entitlement: {disp_name} ({u.get('username')}) [Group: {grp_code}]"
                        )
                        lines.append(f"    WHEN CURRENT_USER = '{rs_uid}' THEN val")
                    else:
                        skipped.append(f"{disp_name} ({u.get('username')})")

                if skipped:
                    for s in skipped:
                        lines.append(f"    -- WARNING: Skipped user {s} — no Redshift platform_user_mapping")
            else:
                # Role-based bypass
                if role_codes:
                    role_checks = [f"pg_has_role(CURRENT_USER, '{r}', 'MEMBER')" for r in role_codes]
                    role_checks_sql = " OR ".join(role_checks)
                    lines.append(f"    WHEN {role_checks_sql} THEN val")

            lines.append(f"    ELSE {mask_expr}")
            lines.append("  END")
            lines.append(");")
            lines.append("")

            # Attach masking policy
            if member_users:
                lines.append(f"-- Attach Masking Policy for {clean_col} separately to each member user:")
                for u in member_users:
                    rs_uid = u.get("redshift_user")
                    if not rs_uid:
                        continue
                    lines.append(
                        f"ATTACH MASKING POLICY {mask_policy_name} ON {full_table_path}({clean_col}) TO USER {rs_uid};"
                    )
            elif role_codes:
                for r in role_codes:
                    lines.append(
                        f"ATTACH MASKING POLICY {mask_policy_name} ON {full_table_path}({clean_col}) TO ROLE {r};"
                    )
            else:
                lines.append(
                    f"ATTACH MASKING POLICY {mask_policy_name} ON {full_table_path}({clean_col}) TO PUBLIC;"
                )

            lines.append(f"-- Verification: Inspect active Redshift masking policy catalog for {clean_col}")
            lines.append(
                f"SELECT * FROM SVV_MASKING_POLICY WHERE policy_name = '{mask_policy_name}';"
            )
            lines.append("")

        return lines

    # ─── Row-Level Security (Redshift RLS) ─────────────────────────────────────

    def _compile_rls(
        self,
        action: dict,
        table_name: str,
        full_table_path: str,
        member_users: list[dict],
        role_codes: list[str],
        columns: Optional[list[dict]] = None,
    ) -> list[str]:
        """Compile a FILTER_ROWS action into Redshift Row-Level Security DDL."""
        lines: list[str] = []
        filter_col = (action.get("filter_column") or "").lower()
        filter_val = action.get("filter_value") or ""
        filter_op = action.get("filter_operator") or "="

        if not filter_col:
            lines.append("-- WARNING: No column specified for row filter action. Skipping.")
            lines.append("")
            return lines

        col_dtype = "VARCHAR"
        if columns:
            for c in columns:
                if (c.get("column_name") or "").lower() == filter_col:
                    col_dtype = c.get("data_type") or "VARCHAR"
                    break

        base_rls_name = f"rls_{table_name}_{filter_col}"

        if member_users:
            lines.append("-- Native Redshift Row-Level Security (RLS) (Compiled per User)")
            skipped = []
            for u in member_users:
                rs_uid = u.get("redshift_user")
                disp_name = u.get("display_name") or u.get("username")
                if rs_uid:
                    user_rls_name = f"{base_rls_name}_{rs_uid}"
                    lines.append(f"-- ─── RLS Policy for User: {disp_name} ({rs_uid}) ───")
                    lines.append(f"CREATE RLS POLICY {user_rls_name}")
                    lines.append(f"WITH ({filter_col} {col_dtype.upper()})")
                    lines.append(f"USING ({filter_col} {filter_op} '{filter_val}');")
                    lines.append(
                        f"ATTACH RLS POLICY {user_rls_name} ON {full_table_path} TO USER {rs_uid};"
                    )
                else:
                    skipped.append(f"{disp_name} ({u.get('username')})")

            if skipped:
                for s in skipped:
                    lines.append(f"-- WARNING: Skipped user {s} — no Redshift platform_user_mapping")
        else:
            lines.append("-- Native Redshift Row-Level Security (RLS)")
            lines.append(f"CREATE RLS POLICY {base_rls_name}")
            lines.append(f"WITH ({filter_col} {col_dtype.upper()})")
            lines.append(f"USING ({filter_col} {filter_op} '{filter_val}');")
            lines.append("")
            if role_codes:
                for r in role_codes:
                    lines.append(
                        f"ATTACH RLS POLICY {base_rls_name} ON {full_table_path} TO ROLE {r};"
                    )
            else:
                lines.append(
                    f"ATTACH RLS POLICY {base_rls_name} ON {full_table_path} TO PUBLIC;"
                )

        lines.append("-- Enable Row-Level Security on Table (Required in Amazon Redshift)")
        lines.append(f"ALTER TABLE {full_table_path} ROW LEVEL SECURITY ON;")
        lines.append(f"ALTER TABLE {full_table_path} ROW LEVEL SECURITY CONJUNCTIVE;")
        lines.append("")
        lines.append("-- Verification: Inspect active Redshift RLS policy catalog")
        lines.append(
            f"SELECT * FROM SVV_RLS_POLICY WHERE policy_name LIKE '{base_rls_name}%';"
        )
        lines.append("")
        return lines

    # ─── Grant Privileges ──────────────────────────────────────────────────────

    def _compile_grants(
        self,
        action: dict,
        schema_name: str,
        full_table_path: str,
        member_users: list[dict],
        role_codes: list[str],
    ) -> list[str]:
        """Compile GRANT_SELECT/INSERT/UPDATE actions into Redshift privilege DDL."""
        lines: list[str] = []
        act_type = action.get("action_type", "GRANT_SELECT")
        verb_map = {
            "GRANT_SELECT": "SELECT",
            "GRANT_INSERT": "INSERT",
            "GRANT_UPDATE": "UPDATE",
        }
        sql_verb = verb_map.get(act_type, "SELECT")

        if member_users:
            skipped = []
            for u in member_users:
                rs_uid = u.get("redshift_user")
                disp_name = u.get("display_name") or u.get("username")
                grp_code = u.get("role_code") or "MEMBER"
                if rs_uid:
                    lines.append(
                        f"-- ─── Privileges for User: {disp_name} ({u.get('username')}) | Redshift User: {rs_uid} [Group: {grp_code}] ───"
                    )
                    lines.append(f"GRANT USAGE ON SCHEMA {schema_name} TO USER {rs_uid};")
                    lines.append(
                        f"GRANT {sql_verb} ON TABLE {full_table_path} TO USER {rs_uid};"
                    )
                    lines.append(f"-- Verification: Test query as user {rs_uid}")
                    lines.append(
                        f"-- SET SESSION AUTHORIZATION '{rs_uid}'; SELECT * FROM {full_table_path} LIMIT 10;"
                    )
                    lines.append("")
                else:
                    skipped.append(f"{disp_name} ({u.get('username')})")

            if skipped:
                for s in skipped:
                    lines.append(f"-- WARNING: Skipped user {s} — no Redshift platform_user_mapping")
                lines.append("")
        else:
            for r in role_codes:
                lines.append(f"GRANT USAGE ON SCHEMA {schema_name} TO ROLE {r};")
                lines.append(
                    f"GRANT {sql_verb} ON TABLE {full_table_path} TO ROLE {r};"
                )
            lines.append("")

        return lines
