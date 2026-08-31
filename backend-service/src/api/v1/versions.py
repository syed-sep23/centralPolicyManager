"""Policy Versions Router."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.db.session import get_db
from src.models.models import PolicyVersion, PolicyRule
from src.schemas.schemas import VersionRead
from src.core.auth import get_current_user, CurrentUser

router = APIRouter()


@router.get("/{policy_id}/versions", response_model=list[VersionRead])
async def list_versions(
    policy_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(PolicyVersion)
        .where(PolicyVersion.policy_id == policy_id)
        .options(
            selectinload(PolicyVersion.rules).selectinload(PolicyRule.subjects),
            selectinload(PolicyVersion.rules).selectinload(PolicyRule.resources),
            selectinload(PolicyVersion.rules).selectinload(PolicyRule.actions),
            selectinload(PolicyVersion.rules).selectinload(PolicyRule.conditions),
        )
        .order_by(PolicyVersion.version_number.desc())
    )
    versions = (await db.execute(stmt)).scalars().all()

    from sqlalchemy import text
    for v in versions:
        rows = (await db.execute(
            text("""
                SELECT pvt.platform_id, mp.platform_code, pvt.deployment_status, pvt.temporal_workflow_id, pvt.deployed_at
                FROM policy_version_targets pvt
                JOIN metadata_platforms mp ON mp.platform_id = pvt.platform_id
                WHERE pvt.version_id = :vid
            """),
            {"vid": v.version_id}
        )).mappings().all()
        v.targets = [dict(r) for r in rows]

    return versions


@router.get("/{policy_id}/versions/{version_id}", response_model=VersionRead)
async def get_version(
    policy_id: int,
    version_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = (
        select(PolicyVersion)
        .where(PolicyVersion.policy_id == policy_id, PolicyVersion.version_id == version_id)
        .options(
            selectinload(PolicyVersion.rules).selectinload(PolicyRule.subjects),
            selectinload(PolicyVersion.rules).selectinload(PolicyRule.resources),
            selectinload(PolicyVersion.rules).selectinload(PolicyRule.actions),
            selectinload(PolicyVersion.rules).selectinload(PolicyRule.conditions),
        )
    )
    version = (await db.execute(stmt)).scalar_one_or_none()
    if not version:
        raise HTTPException(status_code=404, detail="Version not found")

    from sqlalchemy import text
    rows = (await db.execute(
        text("""
            SELECT pvt.platform_id, mp.platform_code, pvt.deployment_status, pvt.temporal_workflow_id, pvt.deployed_at
            FROM policy_version_targets pvt
            JOIN metadata_platforms mp ON mp.platform_id = pvt.platform_id
            WHERE pvt.version_id = :vid
        """),
        {"vid": version_id}
    )).mappings().all()
    version.targets = [dict(r) for r in rows]

    return version
