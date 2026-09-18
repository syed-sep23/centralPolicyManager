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
    persona_ids: Optional[list[int]] = []
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
    persona_ids: Optional[list[int]] = None
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


class PersonaCreate(BaseModel):
    persona_name: str
    persona_code: str
    description: Optional[str] = None
    group_ids: Optional[list[int]] = []
    user_ids: Optional[list[int]] = []
    attributes: Optional[dict[str, str]] = {}


class PersonaUpdate(BaseModel):
    persona_name: Optional[str] = None
    persona_code: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    group_ids: Optional[list[int]] = None
    user_ids: Optional[list[int]] = None


class PersonaGroupAssign(BaseModel):
    role_ids: list[int]


class PersonaUserAssign(BaseModel):
    user_ids: list[int]


class AttributeUpsert(BaseModel):
    attribute_key: str
    attribute_value: str
    attribute_source: str = "MANUAL"


async def _ensure_persona_tables(db: AsyncSession):
    """Ensure persona tables and sample seed records exist idempotently."""
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS personas (
            persona_id SERIAL PRIMARY KEY,
            organization_id INTEGER NOT NULL REFERENCES organizations(organization_id) ON DELETE CASCADE,
            persona_name VARCHAR(255) NOT NULL,
            persona_code VARCHAR(100) NOT NULL,
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT TRUE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(organization_id, persona_code)
        )
    """))
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS persona_user_mappings (
            mapping_id SERIAL PRIMARY KEY,
            persona_id INTEGER NOT NULL REFERENCES personas(persona_id) ON DELETE CASCADE,
            user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(persona_id, user_id)
        )
    """))
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS persona_group_mappings (
            mapping_id SERIAL PRIMARY KEY,
            persona_id INTEGER NOT NULL REFERENCES personas(persona_id) ON DELETE CASCADE,
            role_id INTEGER NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(persona_id, role_id)
        )
    """))
    await db.execute(text("""
        CREATE TABLE IF NOT EXISTS persona_attributes (
            attribute_id SERIAL PRIMARY KEY,
            persona_id INTEGER NOT NULL REFERENCES personas(persona_id) ON DELETE CASCADE,
            attribute_key VARCHAR(100) NOT NULL,
            attribute_value VARCHAR(500) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE(persona_id, attribute_key)
        )
    """))

    p_count = (await db.execute(text("SELECT COUNT(*) FROM personas"))).scalar() or 0
    if p_count == 0:
        org_row = (await db.execute(text("SELECT organization_id FROM organizations LIMIT 1"))).first()
        org_id = org_row[0] if org_row else 1

        personas_seed = [
            ("Senior Quantitative Analyst", "PERSONA_SR_QUANT", "Quantitative modelers and financial risk engineers with GL and transactional analytical clearance"),
            ("Data Platform Engineer", "PERSONA_DATA_PLATFORM", "Core infrastructure engineers responsible for cross-cloud pipelines and transformations"),
            ("Compliance & Risk Officer", "PERSONA_RISK_AUDITOR", "Global compliance audit and security oversight officers inspecting restricted data domains"),
            ("Growth & Marketing Strategist", "PERSONA_MARKETING_LEAD", "Omnichannel marketing campaign strategists analyzing customer profile segments"),
        ]
        for p_name, p_code, p_desc in personas_seed:
            await db.execute(text("""
                INSERT INTO personas (organization_id, persona_name, persona_code, description, is_active)
                VALUES (:org_id, :name, :code, :desc, TRUE)
                ON CONFLICT (organization_id, persona_code) DO NOTHING
            """), {"org_id": org_id, "name": p_name, "code": p_code, "desc": p_desc})

        persona_rows = (await db.execute(text("SELECT persona_id, persona_code FROM personas"))).fetchall()
        p_map = {p[1]: p[0] for p in persona_rows}

        roles = (await db.execute(text("SELECT role_id, role_code FROM roles"))).fetchall()
        role_map = {r[1]: r[0] for r in roles}

        persona_groups = [
            ("PERSONA_SR_QUANT", "ROLE_ANALYST"),
            ("PERSONA_SR_QUANT", "FINANCE_ANALYST"),
            ("PERSONA_DATA_PLATFORM", "ROLE_DATA_ENGINEER"),
            ("PERSONA_DATA_PLATFORM", "DATA_ENGINEER"),
            ("PERSONA_RISK_AUDITOR", "ROLE_COMPLIANCE"),
            ("PERSONA_RISK_AUDITOR", "ROLE_SECURITY"),
            ("PERSONA_MARKETING_LEAD", "ROLE_MARKETING"),
        ]
        for p_code, r_code in persona_groups:
            pid = p_map.get(p_code)
            rid = role_map.get(r_code)
            if pid and rid:
                await db.execute(text("""
                    INSERT INTO persona_group_mappings (persona_id, role_id)
                    VALUES (:pid, :rid)
                    ON CONFLICT (persona_id, role_id) DO NOTHING
                """), {"pid": pid, "rid": rid})

        users = (await db.execute(text("SELECT user_id, username FROM users"))).fetchall()
        user_map = {u[1]: u[0] for u in users}
        persona_users = [
            ("PERSONA_SR_QUANT", "alice.chen"),
            ("PERSONA_DATA_PLATFORM", "frank.nguyen"),
            ("PERSONA_RISK_AUDITOR", "eve.taylor"),
            ("PERSONA_MARKETING_LEAD", "carol.jones"),
        ]
        for p_code, uname in persona_users:
            pid = p_map.get(p_code)
            uid = user_map.get(uname)
            if pid and uid:
                await db.execute(text("""
                    INSERT INTO persona_user_mappings (persona_id, user_id)
                    VALUES (:pid, :uid)
                    ON CONFLICT (persona_id, user_id) DO NOTHING
                """), {"pid": pid, "uid": uid})

        await db.commit()


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
    """List users along with group memberships, personas, attributes, and external platform user mappings."""
    await _ensure_persona_tables(db)
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

    # Fetch personas for these users (both direct assignment and via member groups)
    p_direct_rows = (
        (
            await db.execute(
                text("""
            SELECT pum.user_id, p.persona_id, p.persona_name, p.persona_code
            FROM persona_user_mappings pum
            JOIN personas p ON p.persona_id = pum.persona_id
            WHERE pum.user_id = ANY(:ids) AND p.is_active = TRUE
        """),
                {"ids": u_ids},
            )
        )
        .mappings()
        .all()
    )

    p_group_rows = (
        (
            await db.execute(
                text("""
            SELECT urm.user_id, p.persona_id, p.persona_name, p.persona_code, r.role_name
            FROM user_role_mappings urm
            JOIN persona_group_mappings pgm ON pgm.role_id = urm.role_id
            JOIN personas p ON p.persona_id = pgm.persona_id
            JOIN roles r ON r.role_id = urm.role_id
            WHERE urm.user_id = ANY(:ids) AND urm.is_active = TRUE AND p.is_active = TRUE
        """),
                {"ids": u_ids},
            )
        )
        .mappings()
        .all()
    )

    user_personas: dict[int, dict[int, dict]] = {uid: {} for uid in u_ids}
    for row in p_direct_rows:
        uid = row["user_id"]
        pid = row["persona_id"]
        user_personas[uid][pid] = {
            "persona_id": pid,
            "persona_name": row["persona_name"],
            "persona_code": row["persona_code"],
            "is_direct": True,
            "via_groups": [],
        }
    for row in p_group_rows:
        uid = row["user_id"]
        pid = row["persona_id"]
        if pid not in user_personas[uid]:
            user_personas[uid][pid] = {
                "persona_id": pid,
                "persona_name": row["persona_name"],
                "persona_code": row["persona_code"],
                "is_direct": False,
                "via_groups": [row["role_name"]],
            }
        else:
            if row["role_name"] not in user_personas[uid][pid]["via_groups"]:
                user_personas[uid][pid]["via_groups"].append(row["role_name"])

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
        u["personas"] = list(user_personas.get(u["user_id"], {}).values())
        u["direct_attributes"] = user_attrs.get(u["user_id"], [])
        u["external_mappings"] = user_ext_maps.get(u["user_id"], [])

    return users


@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_persona_tables(db)
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

    # Personas (direct + via groups)
    p_direct_rows = (
        (
            await db.execute(
                text("""
            SELECT pum.persona_id, p.persona_name, p.persona_code
            FROM persona_user_mappings pum
            JOIN personas p ON p.persona_id = pum.persona_id
            WHERE pum.user_id = :u AND p.is_active = TRUE
        """),
                {"u": user_id},
            )
        )
        .mappings()
        .all()
    )
    p_group_rows = (
        (
            await db.execute(
                text("""
            SELECT p.persona_id, p.persona_name, p.persona_code, r.role_name
            FROM user_role_mappings urm
            JOIN persona_group_mappings pgm ON pgm.role_id = urm.role_id
            JOIN personas p ON p.persona_id = pgm.persona_id
            JOIN roles r ON r.role_id = urm.role_id
            WHERE urm.user_id = :u AND urm.is_active = TRUE AND p.is_active = TRUE
        """),
                {"u": user_id},
            )
        )
        .mappings()
        .all()
    )
    p_map: dict[int, dict] = {}
    for r in p_direct_rows:
        pid = r["persona_id"]
        p_map[pid] = {
            "persona_id": pid,
            "persona_name": r["persona_name"],
            "persona_code": r["persona_code"],
            "is_direct": True,
            "via_groups": [],
        }
    for r in p_group_rows:
        pid = r["persona_id"]
        if pid not in p_map:
            p_map[pid] = {
                "persona_id": pid,
                "persona_name": r["persona_name"],
                "persona_code": r["persona_code"],
                "is_direct": False,
                "via_groups": [r["role_name"]],
            }
        else:
            if r["role_name"] not in p_map[pid]["via_groups"]:
                p_map[pid]["via_groups"].append(r["role_name"])
    user_dict["personas"] = list(p_map.values())

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

    # 3b. Synchronize direct persona assignments if provided
    if body.persona_ids is not None:
        await _ensure_persona_tables(db)
        await db.execute(
            text("DELETE FROM persona_user_mappings WHERE user_id = :u AND NOT (persona_id = ANY(:pids))"),
            {"u": user_id, "pids": body.persona_ids},
        )
        for pid in body.persona_ids:
            await db.execute(
                text("""
                    INSERT INTO persona_user_mappings (persona_id, user_id)
                    VALUES (:p, :u)
                    ON CONFLICT (persona_id, user_id) DO NOTHING
                """),
                {"p": pid, "u": user_id},
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
    """Create a new user account with initial group memberships, persona assignments, and attributes."""
    await _ensure_persona_tables(db)
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

    # Assign initial direct personas
    for pid in body.persona_ids or []:
        await db.execute(
            text("""
                INSERT INTO persona_user_mappings (persona_id, user_id)
                VALUES (:p, :u)
                ON CONFLICT DO NOTHING
            """),
            {"p": pid, "u": new_uid},
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

    # 3b. Fetch persona attributes from all personas user belongs to
    await _ensure_persona_tables(db)
    persona_rows = (
        (
            await db.execute(
                text("""
            SELECT DISTINCT p.persona_id, p.persona_name, p.persona_code
            FROM personas p
            LEFT JOIN persona_user_mappings pum ON pum.persona_id = p.persona_id AND pum.user_id = :u
            LEFT JOIN persona_group_mappings pgm ON pgm.persona_id = p.persona_id
            LEFT JOIN user_role_mappings urm ON urm.role_id = pgm.role_id AND urm.user_id = :u AND urm.is_active = TRUE
            WHERE p.is_active = TRUE AND (pum.user_id IS NOT NULL OR urm.user_id IS NOT NULL)
        """),
                {"u": user_id},
            )
        )
        .mappings()
        .all()
    )
    user_personas = [dict(p) for p in persona_rows]
    persona_ids = [p["persona_id"] for p in user_personas]

    persona_attrs = []
    if persona_ids:
        p_attr_rows = (
            (
                await db.execute(
                    text("""
                SELECT pa.persona_id, pa.attribute_key, pa.attribute_value, p.persona_name, p.persona_code
                FROM persona_attributes pa
                JOIN personas p ON p.persona_id = pa.persona_id
                WHERE pa.persona_id = ANY(:pids)
                ORDER BY p.persona_name, pa.attribute_key
            """),
                    {"pids": persona_ids},
                )
            )
            .mappings()
            .all()
        )

        for pa in p_attr_rows:
            persona_attrs.append(
                {
                    "key": pa["attribute_key"],
                    "value": pa["attribute_value"],
                    "source_persona": pa["persona_name"],
                    "persona_code": pa["persona_code"],
                    "persona_id": pa["persona_id"],
                }
            )

    # 4. Compute effective attribute map: Group < Persona < Direct User
    effective_map = {}
    for ia in inherited_attrs:
        effective_map[ia["key"]] = ia["value"]
    for pa in persona_attrs:
        effective_map[pa["key"]] = pa["value"]
    for da in direct_attrs:
        effective_map[da["attribute_key"]] = da["attribute_value"]

    return {
        "user_id": user_id,
        "direct_attributes": direct_attrs,
        "inherited_attributes": inherited_attrs,
        "persona_attributes": persona_attrs,
        "effective_attribute_map": effective_map,
        "groups": user_groups,
        "personas": user_personas,
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
    """List all identity groups along with active member counts, assigned personas, and group attributes."""
    await _ensure_persona_tables(db)
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

    # Fetch persona mappings for each role
    rp_rows = (
        (
            await db.execute(
                text("""
            SELECT pgm.role_id, p.persona_id, p.persona_name, p.persona_code
            FROM persona_group_mappings pgm
            JOIN personas p ON p.persona_id = pgm.persona_id
            WHERE p.is_active = TRUE
            ORDER BY p.persona_name
        """)
            )
        )
        .mappings()
        .all()
    )

    rp_map: dict[int, list[dict]] = {r["role_id"]: [] for r in roles}
    for rp in rp_rows:
        if rp["role_id"] in rp_map:
            rp_map[rp["role_id"]].append(
                {
                    "persona_id": rp["persona_id"],
                    "persona_name": rp["persona_name"],
                    "persona_code": rp["persona_code"],
                }
            )

    for r in roles:
        r["attributes"] = ga_map.get(r["role_id"], [])
        r["personas"] = rp_map.get(r["role_id"], [])

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


# ─── Personas API (Functional Business Access Archetypes) ─────────────────────


@router.get("/personas")
async def list_personas(
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """
    List all business personas, their constituent identity groups, direct member users,
    and the dynamically calculated effective users roster.
    """
    await _ensure_persona_tables(db)
    rows = (
        (
            await db.execute(
                text("""
            SELECT persona_id, organization_id, persona_name, persona_code,
                   description, is_active, created_at, updated_at
            FROM personas
            WHERE is_active = TRUE
            ORDER BY persona_name
        """)
            )
        )
        .mappings()
        .all()
    )
    personas = [dict(r) for r in rows]
    if not personas:
        return []

    p_ids = [p["persona_id"] for p in personas]

    # 1. Fetch assigned Identity Groups for all personas
    group_rows = (
        (
            await db.execute(
                text("""
            SELECT pgm.persona_id, r.role_id, r.role_name, r.role_code, r.description,
                   (SELECT COUNT(*) FROM user_role_mappings urm WHERE urm.role_id = r.role_id AND urm.is_active = TRUE) AS member_count
            FROM persona_group_mappings pgm
            JOIN roles r ON r.role_id = pgm.role_id
            WHERE pgm.persona_id = ANY(:pids) AND r.is_active = TRUE
            ORDER BY r.role_name
        """),
                {"pids": p_ids},
            )
        )
        .mappings()
        .all()
    )
    persona_groups: dict[int, list[dict]] = {pid: [] for pid in p_ids}
    for gr in group_rows:
        persona_groups[gr["persona_id"]].append(
            {
                "role_id": gr["role_id"],
                "role_name": gr["role_name"],
                "role_code": gr["role_code"],
                "description": gr["description"],
                "member_count": gr["member_count"],
            }
        )

    # 2. Fetch directly assigned Users for all personas
    direct_user_rows = (
        (
            await db.execute(
                text("""
            SELECT pum.persona_id, u.user_id, u.username, u.display_name, u.email, u.department, u.job_title
            FROM persona_user_mappings pum
            JOIN users u ON u.user_id = pum.user_id
            WHERE pum.persona_id = ANY(:pids) AND u.is_active = TRUE
            ORDER BY u.display_name, u.username
        """),
                {"pids": p_ids},
            )
        )
        .mappings()
        .all()
    )
    persona_direct_users: dict[int, list[dict]] = {pid: [] for pid in p_ids}
    for ur in direct_user_rows:
        persona_direct_users[ur["persona_id"]].append(
            {
                "user_id": ur["user_id"],
                "username": ur["username"],
                "display_name": ur["display_name"] or ur["username"],
                "email": ur["email"],
                "department": ur["department"],
                "job_title": ur["job_title"],
            }
        )

    # 3. Calculate effective user IDs (direct users + users from member groups)
    effective_user_rows = (
        (
            await db.execute(
                text("""
            SELECT DISTINCT pgm.persona_id, urm.user_id
            FROM persona_group_mappings pgm
            JOIN user_role_mappings urm ON urm.role_id = pgm.role_id
            JOIN users u ON u.user_id = urm.user_id
            WHERE pgm.persona_id = ANY(:pids) AND urm.is_active = TRUE AND u.is_active = TRUE
        """),
                {"pids": p_ids},
            )
        )
        .mappings()
        .all()
    )
    persona_effective_uids: dict[int, set[int]] = {pid: set() for pid in p_ids}
    for er in effective_user_rows:
        persona_effective_uids[er["persona_id"]].add(er["user_id"])
    for pid in p_ids:
        for du in persona_direct_users.get(pid, []):
            persona_effective_uids[pid].add(du["user_id"])

    # 4. Fetch Persona Attributes
    attr_rows = (
        (
            await db.execute(
                text("""
            SELECT attribute_id, persona_id, attribute_key, attribute_value
            FROM persona_attributes
            WHERE persona_id = ANY(:pids)
            ORDER BY attribute_key
        """),
                {"pids": p_ids},
            )
        )
        .mappings()
        .all()
    )
    persona_attrs: dict[int, list[dict]] = {pid: [] for pid in p_ids}
    for ar in attr_rows:
        persona_attrs[ar["persona_id"]].append(
            {
                "attribute_id": ar["attribute_id"],
                "key": ar["attribute_key"],
                "value": ar["attribute_value"],
            }
        )

    # Assemble response
    for p in personas:
        pid = p["persona_id"]
        groups = persona_groups.get(pid, [])
        direct_users = persona_direct_users.get(pid, [])
        eff_count = len(persona_effective_uids.get(pid, set()))
        p["groups"] = groups
        p["direct_users"] = direct_users
        p["group_count"] = len(groups)
        p["direct_user_count"] = len(direct_users)
        p["effective_user_count"] = eff_count
        p["attributes"] = persona_attrs.get(pid, [])

    return personas


@router.get("/personas/{persona_id}")
async def get_persona(
    persona_id: int,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve detailed persona specification with constituent groups, direct users, and effective roster."""
    await _ensure_persona_tables(db)
    row = (
        (
            await db.execute(
                text("""
            SELECT persona_id, organization_id, persona_name, persona_code,
                   description, is_active, created_at, updated_at
            FROM personas
            WHERE persona_id = :p
        """),
                {"p": persona_id},
            )
        )
        .mappings()
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Persona not found")
    p = dict(row)

    # 1. Member Groups
    group_rows = (
        (
            await db.execute(
                text("""
            SELECT r.role_id, r.role_name, r.role_code, r.description,
                   (SELECT COUNT(*) FROM user_role_mappings urm WHERE urm.role_id = r.role_id AND urm.is_active = TRUE) AS member_count
            FROM persona_group_mappings pgm
            JOIN roles r ON r.role_id = pgm.role_id
            WHERE pgm.persona_id = :p AND r.is_active = TRUE
            ORDER BY r.role_name
        """),
                {"p": persona_id},
            )
        )
        .mappings()
        .all()
    )
    p["groups"] = [dict(g) for g in group_rows]
    p["group_count"] = len(p["groups"])

    # 2. Direct Users
    direct_user_rows = (
        (
            await db.execute(
                text("""
            SELECT u.user_id, u.username, u.display_name, u.email, u.department, u.job_title
            FROM persona_user_mappings pum
            JOIN users u ON u.user_id = pum.user_id
            WHERE pum.persona_id = :p AND u.is_active = TRUE
            ORDER BY u.display_name, u.username
        """),
                {"p": persona_id},
            )
        )
        .mappings()
        .all()
    )
    p["direct_users"] = [dict(u) for u in direct_user_rows]
    p["direct_user_count"] = len(p["direct_users"])

    # 3. Effective Users Roster (Direct + Through Groups)
    effective_map: dict[int, dict] = {}

    # Add direct users
    for du in p["direct_users"]:
        uid = du["user_id"]
        effective_map[uid] = {
            "user_id": uid,
            "username": du["username"],
            "display_name": du["display_name"],
            "email": du["email"],
            "department": du["department"],
            "job_title": du["job_title"],
            "is_direct": True,
            "via_groups": [],
        }

    # Add users from member groups
    group_members = (
        (
            await db.execute(
                text("""
            SELECT urm.user_id, u.username, u.display_name, u.email, u.department, u.job_title, r.role_name
            FROM persona_group_mappings pgm
            JOIN user_role_mappings urm ON urm.role_id = pgm.role_id
            JOIN users u ON u.user_id = urm.user_id
            JOIN roles r ON r.role_id = pgm.role_id
            WHERE pgm.persona_id = :p AND urm.is_active = TRUE AND u.is_active = TRUE
            ORDER BY u.display_name, u.username
        """),
                {"p": persona_id},
            )
        )
        .mappings()
        .all()
    )

    for gm in group_members:
        uid = gm["user_id"]
        if uid not in effective_map:
            effective_map[uid] = {
                "user_id": uid,
                "username": gm["username"],
                "display_name": gm["display_name"] or gm["username"],
                "email": gm["email"],
                "department": gm["department"],
                "job_title": gm["job_title"],
                "is_direct": False,
                "via_groups": [gm["role_name"]],
            }
        else:
            if gm["role_name"] not in effective_map[uid]["via_groups"]:
                effective_map[uid]["via_groups"].append(gm["role_name"])

    p["effective_users"] = list(effective_map.values())
    p["effective_user_count"] = len(effective_map)

    # 4. Attributes
    attr_rows = (
        (
            await db.execute(
                text("""
            SELECT attribute_id, attribute_key, attribute_value
            FROM persona_attributes
            WHERE persona_id = :p
            ORDER BY attribute_key
        """),
                {"p": persona_id},
            )
        )
        .mappings()
        .all()
    )
    p["attributes"] = [
        {"attribute_id": a["attribute_id"], "key": a["attribute_key"], "value": a["attribute_value"]}
        for a in attr_rows
    ]

    return p


@router.post("/personas", status_code=status.HTTP_201_CREATED)
async def create_persona(
    body: PersonaCreate,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """Create a new functional user Persona with assigned Identity Groups and direct Member Users."""
    await _ensure_persona_tables(db)
    org_row = (await db.execute(text("SELECT organization_id FROM organizations LIMIT 1"))).first()
    org_id = org_row.organization_id if org_row else 1

    code = body.persona_code.strip().upper().replace(" ", "_")

    ins_res = (
        (
            await db.execute(
                text("""
            INSERT INTO personas (organization_id, persona_name, persona_code, description, is_active)
            VALUES (:org_id, :name, :code, :desc, TRUE)
            RETURNING persona_id, organization_id, persona_name, persona_code, description, is_active
        """),
                {
                    "org_id": org_id,
                    "name": body.persona_name.strip(),
                    "code": code,
                    "desc": body.description,
                },
            )
        )
        .mappings()
        .first()
    )
    new_pid = ins_res["persona_id"]

    # Assign groups
    for gid in body.group_ids or []:
        await db.execute(
            text("""
                INSERT INTO persona_group_mappings (persona_id, role_id)
                VALUES (:p, :r)
                ON CONFLICT (persona_id, role_id) DO NOTHING
            """),
            {"p": new_pid, "r": gid},
        )

    # Assign direct users
    for uid in body.user_ids or []:
        await db.execute(
            text("""
                INSERT INTO persona_user_mappings (persona_id, user_id)
                VALUES (:p, :u)
                ON CONFLICT (persona_id, user_id) DO NOTHING
            """),
            {"p": new_pid, "u": uid},
        )

    # Assign attributes
    for k, v in (body.attributes or {}).items():
        await db.execute(
            text("""
                INSERT INTO persona_attributes (persona_id, attribute_key, attribute_value)
                VALUES (:p, :k, :v)
                ON CONFLICT (persona_id, attribute_key) DO UPDATE SET attribute_value = EXCLUDED.attribute_value
            """),
            {"p": new_pid, "k": k, "v": v},
        )

    await db.commit()
    return await get_persona(persona_id=new_pid, current_user=current_user, db=db)


@router.put("/personas/{persona_id}")
async def update_persona(
    persona_id: int,
    body: PersonaUpdate,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """Update persona metadata, assigned identity groups, and assigned direct users."""
    await _ensure_persona_tables(db)
    existing = (
        await db.execute(text("SELECT persona_id FROM personas WHERE persona_id = :p"), {"p": persona_id})
    ).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Persona not found")

    code = body.persona_code.strip().upper().replace(" ", "_") if body.persona_code else None

    await db.execute(
        text("""
            UPDATE personas
            SET persona_name = COALESCE(:name, persona_name),
                persona_code = COALESCE(:code, persona_code),
                description  = COALESCE(:desc, description),
                is_active    = COALESCE(:is_active, is_active),
                updated_at   = NOW()
            WHERE persona_id = :p
        """),
        {
            "p": persona_id,
            "name": body.persona_name.strip() if body.persona_name else None,
            "code": code,
            "desc": body.description,
            "is_active": body.is_active,
        },
    )

    # Sync groups
    if body.group_ids is not None:
        await db.execute(
            text("DELETE FROM persona_group_mappings WHERE persona_id = :p AND NOT (role_id = ANY(:gids))"),
            {"p": persona_id, "gids": body.group_ids},
        )
        for gid in body.group_ids:
            await db.execute(
                text("""
                    INSERT INTO persona_group_mappings (persona_id, role_id)
                    VALUES (:p, :r)
                    ON CONFLICT (persona_id, role_id) DO NOTHING
                """),
                {"p": persona_id, "r": gid},
            )

    # Sync users
    if body.user_ids is not None:
        await db.execute(
            text("DELETE FROM persona_user_mappings WHERE persona_id = :p AND NOT (user_id = ANY(:uids))"),
            {"p": persona_id, "uids": body.user_ids},
        )
        for uid in body.user_ids:
            await db.execute(
                text("""
                    INSERT INTO persona_user_mappings (persona_id, user_id)
                    VALUES (:p, :u)
                    ON CONFLICT (persona_id, user_id) DO NOTHING
                """),
                {"p": persona_id, "u": uid},
            )

    await db.commit()
    return await get_persona(persona_id=persona_id, current_user=current_user, db=db)


@router.delete("/personas/{persona_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_persona(
    persona_id: int,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """Delete a persona and its member associations."""
    await _ensure_persona_tables(db)
    await db.execute(text("DELETE FROM personas WHERE persona_id = :p"), {"p": persona_id})
    await db.commit()


@router.post("/personas/{persona_id}/groups")
async def assign_groups_to_persona(
    persona_id: int,
    body: PersonaGroupAssign,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """Assign one or more identity groups to a persona."""
    await _ensure_persona_tables(db)
    for rid in body.role_ids:
        await db.execute(
            text("""
                INSERT INTO persona_group_mappings (persona_id, role_id)
                VALUES (:p, :r)
                ON CONFLICT (persona_id, role_id) DO NOTHING
            """),
            {"p": persona_id, "r": rid},
        )
    await db.commit()
    return {"status": "assigned", "role_ids": body.role_ids}


@router.delete("/personas/{persona_id}/groups/{role_id}")
async def remove_group_from_persona(
    persona_id: int,
    role_id: int,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """Remove an identity group from a persona."""
    await _ensure_persona_tables(db)
    await db.execute(
        text("DELETE FROM persona_group_mappings WHERE persona_id = :p AND role_id = :r"),
        {"p": persona_id, "r": role_id},
    )
    await db.commit()
    return {"status": "removed"}


@router.post("/personas/{persona_id}/users")
async def assign_users_to_persona(
    persona_id: int,
    body: PersonaUserAssign,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """Assign one or more direct users to a persona."""
    await _ensure_persona_tables(db)
    for uid in body.user_ids:
        await db.execute(
            text("""
                INSERT INTO persona_user_mappings (persona_id, user_id)
                VALUES (:p, :u)
                ON CONFLICT (persona_id, user_id) DO NOTHING
            """),
            {"p": persona_id, "u": uid},
        )
    await db.commit()
    return {"status": "assigned", "user_ids": body.user_ids}


@router.delete("/personas/{persona_id}/users/{user_id}")
async def remove_user_from_persona(
    persona_id: int,
    user_id: int,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    """Remove a direct user assignment from a persona."""
    await _ensure_persona_tables(db)
    await db.execute(
        text("DELETE FROM persona_user_mappings WHERE persona_id = :p AND user_id = :u"),
        {"p": persona_id, "u": user_id},
    )
    await db.commit()
    return {"status": "removed"}


@router.put("/personas/{persona_id}/attributes")
async def upsert_persona_attribute(
    persona_id: int,
    body: AttributeUpsert,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_persona_tables(db)
    await db.execute(
        text("""
            INSERT INTO persona_attributes (persona_id, attribute_key, attribute_value)
            VALUES (:p, :k, :v)
            ON CONFLICT (persona_id, attribute_key)
            DO UPDATE SET attribute_value = EXCLUDED.attribute_value, updated_at = NOW();
        """),
        {"p": persona_id, "k": body.attribute_key, "v": body.attribute_value},
    )
    await db.commit()
    return {"status": "upserted"}


@router.delete(
    "/personas/{persona_id}/attributes/{attribute_key}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_persona_attribute(
    persona_id: int,
    attribute_key: str,
    current_user: CurrentUser = Depends(require_roles("POLICY_ADMIN", "SUPER_ADMIN")),
    db: AsyncSession = Depends(get_db),
):
    await _ensure_persona_tables(db)
    await db.execute(
        text("DELETE FROM persona_attributes WHERE persona_id = :p AND attribute_key = :k"),
        {"p": persona_id, "k": attribute_key},
    )
    await db.commit()
