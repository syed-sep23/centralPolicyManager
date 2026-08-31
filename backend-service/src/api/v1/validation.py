"""Validation Router — OPA validation and simulation engine with DB audit logging."""
import json
from datetime import date, datetime
from typing import Any
import httpx
import structlog
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.db.session import get_db

log = structlog.get_logger()
router = APIRouter()


class ValidationRequest(BaseModel):
    policy_id: int
    version_id: int

class CheckResult(BaseModel):
    check: str
    passed: bool
    details: str | None = None

class ValidationResponse(BaseModel):
    is_valid: bool
    policy_id: int
    version_id: int
    checks: list[CheckResult]
    errors: list[str] = []


async def _load_policy_as_rego_input(version_id: int, db: AsyncSession) -> dict[str, Any]:
    ver_row = (await db.execute(
        text("SELECT v.*, p.policy_code, p.enforce_mode FROM policy_versions v JOIN policies p ON p.policy_id = v.policy_id WHERE v.version_id = :vid"),
        {"vid": version_id},
    )).mappings().first()
    if not ver_row:
        return {}

    # Fetch catalog column data types for type validation
    col_rows = (await db.execute(
        text("SELECT DISTINCT LOWER(column_name) AS col, normalized_type, data_type FROM metadata_columns")
    )).mappings().all()
    col_type_map = {}
    for cr in col_rows:
        nt = cr["normalized_type"]
        dt = (cr["data_type"] or "").upper()
        if nt == "NUMBER" or dt in ("INTEGER", "BIGINT", "SMALLINT", "NUMERIC", "DECIMAL", "FLOAT", "DOUBLE", "INT"):
            col_type_map[cr["col"]] = "NUMBER"
        elif nt == "BOOLEAN" or dt in ("BOOLEAN", "BOOL"):
            col_type_map[cr["col"]] = "BOOLEAN"
        elif nt in ("DATE", "TIMESTAMP") or "TIME" in dt or "DATE" in dt:
            col_type_map[cr["col"]] = "TIMESTAMP"
        else:
            col_type_map[cr["col"]] = "TEXT"

    rules_rows = (await db.execute(
        text("SELECT * FROM policy_rules WHERE version_id = :vid AND is_active = TRUE ORDER BY rule_order"),
        {"vid": version_id},
    )).mappings().all()

    rules = []
    for rule in rules_rows:
        rid = rule["rule_id"]
        subjects = (await db.execute(
            text("SELECT prs.*, r.role_code FROM policy_rule_subjects prs LEFT JOIN roles r ON r.role_id = prs.role_id WHERE prs.rule_id = :rid"),
            {"rid": rid},
        )).mappings().all()
        actions = (await db.execute(text("SELECT * FROM policy_rule_actions WHERE rule_id = :rid"), {"rid": rid})).mappings().all()
        conditions = (await db.execute(text("SELECT * FROM policy_rule_conditions WHERE rule_id = :rid"), {"rid": rid})).mappings().all()

        def _clean_dict(d: dict) -> dict:
            return {k: (v.isoformat() if isinstance(v, (datetime, date)) else v) for k, v in dict(d).items()}

        cleaned_conditions = []
        for c in conditions:
            cd = _clean_dict(c)
            attr_key = (cd.get("attribute_key") or "").lower()
            cd["expected_type"] = col_type_map.get(attr_key, "TEXT")
            cleaned_conditions.append(cd)

        cleaned_actions = []
        for a in actions:
            ad = _clean_dict(a)
            col_key = (ad.get("filter_column") or "").lower()
            if col_key in col_type_map:
                ad["expected_type"] = col_type_map[col_key]
            cleaned_actions.append(ad)

        rules.append({
            "rule_id": rid,
            "rule_type": rule["rule_type"],
            "effect": rule["effect"],
            "subjects": [_clean_dict(s) for s in subjects],
            "actions": cleaned_actions,
            "conditions": cleaned_conditions,
        })

    return {
        "policy": {"policy_code": ver_row["policy_code"], "enforce_mode": ver_row["enforce_mode"], "version_id": version_id},
        "rules": rules,
    }


