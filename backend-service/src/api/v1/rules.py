"""Rules Router."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from core.auth import CurrentUser, get_current_user, require_roles
from db.session import get_db
from models.models import (
    Policy,
    PolicyRule,
    PolicyRuleAction,
    PolicyRuleCondition,
    PolicyRuleResource,
    PolicyRuleSubject,
    PolicyVersion,
)
from schemas.schemas import RuleCreate, RuleRead

router = APIRouter()


@router.get("/{policy_id}/rules", response_model=list[RuleRead])
async def list_rules(
    policy_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    policy = (
        await db.execute(select(Policy).where(Policy.policy_id == policy_id))
    ).scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    version_id = policy.current_version_id
    if not version_id:
        ver_row = (
            await db.execute(
                select(PolicyVersion.version_id)
                .where(PolicyVersion.policy_id == policy_id)
                .order_by(PolicyVersion.version_number.desc())
            )
        ).first()
        if ver_row:
            version_id = ver_row[0]

    if not version_id:
        raise HTTPException(status_code=404, detail="Policy version not found")

    stmt = (
        select(PolicyRule)
        .where(PolicyRule.version_id == version_id)
        .options(
            selectinload(PolicyRule.subjects),
            selectinload(PolicyRule.actions),
            selectinload(PolicyRule.conditions),
            selectinload(PolicyRule.resources),
        )
        .order_by(PolicyRule.rule_order)
    )
    return (await db.execute(stmt)).scalars().all()


@router.post("/{policy_id}/rules", response_model=RuleRead, status_code=status.HTTP_201_CREATED)
async def add_rule(
    policy_id: int,
    body: RuleCreate,
    current_user: CurrentUser = Depends(
        require_roles("POLICY_AUTHOR", "POLICY_ADMIN", "SUPER_ADMIN")
    ),
    db: AsyncSession = Depends(get_db),
):
    policy = (
        await db.execute(select(Policy).where(Policy.policy_id == policy_id))
    ).scalar_one_or_none()
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    version_id = policy.current_version_id
    if not version_id:
        ver_row = (
            await db.execute(
                select(PolicyVersion.version_id)
                .where(PolicyVersion.policy_id == policy_id)
                .order_by(PolicyVersion.version_number.desc())
            )
        ).first()
        if ver_row:
            version_id = ver_row[0]

    if not version_id:
        raise HTTPException(status_code=404, detail="Policy version not found")

    rule = PolicyRule(
        version_id=version_id,
        rule_name=body.rule_name,
        rule_description=body.rule_description,
        rule_order=body.rule_order,
        rule_type=body.rule_type,
        effect=body.effect,
    )
    db.add(rule)
    await db.flush()

    for s in body.subjects:
        db.add(PolicyRuleSubject(rule_id=rule.rule_id, **s.model_dump()))
    for a in body.actions:
        db.add(PolicyRuleAction(rule_id=rule.rule_id, **a.model_dump()))
    for c in body.conditions:
        db.add(PolicyRuleCondition(rule_id=rule.rule_id, **c.model_dump()))
    for r in body.resources:
        db.add(PolicyRuleResource(rule_id=rule.rule_id, **r.model_dump()))

    await db.flush()
    await db.refresh(rule)

    stmt = (
        select(PolicyRule)
        .where(PolicyRule.rule_id == rule.rule_id)
        .options(
            selectinload(PolicyRule.subjects),
            selectinload(PolicyRule.actions),
            selectinload(PolicyRule.conditions),
            selectinload(PolicyRule.resources),
        )
    )
    return (await db.execute(stmt)).scalar_one()


@router.delete("/{policy_id}/rules/{rule_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_rule(
    policy_id: int,
    rule_id: int,
    current_user: CurrentUser = Depends(
        require_roles("POLICY_AUTHOR", "POLICY_ADMIN", "SUPER_ADMIN")
    ),
    db: AsyncSession = Depends(get_db),
):
    rule = (
        await db.execute(select(PolicyRule).where(PolicyRule.rule_id == rule_id))
    ).scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
