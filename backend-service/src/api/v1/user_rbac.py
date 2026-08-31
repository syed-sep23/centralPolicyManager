"""User & RBAC Router."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from src.db.session import get_db
from src.core.auth import get_current_user, CurrentUser, require_roles

router = APIRouter()

class UserOut(BaseModel):
    user_id: int; username: str; email: str; display_name: Optional[str]
    department: Optional[str]; job_title: Optional[str]; is_active: bool

class RoleOut(BaseModel):
    role_id: int; role_name: str; role_code: str; description: Optional[str]
    parent_role_id: Optional[int]; is_active: bool

class UserRoleMappingCreate(BaseModel):
    user_id: int; role_id: int; expires_at: Optional[str] = None

class AttributeUpsert(BaseModel):
    attribute_key: str; attribute_value: str; attribute_source: str = "MANUAL"


@router.get("/users", response_model=list[UserOut])
async def list_users(
    page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * size
    rows = (await db.execute(
        text("SELECT user_id,username,email,display_name,department,job_title,is_active FROM users WHERE is_active=TRUE ORDER BY username LIMIT :l OFFSET :o"),
        {"l": size, "o": offset}
    )).mappings().all()
    return [dict(r) for r in rows]

@router.get("/users/{user_id}", response_model=UserOut)
async def get_user(
    user_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        text("SELECT user_id,username,email,display_name,department,job_title,is_active FROM users WHERE user_id=:u"),
        {"u": user_id}
    )).mappings().first()
    if not row: raise HTTPException(404, "User not found")
    return dict(row)

@router.get("/users/{user_id}/roles")
async def get_user_roles(
    user_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        text("""
            WITH RECURSIVE rh AS (
                SELECT r.role_id, r.role_code, r.role_name, r.parent_role_id, 0 AS depth
                FROM roles r JOIN user_role_mappings urm ON r.role_id = urm.role_id
                WHERE urm.user_id = :u AND urm.is_active = TRUE
                  AND (urm.expires_at IS NULL OR urm.expires_at > NOW())
                UNION ALL
                SELECT r.role_id, r.role_code, r.role_name, r.parent_role_id, rh.depth+1
                FROM roles r JOIN rh ON r.role_id = rh.parent_role_id
                WHERE rh.depth < 10
            )
            SELECT DISTINCT role_id, role_code, role_name FROM rh ORDER BY role_code
        """),
        {"u": user_id}
    )).mappings().all()
    return [dict(r) for r in rows]

@router.get("/users/{user_id}/attributes")
async def get_user_attributes(
    user_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        text("SELECT * FROM user_attributes WHERE user_id = :u ORDER BY attribute_key"),
        {"u": user_id}
    )).mappings().all()
    return [dict(r) for r in rows]

@router.put("/users/{user_id}/attributes")
async def upsert_user_attribute(
    user_id: int, body: AttributeUpsert,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN","SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("""
            INSERT INTO user_attributes (user_id, attribute_key, attribute_value, attribute_source)
            VALUES (:u, :k, :v, :s)
            ON CONFLICT (user_id, attribute_key)
            DO UPDATE SET attribute_value = EXCLUDED.attribute_value, attribute_source = EXCLUDED.attribute_source, updated_at = NOW()
        """),
        {"u": user_id, "k": body.attribute_key, "v": body.attribute_value, "s": body.attribute_source}
    )
    return {"status": "upserted"}

@router.get("/roles", response_model=list[RoleOut])
async def list_roles(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        text("SELECT role_id,role_name,role_code,description,parent_role_id,is_active FROM roles WHERE is_active=TRUE ORDER BY role_name")
    )).mappings().all()
    return [dict(r) for r in rows]

@router.post("/roles/assign", status_code=201)
async def assign_role(
    body: UserRoleMappingCreate,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN","SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("""
            INSERT INTO user_role_mappings (user_id, role_id, granted_by_user_id, expires_at)
            VALUES (:u, :r, :g, :e)
            ON CONFLICT (user_id, role_id) DO UPDATE SET is_active=TRUE, expires_at=EXCLUDED.expires_at
        """),
        {"u": body.user_id, "r": body.role_id, "g": current_user.user_id, "e": body.expires_at}
    )
    return {"status": "assigned"}

@router.delete("/roles/assign")
async def revoke_role(
    user_id: int, role_id: int,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN","SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("UPDATE user_role_mappings SET is_active=FALSE WHERE user_id=:u AND role_id=:r"),
        {"u": user_id, "r": role_id}
    )
    return {"status": "revoked"}
