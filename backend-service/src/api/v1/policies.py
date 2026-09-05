"""Policies CRUD router."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from api.v1.deployments import DeployRequest, trigger_policy_deployment
from core.auth import CurrentUser, get_current_user, require_roles
from db.session import get_db
from schemas.schemas import (
    PaginatedPolicies,
    PolicyCreate,
    PolicyDetail,
    PolicyRead,
    PolicyUpdate,
)
from services.policy_compiler import (
    compile_opa_rego,
    generate_natural_language_summary,
)
from services.policy_service import PolicyService

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
    total, items = await svc.list_policies(
        org_id=1, page=page, size=size, status_filter=status, domain_id=domain_id
    )
    return PaginatedPolicies(total=total, page=page, size=size, items=items)


@router.post("", response_model=PolicyRead, status_code=status.HTTP_201_CREATED)
async def create_policy(
    body: PolicyCreate,
    current_user: CurrentUser = Depends(
        require_roles("POLICY_AUTHOR", "POLICY_ADMIN", "SUPER_ADMIN")
    ),
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
    current_user: CurrentUser = Depends(
        require_roles("POLICY_AUTHOR", "POLICY_ADMIN", "SUPER_ADMIN")
    ),
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
    current_user: CurrentUser = Depends(
        require_roles("POLICY_AUTHOR", "POLICY_ADMIN", "SUPER_ADMIN")
    ),
    db: AsyncSession = Depends(get_db),
):
    svc = PolicyService(db)
    policy = await svc.get_policy_detail(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")

    version_id = policy.current_version_id
    if not version_id and policy.versions:
        version_id = policy.versions[0].version_id

    event_id = None
    stream_url = None
    celery_task_id = None
    if version_id:
        deploy_res = await trigger_policy_deployment(
            DeployRequest(policy_id=policy_id, version_id=version_id), db
        )
        event_id = deploy_res.event_id
        stream_url = deploy_res.stream_url
        celery_task_id = deploy_res.celery_task_id

    policy = await svc.get_policy_detail(policy_id)
    policy_dict = PolicyRead.model_validate(policy).model_dump()
    policy_dict["event_id"] = event_id
    policy_dict["stream_url"] = stream_url
    policy_dict["celery_task_id"] = celery_task_id
    return PolicyRead(**policy_dict)


@router.delete("/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_policy(
    policy_id: int,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    svc = PolicyService(db)
    await svc.deprecate_policy(policy_id)


@router.post("/preview-compile")
async def preview_compile_policy(body: dict):
    """
    Compile a draft CES Global Policy into OPA Rego code and natural language summary.
    """
    opa_rego = compile_opa_rego(body)
    natural_language = generate_natural_language_summary(body)
    return {
        "opa_rego": opa_rego,
        "natural_language": natural_language,
        "snowflake_sql": "",
        "redshift_sql": "",
    }
