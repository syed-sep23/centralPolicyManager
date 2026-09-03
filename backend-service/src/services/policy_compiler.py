"""Policy Compiler Service — Universal Governance Models & OPA Rego Generation.

Connects strictly to PostgreSQL system catalog and generates universal
data entitlement definitions and OPA Rego rules.
Platform-specific DDL compilation (Snowflake, Redshift) is encapsulated
within each respective connector microservice.
"""

from datetime import date, datetime
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = structlog.get_logger()


async def fetch_policy_raw_payload(version_id: int, db: AsyncSession) -> dict[str, Any]:
    """Fetch complete policy version hierarchy from PostgreSQL as raw dict."""
    ver_row = (
        (
            await db.execute(
                text("""
            SELECT v.*, p.policy_name, p.policy_code, p.description, p.enforce_mode, p.domain_id, p.product_id
            FROM policy_versions v
            JOIN policies p ON p.policy_id = v.policy_id
            WHERE v.version_id = :vid
        """),
                {"vid": version_id},
            )
        )
        .mappings()
        .first()
    )
    if not ver_row:
        return {}

    rules_rows = (
        (
            await db.execute(
                text(
                    "SELECT * FROM policy_rules WHERE version_id = :vid AND is_active = TRUE ORDER BY rule_order"
                ),
                {"vid": version_id},
            )
        )
        .mappings()
        .all()
    )

    rules = []
    for rule in rules_rows:
        rid = rule["rule_id"]

        actions = [
            dict(r)
            for r in (
                await db.execute(
                    text("SELECT * FROM policy_rule_actions WHERE rule_id = :rid"), {"rid": rid}
                )
            )
            .mappings()
            .all()
        ]

        conditions = [
            dict(r)
            for r in (
                await db.execute(
                    text(
                        "SELECT * FROM policy_rule_conditions WHERE rule_id = :rid ORDER BY condition_id"
                    ),
                    {"rid": rid},
                )
            )
            .mappings()
            .all()
        ]

        resources = [
            dict(r)
            for r in (
                await db.execute(
                    text("SELECT * FROM policy_rule_resources WHERE rule_id = :rid"), {"rid": rid}
                )
            )
            .mappings()
            .all()
        ]

        subjects = [
            dict(r)
            for r in (
                await db.execute(
                    text("SELECT * FROM policy_rule_subjects WHERE rule_id = :rid"), {"rid": rid}
                )
            )
            .mappings()
            .all()
        ]

        r_dict = dict(rule)
        r_dict["actions"] = actions
        r_dict["conditions"] = conditions
        r_dict["resources"] = resources
        r_dict["subjects"] = subjects
        rules.append(r_dict)

    tag_rows = (
        (
            await db.execute(
                text("""
            SELECT DISTINCT t.tag_name, t.tag_category, t.full_path AS tag_code
            FROM policy_rules pr
            JOIN policy_rule_resources prr ON prr.rule_id = pr.rule_id
            JOIN policy_rule_resource_tags prt ON prt.resource_id = prr.resource_id
            JOIN metadata_tags t ON t.tag_id = prt.tag_id
            WHERE pr.version_id = :vid
        """),
                {"vid": version_id},
            )
        )
        .mappings()
        .all()
    )

    target_rows = (
        (
            await db.execute(
                text("""
            SELECT p.platform_code, p.platform_name, vt.deployment_status, vt.deployed_at
            FROM policy_version_targets vt
            JOIN metadata_platforms p ON p.platform_id = vt.platform_id
            WHERE vt.version_id = :vid
        """),
                {"vid": version_id},
            )
        )
        .mappings()
        .all()
    )

    def _json_serial(obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return obj

    raw = {k: _json_serial(v) for k, v in dict(ver_row).items()}
    raw["rules"] = rules
    raw["tags"] = [dict(t) for t in tag_rows]
    raw["targets"] = [dict(t) for t in target_rows]
    return raw


def compile_opa_rego(raw_payload: dict[str, Any]) -> str:
    """Compile policy definition into declarative Open Policy Agent (OPA) Rego policy."""
    policy_code = (raw_payload.get("policy_code") or "CES_POLICY").lower().replace("-", "_")
    lines = [
        "# ============================================================================",
        "# OPEN POLICY AGENT (OPA) REGO EVALUATION POLICY",
        f"# Policy Code: {raw_payload.get('policy_code', 'UNKNOWN')}",
        f"# Generated At: {datetime.now().isoformat()}",
        "# ============================================================================",
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
        if not isinstance(rule, dict):
            continue
        rule_name = rule.get("rule_name", f"rule_{idx}")
        effect = (rule.get("effect") or "ALLOW").lower()

        for s in rule.get("subjects", []):
            if isinstance(s, dict):
                role_code = s.get("role_code")
            elif isinstance(s, str):
                role_code = s
            else:
                role_code = None

            if role_code:
                lines.append(f"# Rule {idx}: {rule_name} for role {role_code}")
                if effect == "allow":
                    lines.append(f"allow if '{role_code}' in input.user.roles")
                elif effect == "deny":
                    lines.append(f"allow := false if '{role_code}' in input.user.roles")
                lines.append("")

        for action in rule.get("actions", []):
            if not isinstance(action, dict):
                continue
            if action.get("action_type") == "MASK_COLUMN":
                mask_col = action.get("filter_column", "UNKNOWN")
                mask_type = action.get("mask_type", "HASH_SHA256")
                lines.append("mask_action := {")
                lines.append(f'    "column": "{mask_col}",')
                lines.append(f'    "type": "{mask_type}"')
                lines.append("} if not allow")
                lines.append("")

    return "\n".join(lines)


def generate_natural_language_summary(raw_payload: dict[str, Any]) -> str:
    """Generate human-readable governance summary of the policy hierarchy."""
    policy_name = raw_payload.get("policy_name", "Untitled Policy")
    policy_code = raw_payload.get("policy_code", "N/A")
    enforce_mode = raw_payload.get("enforce_mode", "ENFORCE")
    rules = raw_payload.get("rules", [])

    raw_tags = raw_payload.get("tags", [])
    tags = []
    for t in raw_tags:
        if isinstance(t, str):
            tags.append(t)
        elif isinstance(t, dict):
            val = t.get("tag_name") or t.get("tag_code") or ""
            if val:
                tags.append(val)

    summary = [
        f"Policy '{policy_name}' ({policy_code}) is configured in {enforce_mode} mode.",
        f"It contains {len(rules)} active governance rule(s).",
    ]

    if tags:
        summary.append(f"Bound to metadata tags: {', '.join(tags)}.")

    for idx, r in enumerate(rules, 1):
        if not isinstance(r, dict):
            continue
        actions = [a.get("action_type") for a in r.get("actions", []) if isinstance(a, dict)]
        subjects = []
        for s in r.get("subjects", []):
            if isinstance(s, dict):
                rc = s.get("role_code")
                if rc:
                    subjects.append(rc)
            elif isinstance(s, str):
                subjects.append(s)

        actions_str = ", ".join(actions) if actions else "NO_ACTION"
        subj_str = ", ".join(subjects) if subjects else "ALL_USERS"
        summary.append(
            f"- Rule #{idx} ('{r.get('rule_name', 'Rule')}'): {r.get('effect', 'ALLOW')} {actions_str} for subjects [{subj_str}]."
        )

    return "\n".join(summary)
