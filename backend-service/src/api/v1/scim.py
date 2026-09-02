"""SCIM 2.0 Router — Okta / Azure AD Identity & Group Attribute Sync."""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from src.db.session import get_db

router = APIRouter()

class SCIMUserCreate(BaseModel):
    userName: str
    externalId: Optional[str] = None
    displayName: Optional[str] = None
    emails: Optional[list[dict]] = None
    active: bool = True
    department: Optional[str] = None
    title: Optional[str] = None

class SCIMGroupCreate(BaseModel):
    displayName: str
    externalId: Optional[str] = None
    members: Optional[list[dict]] = None

@router.get("/Users")
async def list_scim_users(db: AsyncSession = Depends(get_db)):
    """SCIM 2.0 List Users Endpoint."""
    rows = (await db.execute(text("SELECT user_id, username, email, display_name, department, job_title, is_active FROM users"))).mappings().all()
    resources = [
        {
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
            "id": str(r["user_id"]),
            "userName": r["username"],
            "displayName": r["display_name"] or r["username"],
            "emails": [{"value": r["email"], "primary": True}],
            "active": r["is_active"],
            "urn:ietf:params:scim:schemas:extension:enterprise:2.0:User": {
                "department": r["department"],
                "title": r["job_title"],
            }
        }
        for r in rows
    ]
    return {
        "schemas": ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        "totalResults": len(resources),
        "startIndex": 1,
        "itemsPerPage": len(resources),
        "Resources": resources,
    }

@router.post("/Users", status_code=201)
async def create_scim_user(body: SCIMUserCreate, db: AsyncSession = Depends(get_db)):
    """SCIM 2.0 Ingest User from Okta/Entra ID."""
    email = body.emails[0]["value"] if body.emails and len(body.emails) > 0 else f"{body.userName}@acme.com"
    try:
        res = await db.execute(
            text("""
                INSERT INTO users (organization_id, username, email, display_name, department, job_title, is_active)
                VALUES (1, :u, :e, :d, :dept, :t, :a)
                ON CONFLICT (organization_id, username) DO UPDATE SET email=EXCLUDED.email, display_name=EXCLUDED.display_name, updated_at=NOW()
                RETURNING user_id
            """),
            {"u": body.userName, "e": email, "d": body.displayName, "dept": body.department, "t": body.title, "a": body.active}
        )
        uid = res.scalar_one()
        await db.commit()
        return {
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
            "id": str(uid),
            "userName": body.userName,
            "displayName": body.displayName,
            "active": body.active,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"SCIM user ingestion error: {str(exc)}")

@router.get("/Groups")
async def list_scim_groups(db: AsyncSession = Depends(get_db)):
    """SCIM 2.0 List Groups Endpoint."""
    rows = (await db.execute(text("SELECT role_id, role_name, role_code FROM roles"))).mappings().all()
    resources = [
        {
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:Group"],
            "id": str(r["role_id"]),
            "displayName": r["role_name"],
            "externalId": r["role_code"],
        }
        for r in rows
    ]
    return {
        "schemas": ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        "totalResults": len(resources),
        "startIndex": 1,
        "itemsPerPage": len(resources),
        "Resources": resources,
    }

@router.post("/Groups", status_code=201)
async def create_scim_group(body: SCIMGroupCreate, db: AsyncSession = Depends(get_db)):
    """SCIM 2.0 Ingest Group from Okta/Entra ID."""
    code = body.externalId or body.displayName.upper().replace(" ", "_")
    try:
        res = await db.execute(
            text("""
                INSERT INTO roles (organization_id, role_name, role_code, description)
                VALUES (1, :n, :c, 'SCIM Synced IdP Group')
                ON CONFLICT (organization_id, role_code) DO UPDATE SET role_name=EXCLUDED.role_name, updated_at=NOW()
                RETURNING role_id
            """),
            {"n": body.displayName, "c": code}
        )
        gid = res.scalar_one()
        await db.commit()
        return {
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:Group"],
            "id": str(gid),
            "displayName": body.displayName,
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"SCIM group ingestion error: {str(exc)}")