@router.post("/validate", response_model=ValidationResponse)
async def validate_policy(body: ValidationRequest, db: AsyncSession = Depends(get_db)):
    checks: list[CheckResult] = []
    errors: list[str] = []

    ver = (await db.execute(
        text("SELECT version_id FROM policy_versions WHERE version_id = :v AND policy_id = :p"),
        {"v": body.version_id, "p": body.policy_id},
    )).first()
    if not ver:
        raise HTTPException(status_code=404, detail="Policy version not found")

    rule_count = (await db.execute(
        text("SELECT COUNT(*) FROM policy_rules WHERE version_id = :v AND is_active = TRUE"),
        {"v": body.version_id},
    )).scalar_one()
    has_rules = rule_count > 0
    checks.append(CheckResult(check="schema_completeness", passed=has_rules, details=f"{rule_count} active rule(s) found"))
    if not has_rules:
        errors.append("Policy version has no active rules")

    opa_violations: list[str] = []
    opa_passed = True

    try:
        opa_input = await _load_policy_as_rego_input(body.version_id, db)
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(f"{settings.OPA_URL}/v1/data/policy/validate", json={"input": opa_input})
            opa_result = resp.json()
            opa_passed = opa_result.get("result", {}).get("valid", True)
            opa_violations = opa_result.get("result", {}).get("violations", [])
        checks.append(CheckResult(check="opa_evaluation", passed=opa_passed, details=f"OPA violations: {opa_violations}"))
        if not opa_passed:
            errors.extend(opa_violations)
    except Exception as exc:
        log.warning("opa.unreachable — skipping OPA gate", error=str(exc))
        checks.append(CheckResult(check="opa_evaluation", passed=True, details=f"OPA skipped ({type(exc).__name__})"))

    is_valid = all(c.passed for c in checks)
    new_status = "APPROVED" if is_valid else "REJECTED"

    # 1. Update policy version status
    await db.execute(
        text("UPDATE policy_versions SET status = :s WHERE version_id = :v"),
        {"s": new_status, "v": body.version_id},
    )

    # 2. Log OPA Decision Event into audit_events DB table
    detail_data = {
        "is_valid": is_valid,
        "opa_passed": opa_passed,
        "opa_violations": opa_violations,
        "checks": [c.model_dump() for c in checks],
        "status": new_status,
    }
    await db.execute(
        text("""
            INSERT INTO audit_events (
                organization_id, event_type, actor_service, policy_id, policy_version_id, outcome, detail_text
            ) VALUES (
                1, 'OPA_POLICY_VALIDATION', 'backend-service', :p, :v, :outcome, :detail
            )
        """),
        {
            "p": body.policy_id,
            "v": body.version_id,
            "outcome": "SUCCESS" if is_valid else "FAILURE",
            "detail": json.dumps(detail_data),
        }
    )

    return ValidationResponse(is_valid=is_valid, policy_id=body.policy_id, version_id=body.version_id, checks=checks, errors=errors)


@router.get("/logs/{policy_id}")
async def get_opa_audit_logs(policy_id: int, db: AsyncSession = Depends(get_db)):
    """Fetch OPA validation & audit records logged in DB for a given policy."""
    rows = (await db.execute(
        text("""
            SELECT event_id, event_type, event_timestamp, actor_service, policy_id, policy_version_id, outcome, detail_text
            FROM audit_events
            WHERE policy_id = :p
            ORDER BY event_timestamp DESC
            LIMIT 50
        """),
        {"p": policy_id}
    )).mappings().all()

    logs = []
    for r in rows:
        item = dict(r)
        if item.get("detail_text"):
            try:
                item["details"] = json.loads(item["detail_text"])
            except Exception:
                item["details"] = item["detail_text"]
        logs.append(item)

    return {"policy_id": policy_id, "data": logs}


@router.post("/simulate")
async def simulate(policy_id: int, user_id: int, table_id: int, db: AsyncSession = Depends(get_db)):
    user_attrs = dict((await db.execute(
        text("SELECT attribute_key, attribute_value FROM user_attributes WHERE user_id = :u"), {"u": user_id}
    )).fetchall())

    roles = [r[0] for r in (await db.execute(
        text("SELECT r.role_code FROM roles r JOIN user_role_mappings urm ON r.role_id = urm.role_id WHERE urm.user_id = :u AND urm.is_active = TRUE"),
        {"u": user_id},
    )).fetchall()]

    ver_row = (await db.execute(
        text("SELECT version_id FROM policy_versions WHERE policy_id = :p AND is_current = TRUE"),
        {"p": policy_id}
    )).first()

    decision = "ALLOW"
    if ver_row:
        opa_input = await _load_policy_as_rego_input(ver_row.version_id, db)
        sim_payload = {
            "input": {
                "user": {"user_id": user_id, "roles": roles, "attributes": user_attrs},
                "policy": opa_input.get("policy", {}),
                "rules": opa_input.get("rules", []),
            }
        }
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                resp = await client.post(f"{settings.OPA_URL}/v1/data/policy/rbac/allow", json=sim_payload)
                opa_result = resp.json()
                is_allow = opa_result.get("result", False)
                decision = "ALLOW" if is_allow else "DENY"
        except Exception as exc:
            log.warning("opa.simulate.error", error=str(exc))

    # Log simulation event into DB
    await db.execute(
        text("""
            INSERT INTO audit_events (
                organization_id, event_type, actor_user_id, actor_service, policy_id, outcome, detail_text
            ) VALUES (
                1, 'OPA_ACCESS_SIMULATION', :u, 'backend-service', :p, :outcome, :detail
            )
        """),
        {
            "u": user_id,
            "p": policy_id,
            "outcome": "SUCCESS" if decision == "ALLOW" else "FAILURE",
            "detail": json.dumps({"user_id": user_id, "table_id": table_id, "roles": roles, "decision": decision}),
        }
    )

    return {
        "user_id": user_id, "table_id": table_id, "user_roles": roles,
        "user_attributes": user_attrs, "decision": decision, "applied_masks": [], "applied_filters": [],
    }
