import asyncio
from sqlalchemy import text
from src.db.session import AsyncSessionLocal

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
                await session.execute(text("""
                    INSERT INTO group_attributes (role_id, attribute_key, attribute_value)
                    VALUES (:r_id, :k, :v)
                    ON CONFLICT (role_id, attribute_key)
                    DO UPDATE SET attribute_value = EXCLUDED.attribute_value;
                """), {"r_id": r_id, "k": k, "v": v})

        # Ensure realistic user attributes
        users = (await session.execute(text("SELECT user_id, username FROM users"))).fetchall()
        for idx, u in enumerate(users):
            u_id = u[0]
            country_val = "US" if idx % 2 == 0 else "EU"
            await session.execute(text("""
                INSERT INTO user_attributes (user_id, attribute_key, attribute_value, attribute_source)
                VALUES (:u, 'country', :country, 'LDAP')
                ON CONFLICT (user_id, attribute_key) DO UPDATE SET attribute_value = EXCLUDED.attribute_value;
            """), {"u": u_id, "country": country_val})

            await session.execute(text("""
                INSERT INTO user_attributes (user_id, attribute_key, attribute_value, attribute_source)
                VALUES (:u, 'employment_type', 'FULL_TIME', 'LDAP')
                ON CONFLICT (user_id, attribute_key) DO UPDATE SET attribute_value = EXCLUDED.attribute_value;
            """), {"u": u_id})

        await session.commit()
        print("SUCCESS: Seeded Immuta Identity Group Attributes and User Attributes.")

if __name__ == "__main__":
    asyncio.run(seed_identities())
