"""Conditions Router."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import CurrentUser, require_roles
from db.session import get_db
from models.models import PolicyRuleCondition
from schemas.schemas import ConditionCreate, ConditionRead

router = APIRouter()


@router.post(
    "/{policy_id}/rules/{rule_id}/conditions",
    response_model=ConditionRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_condition(
    policy_id: int,
    rule_id: int,
    body: ConditionCreate,
    current_user: CurrentUser = Depends(
        require_roles("POLICY_AUTHOR", "POLICY_ADMIN", "SUPER_ADMIN")
    ),
    db: AsyncSession = Depends(get_db),
):
    condition = PolicyRuleCondition(rule_id=rule_id, **body.model_dump())
    db.add(condition)
    await db.flush()
    await db.refresh(condition)
    return condition


@router.delete(
    "/{policy_id}/rules/{rule_id}/conditions/{condition_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_condition(
    policy_id: int,
    rule_id: int,
    condition_id: int,
    current_user: CurrentUser = Depends(
        require_roles("POLICY_AUTHOR", "POLICY_ADMIN", "SUPER_ADMIN")
    ),
    db: AsyncSession = Depends(get_db),
):
    cond = (
        await db.execute(
            select(PolicyRuleCondition).where(PolicyRuleCondition.condition_id == condition_id)
        )
    ).scalar_one_or_none()
    if not cond:
        raise HTTPException(status_code=404, detail="Condition not found")
    await db.delete(cond)
