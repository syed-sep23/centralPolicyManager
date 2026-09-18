import asyncio

from sqlalchemy import text

from db.session import AsyncSessionLocal


async def seed_identities():
    async with AsyncSessionLocal() as session:
        # Fetch roles (groups)
        roles = (await session.execute(text("SELECT role_id, role_code FROM roles"))).fetchall()
        role_map = {r[1]: r[0] for r in roles}

        # Seed group attributes
        group_attrs = [
            ("ROLE_DATA_ENGINEER", "environment", "PRODUCTION"),
            ("ROLE_DATA_ENGINEER", "clearance_level", "RESTRICTED"),
            ("ROLE_ANALYST", "department", "Analytics"),
            ("ROLE_ANALYST", "clearance_level", "CONFIDENTIAL"),
            ("ROLE_COMPLIANCE", "audit_scope", "GLOBAL_ALL_DOMAINS"),
            ("ROLE_COMPLIANCE", "clearance_level", "TOP_SECRET"),
            ("ROLE_SECURITY", "security_tier", "SOC_LEVEL_3"),
            ("ROLE_SECURITY", "clearance_level", "RESTRICTED"),
            ("ROLE_MARKETING", "department", "Marketing"),
            ("ROLE_MARKETING", "region", "US_WEST"),
        ]

        for r_code, k, v in group_attrs:
            r_id = role_map.get(r_code)
            if r_id:
                await session.execute(
                    text("""
                    INSERT INTO group_attributes (role_id, attribute_key, attribute_value)
                    VALUES (:r_id, :k, :v)
                    ON CONFLICT (role_id, attribute_key)
                    DO UPDATE SET attribute_value = EXCLUDED.attribute_value;
                """),
                    {"r_id": r_id, "k": k, "v": v},
                )

        # Ensure realistic user attributes
        users = (await session.execute(text("SELECT user_id, username FROM users"))).fetchall()
        for idx, u in enumerate(users):
            u_id = u[0]
            country_val = "US" if idx % 2 == 0 else "EU"
            await session.execute(
                text("""
                INSERT INTO user_attributes (user_id, attribute_key, attribute_value, attribute_source)
                VALUES (:u, 'country', :country, 'LDAP')
                ON CONFLICT (user_id, attribute_key) DO UPDATE SET attribute_value = EXCLUDED.attribute_value;
            """),
                {"u": u_id, "country": country_val},
            )

            await session.execute(
                text("""
                INSERT INTO user_attributes (user_id, attribute_key, attribute_value, attribute_source)
                VALUES (:u, 'employment_type', 'FULL_TIME', 'LDAP')
                ON CONFLICT (user_id, attribute_key) DO UPDATE SET attribute_value = EXCLUDED.attribute_value;
            """),
                {"u": u_id},
            )

        # Seed Personas (Functional Business Entitlement Archetypes)
        org_row = (await session.execute(text("SELECT organization_id FROM organizations LIMIT 1"))).first()
        org_id = org_row[0] if org_row else 1

        personas_seed = [
            ("Senior Quantitative Analyst", "PERSONA_SR_QUANT", "Quantitative modelers and financial risk engineers with GL and transactional analytical clearance"),
            ("Data Platform Engineer", "PERSONA_DATA_PLATFORM", "Core infrastructure engineers responsible for cross-cloud pipelines and transformations"),
            ("Compliance & Risk Officer", "PERSONA_RISK_AUDITOR", "Global compliance audit and security oversight officers inspecting restricted data domains"),
            ("Growth & Marketing Strategist", "PERSONA_MARKETING_LEAD", "Omnichannel marketing campaign strategists analyzing customer profile segments"),
        ]

        # Ensure tables exist in case engine hasn't recreated them yet
        await session.execute(text("""
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
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS persona_user_mappings (
                mapping_id SERIAL PRIMARY KEY,
                persona_id INTEGER NOT NULL REFERENCES personas(persona_id) ON DELETE CASCADE,
                user_id INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(persona_id, user_id)
            )
        """))
        await session.execute(text("""
            CREATE TABLE IF NOT EXISTS persona_group_mappings (
                mapping_id SERIAL PRIMARY KEY,
                persona_id INTEGER NOT NULL REFERENCES personas(persona_id) ON DELETE CASCADE,
                role_id INTEGER NOT NULL REFERENCES roles(role_id) ON DELETE CASCADE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE(persona_id, role_id)
            )
        """))
        await session.execute(text("""
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

        for p_name, p_code, p_desc in personas_seed:
            await session.execute(text("""
                INSERT INTO personas (organization_id, persona_name, persona_code, description, is_active)
                VALUES (:org_id, :name, :code, :desc, TRUE)
                ON CONFLICT (organization_id, persona_code) DO NOTHING;
            """), {"org_id": org_id, "name": p_name, "code": p_code, "desc": p_desc})

        persona_rows = (await session.execute(text("SELECT persona_id, persona_code FROM personas"))).fetchall()
        p_map = {p[1]: p[0] for p in persona_rows}

        # Seed persona group mappings: Groups inside Personas
        # PERSONA_SR_QUANT has ROLE_ANALYST and FINANCE_ANALYST (or DATA_ANALYST)
        # PERSONA_DATA_PLATFORM has ROLE_DATA_ENGINEER and DATA_ENGINEER
        # PERSONA_RISK_AUDITOR has ROLE_COMPLIANCE and ROLE_SECURITY
        # PERSONA_MARKETING_LEAD has ROLE_MARKETING
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
                await session.execute(text("""
                    INSERT INTO persona_group_mappings (persona_id, role_id)
                    VALUES (:pid, :rid)
                    ON CONFLICT (persona_id, role_id) DO NOTHING;
                """), {"pid": pid, "rid": rid})

        # Seed persona user mappings: Users directly in Personas
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
                await session.execute(text("""
                    INSERT INTO persona_user_mappings (persona_id, user_id)
                    VALUES (:pid, :uid)
                    ON CONFLICT (persona_id, user_id) DO NOTHING;
                """), {"pid": pid, "uid": uid})

        # Seed persona ABAC attributes
        persona_attrs = [
            ("PERSONA_SR_QUANT", "persona_tier", "TIER_1_FINANCIAL"),
            ("PERSONA_DATA_PLATFORM", "persona_tier", "TIER_1_INFRASTRUCTURE"),
            ("PERSONA_RISK_AUDITOR", "persona_tier", "TIER_0_GOVERNANCE"),
            ("PERSONA_MARKETING_LEAD", "persona_tier", "TIER_2_BUSINESS"),
        ]
        for p_code, k, v in persona_attrs:
            pid = p_map.get(p_code)
            if pid:
                await session.execute(text("""
                    INSERT INTO persona_attributes (persona_id, attribute_key, attribute_value)
                    VALUES (:pid, :k, :v)
                    ON CONFLICT (persona_id, attribute_key) DO UPDATE SET attribute_value = EXCLUDED.attribute_value;
                """), {"pid": pid, "k": k, "v": v})

        # Reset sequences
        await session.execute(text("SELECT setval('personas_persona_id_seq', COALESCE((SELECT MAX(persona_id) FROM personas), 1))"))
        await session.execute(text("SELECT setval('persona_user_mappings_mapping_id_seq', COALESCE((SELECT MAX(mapping_id) FROM persona_user_mappings), 1))"))
        await session.execute(text("SELECT setval('persona_group_mappings_mapping_id_seq', COALESCE((SELECT MAX(mapping_id) FROM persona_group_mappings), 1))"))
        await session.execute(text("SELECT setval('persona_attributes_attribute_id_seq', COALESCE((SELECT MAX(attribute_id) FROM persona_attributes), 1))"))

        await session.commit()
        print("SUCCESS: Seeded CES Identity Group Attributes, User Attributes, Personas, and Persona Attributes.")



if __name__ == "__main__":
    asyncio.run(seed_identities())
