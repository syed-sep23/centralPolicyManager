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

        subj_rows = (
            await db.execute(
                text("""
                    SELECT prs.*, r.role_code, r.role_name, u.username, u.display_name, u.email
                    FROM policy_rule_subjects prs
                    LEFT JOIN roles r ON r.role_id = prs.role_id
                    LEFT JOIN users u ON u.user_id = prs.user_id
                    WHERE prs.rule_id = :rid
                """),
                {"rid": rid},
            )
        ).mappings().all()

        subjects = []
        rule_users_dict = {}

        for s_row in subj_rows:
            s_dict = dict(s_row)
            stype = s_dict.get("subject_type")
            rid_role = s_dict.get("role_id")
            uid_subj = s_dict.get("user_id")

            # Resolve individual users belonging to this subject
            user_candidates = []
            if stype == "ROLE" or rid_role:
                users_in_role = (
                    await db.execute(
                        text("""
                            SELECT u.user_id, u.username, u.display_name, u.email,
                                   r.role_code, r.role_name
                            FROM user_role_mappings urm
                            JOIN users u ON u.user_id = urm.user_id
                            JOIN roles r ON r.role_id = urm.role_id
                            WHERE urm.role_id = :role_id AND urm.is_active = TRUE AND u.is_active = TRUE
                        """),
                        {"role_id": rid_role},
                    )
                ).mappings().all()
                user_candidates.extend([dict(u) for u in users_in_role])
            elif stype == "USER" or uid_subj:
                user_res = (
                    await db.execute(
                        text("""
                            SELECT u.user_id, u.username, u.display_name, u.email
                            FROM users u
                            WHERE u.user_id = :user_id AND u.is_active = TRUE
                        """),
                        {"user_id": uid_subj},
                    )
                ).mappings().all()
                for u in user_res:
                    ud = dict(u)
                    ud["role_code"] = None
                    ud["role_name"] = "DIRECT_USER"
                    user_candidates.append(ud)
            elif stype == "ANY":
                all_users = (
                    await db.execute(
                        text("""
                            SELECT u.user_id, u.username, u.display_name, u.email
                            FROM users u
                            WHERE u.is_active = TRUE
                        """)
                    )
                ).mappings().all()
                for u in all_users:
                    ud = dict(u)
                    ud["role_code"] = "ANY"
                    ud["role_name"] = "All Users"
                    user_candidates.append(ud)

            # Query platform_user_mappings for external user IDs
            resolved_members = []
            for uc in user_candidates:
                uid = uc["user_id"]
                pums = (
                    await db.execute(
                        text("""
                            SELECT platform_code, external_user_id
                            FROM platform_user_mappings
                            WHERE user_id = :uid
                        """),
                        {"uid": uid},
                    )
                ).mappings().all()
                ext_map = {m["platform_code"]: m["external_user_id"] for m in pums}
                u_obj = {
                    "user_id": uid,
                    "username": uc["username"],
                    "display_name": uc.get("display_name") or uc["username"],
                    "email": uc.get("email"),
                    "role_code": uc.get("role_code") or s_dict.get("role_code"),
                    "role_name": uc.get("role_name") or s_dict.get("role_name"),
                    "external_mappings": ext_map,
                    "snowflake_user": ext_map.get("SNOWFLAKE") or uc["username"].upper(),
                    "redshift_user": ext_map.get("REDSHIFT") or uc["username"].lower(),
                }
                resolved_members.append(u_obj)
                if uid not in rule_users_dict:
                    rule_users_dict[uid] = u_obj

            s_dict["member_users"] = resolved_members
            subjects.append(s_dict)

        r_dict = dict(rule)
        r_dict["actions"] = actions
        r_dict["conditions"] = conditions
        r_dict["resources"] = resources
        r_dict["subjects"] = subjects
        r_dict["member_users"] = list(rule_users_dict.values())
        rules.append(r_dict)

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

    all_target_users = {}
    for r in rules:
        for u in r.get("member_users", []):
            all_target_users[u["user_id"]] = u

    def _json_serial(obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return obj

    raw = {k: _json_serial(v) for k, v in dict(ver_row).items()}
    raw["rules"] = rules
    raw["targets"] = [dict(t) for t in target_rows]
    raw["target_users"] = list(all_target_users.values())
    return raw


def compile_opa_rego(raw_payload: dict[str, Any]) -> str:
    """Compile policy definition into declarative Open Policy Agent (OPA) Rego policy."""
    policy_code = (raw_payload.get("policy_code") or "CES_POLICY").lower().replace("-", "_")
    lines = [
        "# ============================================================================",
        "# OPEN POLICY AGENT (OPA) REGO EVALUATION POLICY",
        f"# Policy Code: {raw_payload.get('policy_code', 'UNKNOWN')}",
        f"# Generated At: {datetime.now().isoformat()}",
        "# Per-User Compilation: Enabled (Expanded from Subject Groups & Roles)",
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

    target_users = raw_payload.get("target_users", [])
    if target_users:
        lines.append("# --- Target User Scope ---")
        for tu in target_users:
            uname = tu.get("username")
            disp = tu.get("display_name", uname)
            rcode = tu.get("role_code") or "MEMBER"
            lines.append(f"# User: {disp} ({uname}) | Group/Role: {rcode}")
        lines.append("")

    rules = raw_payload.get("rules", [])
    for idx, rule in enumerate(rules, 1):
        if not isinstance(rule, dict):
            continue
        rule_name = rule.get("rule_name", f"rule_{idx}")
        effect = (rule.get("effect") or "ALLOW").lower()

        member_users = rule.get("member_users", [])
        if member_users:
            for u in member_users:
                uname = u.get("username")
                disp = u.get("display_name", uname)
                rcode = u.get("role_code") or "MEMBER"
                lines.append(f"# Rule {idx}: {rule_name} compiled per user: {disp} ({uname}) [Group: {rcode}]")
                if effect == "allow":
                    lines.append(f'allow if input.user.username == "{uname}"')
                elif effect == "deny":
                    lines.append(f'allow := false if input.user.username == "{uname}"')
                lines.append("")
        else:
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

    target_users = raw_payload.get("target_users", [])
    summary = [
        f"Policy '{policy_name}' ({policy_code}) is configured in {enforce_mode} mode.",
        f"It contains {len(rules)} active governance rule(s).",
    ]

    if target_users:
        u_list = [f"{u.get('display_name', u.get('username'))} ({u.get('username')})" for u in target_users]
        summary.append(f"Compiled individually for {len(target_users)} user(s): {', '.join(u_list)}.")

    for idx, r in enumerate(rules, 1):
        if not isinstance(r, dict):
            continue
        actions = [a.get("action_type") for a in r.get("actions", []) if isinstance(a, dict)]
        user_members = [
            f"{u.get('display_name', u.get('username'))} ({u.get('username')})"
            for u in r.get("member_users", [])
        ]
        subjects = []
        for s in r.get("subjects", []):
            if isinstance(s, dict):
                rc = s.get("role_code")
                if rc:
                    subjects.append(rc)
            elif isinstance(s, str):
                subjects.append(s)

        actions_str = ", ".join(actions) if actions else "NO_ACTION"
        if user_members:
            subj_str = f"Users: [{', '.join(user_members)}]"
        elif subjects:
            subj_str = f"Roles: [{', '.join(subjects)}]"
        else:
            subj_str = "ALL_USERS"
        summary.append(
            f"- Rule #{idx} ('{r.get('rule_name', 'Rule')}'): {r.get('effect', 'ALLOW')} {actions_str} for {subj_str}."
        )

    return "\n".join(summary)
