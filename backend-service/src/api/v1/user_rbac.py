"""
User, Group & Identity Architecture Router (CES ABAC Model).
Implements Identity Directory, Multi-Group Membership (0..N), Group Attributes,
and Dynamic Effective Attribute Inheritance.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import CurrentUser, get_current_user, require_roles
from db.session import get_db

router = APIRouter()


# ─── Pydantic Schemas ─────────────────────────────────────────────────────────


class GroupBrief(BaseModel):
    role_id: int
    role_name: str
    role_code: str


class ExternalMappingItem(BaseModel):
    platform_code: str
    external_user_id: str
    platform_id: Optional[int] = None


class UserCreate(BaseModel):
    username: str
    email: str
    display_name: Optional[str] = None
    department: Optional[str] = "Engineering"
    job_title: Optional[str] = "Data Practitioner"
    country: Optional[str] = None
    group_ids: Optional[list[int]] = []
    attributes: Optional[dict[str, str]] = {}
    external_mappings: Optional[list[ExternalMappingItem]] = []


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    email: Optional[str] = None
    department: Optional[str] = None
    job_title: Optional[str] = None
    country: Optional[str] = None
    is_active: Optional[bool] = None
    group_ids: Optional[list[int]] = None
    external_mappings: Optional[list[ExternalMappingItem]] = None


class UserRoleMappingCreate(BaseModel):
    user_id: int
    role_id: int
    expires_at: Optional[str] = None


class RoleCreate(BaseModel):
    role_name: str
    role_code: str
    description: Optional[str] = None
    parent_role_id: Optional[int] = None


class AttributeUpsert(BaseModel):
    attribute_key: str
    attribute_value: str
    attribute_source: str = "MANUAL"


# ─── Users & Effective Attributes ─────────────────────────────────────────────


@router.get("/users/supported-platforms")
async def get_supported_platforms(
    db: AsyncSession = Depends(get_db),
):
    """Return all supported cloud data platforms and registered drivers for external user mapping."""
    drivers_rows = (
        (
            await db.execute(
                text("""
                SELECT driver_code, driver_name, description
                FROM metadata_platform_drivers
                WHERE is_active = TRUE
                ORDER BY driver_name
            """)
            )
        )
        .mappings()
        .all()
    )

    platforms_rows = (
        (
            await db.execute(
                text("""
                SELECT platform_id, platform_code, platform_name, driver_code, connection_alias
                FROM metadata_platforms
                WHERE is_active = TRUE
                ORDER BY platform_name
            """)
            )
        )
        .mappings()
        .all()
    )

    return {
        "drivers": [dict(r) for r in drivers_rows],
        "platforms": [dict(r) for r in platforms_rows],
    }


@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    size: int = Query(50, ge=1, le=100),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List users along with group memberships, attributes, and external platform user mappings."""
    offset = (page - 1) * size
    user_rows = (
        (
            await db.execute(
                text("""
            SELECT user_id, username, email, display_name, department, job_title,
                   country, ldap_dn, cost_center, office_location, is_active,
                   last_synced_at, created_at, updated_at
            FROM users
            ORDER BY user_id
            LIMIT :l OFFSET :o
        """),
                {"l": size, "o": offset},
            )
        )
        .mappings()
        .all()
    )

    users = [dict(u) for u in user_rows]
    if not users:
        return []

    u_ids = [u["user_id"] for u in users]

    # Fetch groups for these users
    mapping_rows = (
        (
            await db.execute(
                text("""
            SELECT urm.user_id, r.role_id, r.role_name, r.role_code
            FROM user_role_mappings urm
            JOIN roles r ON r.role_id = urm.role_id
            WHERE urm.user_id = ANY(:ids) AND urm.is_active = TRUE
        """),
                {"ids": u_ids},
            )
        )
        .mappings()
        .all()
    )

    user_groups: dict[int, list[dict]] = {uid: [] for uid in u_ids}
    for m in mapping_rows:
        user_groups[m["user_id"]].append(
            {
                "role_id": m["role_id"],
                "role_name": m["role_name"],
                "role_code": m["role_code"],
            }
        )

    # Fetch direct attributes
    attr_rows = (
        (
            await db.execute(
                text("""
            SELECT user_id, attribute_key, attribute_value, attribute_source
            FROM user_attributes
            WHERE user_id = ANY(:ids)
        """),
                {"ids": u_ids},
            )
        )
        .mappings()
        .all()
    )

    user_attrs: dict[int, list[dict]] = {uid: [] for uid in u_ids}
    for a in attr_rows:
        user_attrs[a["user_id"]].append(
            {
                "key": a["attribute_key"],
                "value": a["attribute_value"],
                "source": a["attribute_source"],
            }
        )

    # Fetch external platform mappings for these users
    ext_rows = (
        (
            await db.execute(
                text("""
            SELECT pum.user_id, pum.platform_code, pum.external_user_id, pum.platform_id,
                   COALESCE(mp.platform_name, pum.platform_code) AS platform_name
            FROM platform_user_mappings pum
            LEFT JOIN metadata_platforms mp ON mp.platform_id = pum.platform_id
            WHERE pum.user_id = ANY(:ids)
            ORDER BY pum.platform_code
        """),
                {"ids": u_ids},
            )
        )
        .mappings()
        .all()
    )

    user_ext_maps: dict[int, list[dict]] = {uid: [] for uid in u_ids}
    for em in ext_rows:
        user_ext_maps[em["user_id"]].append(
            {
                "platform_code": em["platform_code"],
                "external_user_id": em["external_user_id"],
                "platform_id": em["platform_id"],
                "platform_name": em["platform_name"],
            }
        )

    # Attach to user dict
    for u in users:
        u["groups"] = user_groups.get(u["user_id"], [])
        u["direct_attributes"] = user_attrs.get(u["user_id"], [])
        u["external_mappings"] = user_ext_maps.get(u["user_id"], [])

    return users


