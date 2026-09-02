"""
Purpose-Based Access Control (PBAC) Router.
Implements Context Over Identity, Purpose Limitation (GDPR/HIPAA),
and Authorized User-to-Purpose bindings.
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from src.db.session import get_db
from src.core.auth import get_current_user, CurrentUser, require_roles

router = APIRouter()


class PurposeOut(BaseModel):
    purpose_id: int
    purpose_code: str
    purpose_name: str
    description: Optional[str] = None
    regulatory_mandate: Optional[str] = "GDPR_ARTICLE_5"
    max_sensitivity: Optional[str] = "RESTRICTED"
    retention_days: Optional[int] = 365
    authorized_users_count: int = 0
    is_active: bool = True

class PurposeCreate(BaseModel):
    purpose_code: str
    purpose_name: str
    description: Optional[str] = None
    regulatory_mandate: Optional[str] = "GDPR_ARTICLE_5"
    max_sensitivity: Optional[str] = "RESTRICTED"
    retention_days: Optional[int] = 365

class AuthorizeUserRequest(BaseModel):
    user_id: int


@router.get("", response_model=list[PurposeOut])
async def list_purposes(db: AsyncSession = Depends(get_db)):
    """List all registered business purposes along with authorized user counts."""
    rows = (await db.execute(
        text("""
            SELECT 
                p.purpose_id, 
                p.purpose_code, 
                p.purpose_name, 
                p.description,
                p.regulatory_mandate,
                p.max_sensitivity,
                p.retention_days,
                p.is_active,
                (SELECT COUNT(*) FROM user_purposes up WHERE up.purpose_id = p.purpose_id AND up.is_active = TRUE) AS authorized_users_count
            FROM purposes p 
            WHERE p.is_active = TRUE 
            ORDER BY p.purpose_name
        """)
    )).mappings().all()
    return [dict(r) for r in rows]


@router.post("", response_model=PurposeOut, status_code=status.HTTP_201_CREATED)
async def create_purpose(
    body: PurposeCreate,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """Register a new approved Business Purpose for PBAC enforcement."""
    org_row = (await db.execute(text("SELECT organization_id FROM organizations LIMIT 1"))).first()
    org_id = org_row.organization_id if org_row else 1

    res = await db.execute(
        text("""
            INSERT INTO purposes (organization_id, purpose_code, purpose_name, description, regulatory_mandate, max_sensitivity, retention_days)
            VALUES (:org, :c, :n, :d, :m, :s, :r)
            RETURNING purpose_id, purpose_code, purpose_name, description, regulatory_mandate, max_sensitivity, retention_days, is_active
        """),
        {
            "org": org_id,
            "c": body.purpose_code.upper().replace(" ", "_"),
            "n": body.purpose_name,
            "d": body.description,
            "m": body.regulatory_mandate or "GDPR_ARTICLE_5",
            "s": body.max_sensitivity or "RESTRICTED",
            "r": body.retention_days or 365,
        }
    )
    row = res.mappings().first()
    await db.commit()
    result = dict(row)
    result["authorized_users_count"] = 0
    return result


@router.get("/{purpose_id}/users")
async def list_purpose_authorized_users(purpose_id: int, db: AsyncSession = Depends(get_db)):
    """List users authorized to execute queries under this specific purpose."""
    rows = (await db.execute(
        text("""
            SELECT u.user_id, u.username, u.email, u.display_name, u.department, up.granted_at
            FROM users u
            JOIN user_purposes up ON up.user_id = u.user_id
            WHERE up.purpose_id = :p AND up.is_active = TRUE
            ORDER BY u.username
        """),
        {"p": purpose_id}
    )).mappings().all()
    return [dict(r) for r in rows]


@router.post("/{purpose_id}/users", status_code=status.HTTP_201_CREATED)
async def authorize_user_for_purpose(
    purpose_id: int,
    body: AuthorizeUserRequest,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """Authorize a user account to query data under this specific purpose."""
    await db.execute(
        text("""
            INSERT INTO user_purposes (user_id, purpose_id, is_active)
            VALUES (:u, :p, TRUE)
            ON CONFLICT (user_id, purpose_id) DO UPDATE SET is_active = TRUE
        """),
        {"u": body.user_id, "p": purpose_id}
    )
    await db.commit()
    return {"status": "authorized"}


@router.delete("/{purpose_id}/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_user_purpose_authorization(
    purpose_id: int,
    user_id: int,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """Revoke user authorization for this purpose."""
    await db.execute(
        text("UPDATE user_purposes SET is_active = FALSE WHERE user_id = :u AND purpose_id = :p"),
        {"u": user_id, "p": purpose_id}
    )
    await db.commit()
