"""Policy business logic — create, update, submit, rollback, deprecate."""
from __future__ import annotations

import httpx
import structlog
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.core.config import settings
from src.models.models import (
    Policy, PolicyVersion, PolicyRule,
    PolicyRuleSubject, PolicyRuleAction, PolicyRuleCondition, PolicyRuleResource,
)
from src.schemas.schemas import PolicyCreate, PolicyUpdate

log = structlog.get_logger()


class PolicyService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_policies(
        self, org_id: int, page: int, size: int,
        status_filter: str | None = None,
        domain_id: int | None = None,
    ) -> tuple[int, list[Policy]]:
        stmt = select(Policy).where(Policy.organization_id == org_id)
        if status_filter:
            stmt = stmt.where(Policy.status == status_filter)
        if domain_id:
            stmt = stmt.where(Policy.domain_id == domain_id)

        total = (await self.db.execute(select(func.count()).select_from(stmt.subquery()))).scalar_one()
        items = (await self.db.execute(stmt.offset((page - 1) * size).limit(size))).scalars().all()
        return total, list(items)

    async def create_policy(self, data: PolicyCreate, owner_user_id: int, org_id: int) -> Policy:
        policy = Policy(
            organization_id=org_id,
            policy_name=data.policy_name,
            policy_code=data.policy_code,
            description=data.description,
            domain_id=data.domain_id,
            product_id=data.product_id,
            owner_user_id=owner_user_id,
            enforce_mode=data.enforce_mode,
            effective_date=data.effective_date,
            expiry_date=data.expiry_date,
            status="DRAFT",
        )
        self.db.add(policy)
        await self.db.flush()

        version = PolicyVersion(
            policy_id=policy.policy_id,
            version_number=1,
            version_label="v1.0",
            is_current=True,
            authored_by_user_id=owner_user_id,
            status="DRAFT",
            change_summary="Initial draft",
        )
        self.db.add(version)
        await self.db.flush()

        for rule_data in data.rules:
            rule = PolicyRule(
                version_id=version.version_id,
                rule_name=rule_data.rule_name,
                rule_description=rule_data.rule_description,
                rule_order=rule_data.rule_order,
                rule_type=rule_data.rule_type,
                effect=rule_data.effect,
            )
            self.db.add(rule)
            await self.db.flush()
            for s in rule_data.subjects:
                self.db.add(PolicyRuleSubject(rule_id=rule.rule_id, **s.model_dump()))
            for a in rule_data.actions:
                self.db.add(PolicyRuleAction(rule_id=rule.rule_id, **a.model_dump()))
            for c in rule_data.conditions:
                self.db.add(PolicyRuleCondition(rule_id=rule.rule_id, **c.model_dump()))
            for r in rule_data.resources:
                self.db.add(PolicyRuleResource(rule_id=rule.rule_id, **r.model_dump()))

        if data.target_platform_ids:
            from sqlalchemy import text
            for pid in data.target_platform_ids:
                await self.db.execute(
                    text("INSERT INTO policy_version_targets (version_id, platform_id) VALUES (:v, :p) ON CONFLICT DO NOTHING"),
                    {"v": version.version_id, "p": pid},
                )

        policy.current_version_id = version.version_id
        await self.db.flush()
        await self.db.refresh(policy)
        log.info("policy.created", policy_id=policy.policy_id, code=policy.policy_code)
        return policy

    async def get_policy_detail(self, policy_id: int) -> Policy | None:
        stmt = (
            select(Policy)
            .where(Policy.policy_id == policy_id)
            .options(
                selectinload(Policy.versions)
                .selectinload(PolicyVersion.rules)
                .selectinload(PolicyRule.subjects),
                selectinload(Policy.versions)
                .selectinload(PolicyVersion.rules)
                .selectinload(PolicyRule.actions),
                selectinload(Policy.versions)
                .selectinload(PolicyVersion.rules)
                .selectinload(PolicyRule.conditions),
                selectinload(Policy.versions)
                .selectinload(PolicyVersion.rules)
                .selectinload(PolicyRule.resources),
            )
        )
        policy = (await self.db.execute(stmt)).scalar_one_or_none()
        if not policy:
            return None

        # Populate target_platform_ids for current version
        version_id = policy.current_version_id
        if not version_id and policy.versions:
            version_id = policy.versions[0].version_id

        if version_id:
            from sqlalchemy import text
            rows = (await self.db.execute(
                text("SELECT platform_id FROM policy_version_targets WHERE version_id = :v"),
                {"v": version_id}
            )).scalars().all()
            policy.target_platform_ids = list(rows)

        # Set current_version
        for v in policy.versions:
            if v.is_current:
                policy.current_version = v
                break
        if not getattr(policy, "current_version", None) and policy.versions:
            policy.current_version = policy.versions[0]

        return policy

    async def update_policy(self, policy_id: int, data: PolicyUpdate) -> Policy | None:
        policy = (await self.db.execute(select(Policy).where(Policy.policy_id == policy_id))).scalar_one_or_none()
        if not policy:
            return None

        update_dict = data.model_dump(exclude_unset=True)
        rules_data = update_dict.pop("rules", None)
        target_platform_ids = update_dict.pop("target_platform_ids", None)

        for field, value in update_dict.items():
            setattr(policy, field, value)

        from sqlalchemy import text

        # Get active version to update
        version_stmt = select(PolicyVersion).where(PolicyVersion.policy_id == policy_id, PolicyVersion.is_current == True)
        version = (await self.db.execute(version_stmt)).scalar_one_or_none()

        if version and version.status == "DEPLOYED":
            version.is_current = False
            await self.db.flush()

            new_vnum = version.version_number + 1
            new_version = PolicyVersion(
                policy_id=policy_id,
                version_number=new_vnum,
                version_label=f"v{new_vnum}.0",
                is_current=True,
                authored_by_user_id=policy.owner_user_id,
                status="DRAFT",
                change_summary=f"Updated policy rules and settings from v{version.version_number}.0",
            )
            self.db.add(new_version)
            await self.db.flush()
            version = new_version
            policy.current_version_id = version.version_id

        if version:
            if rules_data is not None:
                await self.db.execute(text("DELETE FROM policy_rules WHERE version_id = :v"), {"v": version.version_id})
                for rule_data in data.rules or []:
                    rule = PolicyRule(
                        version_id=version.version_id,
                        rule_name=rule_data.rule_name,
                        rule_description=rule_data.rule_description,
                        rule_order=rule_data.rule_order,
                        rule_type=rule_data.rule_type,
                        effect=rule_data.effect,
                    )
                    self.db.add(rule)
                    await self.db.flush()
                    for s in rule_data.subjects:
                        self.db.add(PolicyRuleSubject(rule_id=rule.rule_id, **s.model_dump()))
                    for a in rule_data.actions:
                        self.db.add(PolicyRuleAction(rule_id=rule.rule_id, **a.model_dump()))
                    for c in rule_data.conditions:
                        self.db.add(PolicyRuleCondition(rule_id=rule.rule_id, **c.model_dump()))
                    for r in rule_data.resources:
                        self.db.add(PolicyRuleResource(rule_id=rule.rule_id, **r.model_dump()))

            if target_platform_ids is not None:
                await self.db.execute(text("DELETE FROM policy_version_targets WHERE version_id = :v"), {"v": version.version_id})
                for pid in target_platform_ids:
                    await self.db.execute(
                        text("INSERT INTO policy_version_targets (version_id, platform_id) VALUES (:v, :p) ON CONFLICT DO NOTHING"),
                        {"v": version.version_id, "p": pid},
                    )

        await self.db.flush()
        await self.db.refresh(policy)
        return policy

    async def deprecate_policy(self, policy_id: int) -> None:
        policy = (await self.db.execute(select(Policy).where(Policy.policy_id == policy_id))).scalar_one_or_none()
        if policy:
            policy.status = "DEPRECATED"
            await self.db.flush()