@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    row = (
        (
            await db.execute(
                text("""
                SELECT user_id, username, email, display_name, department, job_title,
                       country, ldap_dn, cost_center, office_location, is_active,
                       last_synced_at, created_at, updated_at
                FROM users
                WHERE user_id = :u
            """),
                {"u": user_id},
            )
        )
        .mappings()
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    user_dict = dict(row)

    # Groups
    mapping_rows = (
        (
            await db.execute(
                text("""
            SELECT r.role_id, r.role_name, r.role_code
            FROM user_role_mappings urm
            JOIN roles r ON r.role_id = urm.role_id
            WHERE urm.user_id = :u AND urm.is_active = TRUE
        """),
                {"u": user_id},
            )
        )
        .mappings()
        .all()
    )
    user_dict["groups"] = [dict(m) for m in mapping_rows]

    # External mappings
    ext_rows = (
        (
            await db.execute(
                text("""
            SELECT pum.platform_code, pum.external_user_id, pum.platform_id,
                   COALESCE(mp.platform_name, pum.platform_code) AS platform_name
            FROM platform_user_mappings pum
            LEFT JOIN metadata_platforms mp ON mp.platform_id = pum.platform_id
            WHERE pum.user_id = :u
            ORDER BY pum.platform_code
        """),
                {"u": user_id},
            )
        )
        .mappings()
        .all()
    )
    user_dict["external_mappings"] = [dict(e) for e in ext_rows]

    return user_dict


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    body: UserUpdate,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """
    Update user identity attributes (name, email, country, position, is_active),
    group memberships, and External User Mappings for supported data platforms.
    """
    existing = (
        await db.execute(text("SELECT user_id FROM users WHERE user_id = :u"), {"u": user_id})
    ).first()
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")

    # 1. Update basic profile fields
    await db.execute(
        text("""
            UPDATE users
            SET display_name = COALESCE(:display_name, display_name),
                email        = COALESCE(:email, email),
                department   = COALESCE(:department, department),
                job_title    = COALESCE(:job_title, job_title),
                country      = COALESCE(:country, country),
                is_active    = COALESCE(:is_active, is_active),
                updated_at   = NOW()
            WHERE user_id = :u
        """),
        {
            "u": user_id,
            "display_name": body.display_name,
            "email": body.email.strip().lower() if body.email else None,
            "department": body.department,
            "job_title": body.job_title,
            "country": body.country,
            "is_active": body.is_active,
        },
    )

    # 2. Also keep country synced in user_attributes if provided
    if body.country:
        await db.execute(
            text("""
                INSERT INTO user_attributes (user_id, attribute_key, attribute_value, attribute_source)
                VALUES (:u, 'country', :c, 'MANUAL')
                ON CONFLICT (user_id, attribute_key) DO UPDATE SET attribute_value = EXCLUDED.attribute_value, updated_at = NOW()
            """),
            {"u": user_id, "c": body.country},
        )

    # 3. Synchronize group memberships if provided
    if body.group_ids is not None:
        # Deactivate groups not in list
        await db.execute(
            text("""
                UPDATE user_role_mappings
                SET is_active = FALSE
                WHERE user_id = :u AND NOT (role_id = ANY(:gids))
            """),
            {"u": user_id, "gids": body.group_ids},
        )
        # Activate / insert groups in list
        for gid in body.group_ids:
            await db.execute(
                text("""
                    INSERT INTO user_role_mappings (user_id, role_id, is_active)
                    VALUES (:u, :r, TRUE)
                    ON CONFLICT (user_id, role_id) DO UPDATE SET is_active = TRUE
                """),
                {"u": user_id, "r": gid},
            )

    # 4. Synchronize External User Mappings across supported platforms
    if body.external_mappings is not None:
        for em in body.external_mappings:
            pcode = em.platform_code.strip().upper()
            ext_uid = em.external_user_id.strip()

            if ext_uid:
                # Find platform_id if available
                pid = em.platform_id
                if not pid:
                    pid_row = (
                        await db.execute(
                            text("SELECT platform_id FROM metadata_platforms WHERE UPPER(platform_code) = :c LIMIT 1"),
                            {"c": pcode},
                        )
                    ).first()
                    pid = pid_row[0] if pid_row else None

                await db.execute(
                    text("""
                        INSERT INTO platform_user_mappings (user_id, platform_id, platform_code, external_user_id, updated_at)
                        VALUES (:u, :pid, :pcode, :ext_uid, NOW())
                        ON CONFLICT (user_id, platform_code) DO UPDATE
                        SET external_user_id = EXCLUDED.external_user_id,
                            platform_id = COALESCE(EXCLUDED.platform_id, platform_user_mappings.platform_id),
                            updated_at = NOW()
                    """),
                    {"u": user_id, "pid": pid, "pcode": pcode, "ext_uid": ext_uid},
                )
            else:
                # If external_user_id is blank, delete mapping
                await db.execute(
                    text("DELETE FROM platform_user_mappings WHERE user_id = :u AND platform_code = :pcode"),
                    {"u": user_id, "pcode": pcode},
                )

    await db.commit()

    # Return updated user object
    return await get_user(user_id=user_id, current_user=current_user, db=db)


@router.get("/users/{user_id}/external-mappings")
async def get_user_external_mappings(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Retrieve all external platform user mappings for a given user."""
    rows = (
        (
            await db.execute(
                text("""
            SELECT pum.platform_code, pum.external_user_id, pum.platform_id,
                   COALESCE(mp.platform_name, pum.platform_code) AS platform_name
            FROM platform_user_mappings pum
            LEFT JOIN metadata_platforms mp ON mp.platform_id = pum.platform_id
            WHERE pum.user_id = :u
            ORDER BY pum.platform_code
        """),
                {"u": user_id},
            )
        )
        .mappings()
        .all()
    )
    return [dict(r) for r in rows]


@router.put("/users/{user_id}/external-mappings")
async def update_user_external_mappings(
    user_id: int,
    mappings: list[ExternalMappingItem],
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """Upsert or update external user mappings for a given user."""
    for em in mappings:
        pcode = em.platform_code.strip().upper()
        ext_uid = em.external_user_id.strip()
        if ext_uid:
            pid = em.platform_id
            if not pid:
                pid_row = (
                    await db.execute(
                        text("SELECT platform_id FROM metadata_platforms WHERE UPPER(platform_code) = :c LIMIT 1"),
                        {"c": pcode},
                    )
                ).first()
                pid = pid_row[0] if pid_row else None

            await db.execute(
                text("""
                    INSERT INTO platform_user_mappings (user_id, platform_id, platform_code, external_user_id, updated_at)
                    VALUES (:u, :pid, :pcode, :ext_uid, NOW())
                    ON CONFLICT (user_id, platform_code) DO UPDATE
                    SET external_user_id = EXCLUDED.external_user_id,
                        platform_id = COALESCE(EXCLUDED.platform_id, platform_user_mappings.platform_id),
                        updated_at = NOW()
                """),
                {"u": user_id, "pid": pid, "pcode": pcode, "ext_uid": ext_uid},
            )
        else:
            await db.execute(
                text("DELETE FROM platform_user_mappings WHERE user_id = :u AND platform_code = :pcode"),
                {"u": user_id, "pcode": pcode},
            )
    await db.commit()
    return {"status": "saved"}


@router.post("/users", status_code=status.HTTP_201_CREATED)
async def create_user(
    body: UserCreate,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new user account with initial group memberships and attributes."""
    org_row = (await db.execute(text("SELECT organization_id FROM organizations LIMIT 1"))).first()
    org_id = org_row.organization_id if org_row else 1

    ins_res = (
        (
            await db.execute(
                text("""
            INSERT INTO users (organization_id, username, email, display_name, department, job_title, is_active)
            VALUES (:org_id, :username, :email, :display_name, :department, :job_title, TRUE)
            RETURNING user_id, username, email, display_name, department, job_title, is_active
        """),
                {
                    "org_id": org_id,
                    "username": body.username.strip().lower(),
                    "email": body.email.strip().lower(),
                    "display_name": body.display_name or body.username,
                    "department": body.department,
                    "job_title": body.job_title,
                },
            )
        )
        .mappings()
        .first()
    )
    new_uid = ins_res["user_id"]

    # Assign initial groups
    for gid in body.group_ids or []:
        await db.execute(
            text("""
                INSERT INTO user_role_mappings (user_id, role_id, is_active)
                VALUES (:u, :r, TRUE)
                ON CONFLICT DO NOTHING
            """),
            {"u": new_uid, "r": gid},
        )

    # Assign initial attributes
    for k, v in (body.attributes or {}).items():
        await db.execute(
            text("""
                INSERT INTO user_attributes (user_id, attribute_key, attribute_value, attribute_source)
                VALUES (:u, :k, :v, 'MANUAL')
                ON CONFLICT (user_id, attribute_key) DO UPDATE SET attribute_value = EXCLUDED.attribute_value
            """),
            {"u": new_uid, "k": k, "v": v},
        )

    await db.commit()
    return dict(ins_res)


@router.get("/users/{user_id}/effective-attributes")
async def get_effective_user_attributes(
    user_id: int,
    db: AsyncSession = Depends(get_db),
):
    """
    CES Core Identity Concept:
    Resolves effective user ABAC attributes by merging Direct User Attributes
    with Inherited Group Attributes from all active groups the user belongs to.
    """
    # 1. Fetch user direct attributes
    direct_rows = (
        (
            await db.execute(
                text(
                    "SELECT attribute_key, attribute_value, attribute_source FROM user_attributes WHERE user_id = :u"
                ),
                {"u": user_id},
            )
        )
        .mappings()
        .all()
    )
    direct_attrs = [dict(r) for r in direct_rows]

    # 2. Fetch user's active groups
    group_rows = (
        (
            await db.execute(
                text("""
            SELECT r.role_id, r.role_name, r.role_code
            FROM roles r
            JOIN user_role_mappings urm ON urm.role_id = r.role_id
            WHERE urm.user_id = :u AND urm.is_active = TRUE
        """),
                {"u": user_id},
            )
        )
        .mappings()
        .all()
    )
    user_groups = [dict(g) for g in group_rows]
    group_ids = [g["role_id"] for g in user_groups]

    inherited_attrs = []
    if group_ids:
        # 3. Fetch attributes on those groups
        g_attr_rows = (
            (
                await db.execute(
                    text("""
                SELECT ga.role_id, ga.attribute_key, ga.attribute_value, r.role_name, r.role_code
                FROM group_attributes ga
                JOIN roles r ON r.role_id = ga.role_id
                WHERE ga.role_id = ANY(:gids)
                ORDER BY r.role_name, ga.attribute_key
            """),
                    {"gids": group_ids},
                )
            )
            .mappings()
            .all()
        )

        for ga in g_attr_rows:
            inherited_attrs.append(
                {
                    "key": ga["attribute_key"],
                    "value": ga["attribute_value"],
                    "source_group": ga["role_name"],
                    "group_code": ga["role_code"],
                    "group_id": ga["role_id"],
                }
            )

    # 4. Compute effective attribute map (Direct overrides inherited)
    effective_map = {}
    for ia in inherited_attrs:
        effective_map[ia["key"]] = ia["value"]
    for da in direct_attrs:
        effective_map[da["attribute_key"]] = da["attribute_value"]

    return {
        "user_id": user_id,
        "direct_attributes": direct_attrs,
        "inherited_attributes": inherited_attrs,
        "effective_attribute_map": effective_map,
        "groups": user_groups,
    }


@router.put("/users/{user_id}/attributes")
async def upsert_user_attribute(
    user_id: int,
    body: AttributeUpsert,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("""
            INSERT INTO user_attributes (user_id, attribute_key, attribute_value, attribute_source)
            VALUES (:u, :k, :v, :s)
            ON CONFLICT (user_id, attribute_key)
            DO UPDATE SET attribute_value = EXCLUDED.attribute_value, attribute_source = EXCLUDED.attribute_source, updated_at = NOW()
        """),
        {
            "u": user_id,
            "k": body.attribute_key,
            "v": body.attribute_value,
            "s": body.attribute_source,
        },
    )
    await db.commit()
    return {"status": "upserted"}


@router.delete(
    "/users/{user_id}/attributes/{attribute_key}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_user_attribute(
    user_id: int,
    attribute_key: str,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("DELETE FROM user_attributes WHERE user_id = :u AND attribute_key = :k"),
        {"u": user_id, "k": attribute_key},
    )
    await db.commit()


# ─── Identity Groups & Group Attributes ───────────────────────────────────────


@router.get("/roles")
async def list_roles(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List all identity groups along with active member counts and assigned group attributes."""
    rows = (await db.execute(text("""
            SELECT
                r.role_id,
                r.role_name,
                r.role_code,
                r.description,
                r.parent_role_id,
                r.is_active,
                (SELECT COUNT(*) FROM user_role_mappings urm WHERE urm.role_id = r.role_id AND urm.is_active = TRUE) AS member_count
            FROM roles r
            WHERE r.is_active = TRUE
            ORDER BY r.role_name
        """))).mappings().all()
    roles = [dict(r) for r in rows]

    # Fetch group attributes
    ga_rows = (
        (
            await db.execute(
                text(
                    "SELECT role_id, attribute_key, attribute_value FROM group_attributes ORDER BY attribute_key"
                )
            )
        )
        .mappings()
        .all()
    )

    ga_map: dict[int, list[dict]] = {r["role_id"]: [] for r in roles}
    for ga in ga_rows:
        if ga["role_id"] in ga_map:
            ga_map[ga["role_id"]].append(
                {
                    "key": ga["attribute_key"],
                    "value": ga["attribute_value"],
                }
            )

    for r in roles:
        r["attributes"] = ga_map.get(r["role_id"], [])

    return roles


@router.post("/roles", status_code=status.HTTP_201_CREATED)
async def create_role(
    body: RoleCreate,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new Identity Group."""
    org_row = (await db.execute(text("SELECT organization_id FROM organizations LIMIT 1"))).first()
    org_id = org_row.organization_id if org_row else 1

    ins_res = (
        (
            await db.execute(
                text("""
            INSERT INTO roles (organization_id, role_name, role_code, description, parent_role_id, is_active)
            VALUES (:org_id, :name, :code, :desc, :parent_id, TRUE)
            RETURNING role_id, role_name, role_code, description, parent_role_id, is_active
        """),
                {
                    "org_id": org_id,
                    "name": body.role_name,
                    "code": body.role_code.upper().replace(" ", "_"),
                    "desc": body.description,
                    "parent_id": body.parent_role_id,
                },
            )
        )
        .mappings()
        .first()
    )
    await db.commit()
    return dict(ins_res)


@router.get("/roles/{role_id}/attributes")
async def get_role_attributes(role_id: int, db: AsyncSession = Depends(get_db)):
    rows = (
        (
            await db.execute(
                text(
                    "SELECT attribute_id, attribute_key, attribute_value, created_at FROM group_attributes WHERE role_id = :r ORDER BY attribute_key"
                ),
                {"r": role_id},
            )
        )
        .mappings()
        .all()
    )
    return [dict(r) for r in rows]


@router.put("/roles/{role_id}/attributes")
async def upsert_role_attribute(
    role_id: int,
    body: AttributeUpsert,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("""
            INSERT INTO group_attributes (role_id, attribute_key, attribute_value)
            VALUES (:r, :k, :v)
            ON CONFLICT (role_id, attribute_key)
            DO UPDATE SET attribute_value = EXCLUDED.attribute_value;
        """),
        {"r": role_id, "k": body.attribute_key, "v": body.attribute_value},
    )
    await db.commit()
    return {"status": "upserted"}


@router.delete(
    "/roles/{role_id}/attributes/{attribute_key}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_role_attribute(
    role_id: int,
    attribute_key: str,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("DELETE FROM group_attributes WHERE role_id = :r AND attribute_key = :k"),
        {"r": role_id, "k": attribute_key},
    )
    await db.commit()


@router.get("/roles/{role_id}/members")
async def get_role_members(role_id: int, db: AsyncSession = Depends(get_db)):
    rows = (
        (
            await db.execute(
                text("""
            SELECT u.user_id, u.username, u.email, u.display_name, u.department, u.is_active
            FROM users u
            JOIN user_role_mappings urm ON urm.user_id = u.user_id
            WHERE urm.role_id = :r AND urm.is_active = TRUE
            ORDER BY u.username
        """),
                {"r": role_id},
            )
        )
        .mappings()
        .all()
    )
    return [dict(r) for r in rows]


@router.post("/roles/assign", status_code=status.HTTP_201_CREATED)
async def assign_role(
    body: UserRoleMappingCreate,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("""
            INSERT INTO user_role_mappings (user_id, role_id, granted_by_user_id, expires_at, is_active)
            VALUES (:u, :r, :g, :e, TRUE)
            ON CONFLICT (user_id, role_id) DO UPDATE SET is_active=TRUE, expires_at=EXCLUDED.expires_at
        """),
        {"u": body.user_id, "r": body.role_id, "g": current_user.user_id, "e": body.expires_at},
    )
    await db.commit()
    return {"status": "assigned"}


@router.delete("/roles/assign")
async def revoke_role(
    user_id: int,
    role_id: int,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    await db.execute(
        text("UPDATE user_role_mappings SET is_active=FALSE WHERE user_id=:u AND role_id=:r"),
        {"u": user_id, "r": role_id},
    )
    await db.commit()
    return {"status": "revoked"}


@router.post("/users/sync-idp")
async def sync_from_idp(db: AsyncSession = Depends(get_db)):
    """
    Simulate Enterprise IdP (Okta / Azure AD SCIM) synchronization.
    Reconciles identity groups and user memberships.
    """
    # Verify/create default enterprise groups
    org_row = (await db.execute(text("SELECT organization_id FROM organizations LIMIT 1"))).first()
    org_id = org_row.organization_id if org_row else 1

    idp_groups = [
        ("Data Engineering", "ROLE_DATA_ENGINEER", "Data pipelines and platform infrastructure"),
        ("Fraud Investigation", "ROLE_SECURITY", "Financial crimes and security compliance"),
        ("Marketing Analytics", "ROLE_MARKETING", "Customer growth and marketing analytics"),
        ("Compliance & Audit", "ROLE_COMPLIANCE", "Regulatory compliance and internal audit"),
    ]

    for name, code, desc in idp_groups:
        await db.execute(
            text("""
                INSERT INTO roles (organization_id, role_name, role_code, description, is_active)
                VALUES (:org, :name, :code, :desc, TRUE)
                ON CONFLICT (organization_id, role_code) DO NOTHING
            """),
            {"org": org_id, "name": name, "code": code, "desc": desc},
        )

    await db.commit()
    return {
        "status": "SUCCESS",
        "message": "Synchronized 4 enterprise groups and active memberships from IdP",
    }
