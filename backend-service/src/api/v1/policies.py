"""Policies CRUD router."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.db.session import get_db
from src.schemas.schemas import PolicyCreate, PolicyRead, PolicyUpdate, PolicyDetail, PaginatedPolicies
from src.services.policy_service import PolicyService
from src.core.auth import get_current_user, CurrentUser, require_roles

router = APIRouter()


@router.get("", response_model=PaginatedPolicies)
async def list_policies(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    status: Optional[str] = Query(None),
    domain_id: Optional[int] = Query(None),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = PolicyService(db)
    total, items = await svc.list_policies(org_id=1, page=page, size=size, status_filter=status, domain_id=domain_id)
    return PaginatedPolicies(total=total, page=page, size=size, items=items)


@router.post("", response_model=PolicyRead, status_code=status.HTTP_201_CREATED)
async def create_policy(
    body: PolicyCreate,
    current_user: CurrentUser = Depends(require_roles("POLICY_AUTHOR", "POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    svc = PolicyService(db)
    return await svc.create_policy(body, owner_user_id=current_user.user_id, org_id=1)


@router.get("/{policy_id}", response_model=PolicyDetail)
async def get_policy(
    policy_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    svc = PolicyService(db)
    policy = await svc.get_policy_detail(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy


@router.put("/{policy_id}", response_model=PolicyRead)
async def update_policy(
    policy_id: int,
    body: PolicyUpdate,
    current_user: CurrentUser = Depends(require_roles("POLICY_AUTHOR", "POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    svc = PolicyService(db)
    policy = await svc.update_policy(policy_id, body)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy


@router.post("/{policy_id}/submit", response_model=PolicyRead)
async def submit_policy(
    policy_id: int,
    current_user: CurrentUser = Depends(require_roles("POLICY_AUTHOR", "POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    svc = PolicyService(db)
    policy = await svc.get_policy_detail(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    version_id = policy.current_version_id
    if not version_id and policy.versions:
        version_id = policy.versions[0].version_id

    if version_id:
        from src.api.v1.deployments import execute_policy_deployment
        await execute_policy_deployment(policy_id, version_id, None, db)

    policy = await svc.get_policy_detail(policy_id)
    return policy


@router.delete("/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_policy(
    policy_id: int,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    svc = PolicyService(db)
    await svc.deprecate_policy(policy_id)


from src.services.policy_compiler import compile_policy_preview

@router.post("/preview-compile")
async def preview_compile_policy(body: dict):
    """
    Compile a draft Immuta Global Policy into live Snowflake DDL, Redshift DDL,
    OPA Rego code, and plain English natural language summary without saving to DB.
    """
    return compile_policy_preview(body)
