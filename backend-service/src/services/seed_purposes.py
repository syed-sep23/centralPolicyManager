import asyncio

from sqlalchemy import text

from db.session import AsyncSessionLocal


async def seed_purposes():
    async with AsyncSessionLocal() as session:
        org_row = (
            await session.execute(text("SELECT organization_id FROM organizations LIMIT 1"))
        ).first()
        org_id = org_row.organization_id if org_row else 1

        purposes = [
            (
                "FRAUD_DETECTION",
                "Fraud & Anti-Money Laundering Detection",
                "Contextual purpose for investigating suspicious transactions, credit card fraud, and anti-money laundering (AML) violations.",
                "AML / BSA Regulations",
                "RESTRICTED",
                180,
            ),
            (
                "REGULATORY_AUDIT",
                "Regulatory Compliance & Financial Audit",
                "Purpose for conducting independent audits, SOX 404 control testing, and external regulatory reviews.",
                "SOX 404 / SEC Mandate",
                "RESTRICTED",
                365,
            ),
            (
                "CUSTOMER_SERVICE_SUPPORT",
                "Customer Service & Dispute Resolution",
                "Limited operational purpose for resolving customer inquiries, chargeback disputes, and order issues.",
                "GDPR Art 6(1)(b) Contract",
                "CONFIDENTIAL",
                90,
            ),
            (
                "DATA_SCIENCE_RESEARCH",
                "Data Science & Predictive Modeling",
                "Research purpose for exploratory data science, training churn models, and developing recommendation engines on anonymized data.",
                "GDPR Art 89 Research",
                "INTERNAL",
                730,
            ),
            (
                "MARKETING_CAMPAIGN",
                "Personalized Marketing & Growth Campaigns",
                "Commercial marketing purpose for promotional outreach, targeted communications, and campaign performance analytics.",
                "GDPR Art 6(1)(a) Consent",
                "INTERNAL",
                60,
            ),
            (
                "HIPAA_PATIENT_CARE",
                "HIPAA Treatment & Clinical Operations",
                "Healthcare clinical operations purpose adhering to HIPAA Minimum Necessary standards for patient treatment.",
                "HIPAA Privacy Rule 45 CFR",
                "RESTRICTED",
                365,
            ),
        ]

        for code, name, desc, mandate, max_sens, ret_days in purposes:
            await session.execute(
                text("""
                INSERT INTO purposes (organization_id, purpose_code, purpose_name, description, regulatory_mandate, max_sensitivity, retention_days)
                VALUES (:org, :code, :name, :desc, :mandate, :max_sens, :ret_days)
                ON CONFLICT (purpose_code) DO UPDATE SET
                    purpose_name = EXCLUDED.purpose_name,
                    description = EXCLUDED.description,
                    regulatory_mandate = EXCLUDED.regulatory_mandate,
                    max_sensitivity = EXCLUDED.max_sensitivity,
                    retention_days = EXCLUDED.retention_days;
            """),
                {
                    "org": org_id,
                    "code": code,
                    "name": name,
                    "desc": desc,
                    "mandate": mandate,
                    "max_sens": max_sens,
                    "ret_days": ret_days,
                },
            )

        await session.commit()

        # Authorize users for purposes
        users = (await session.execute(text("SELECT user_id, username FROM users"))).fetchall()
        p_rows = (
            await session.execute(text("SELECT purpose_id, purpose_code FROM purposes"))
        ).fetchall()
        p_map = {p[1]: p[0] for p in p_rows}

        for u in users:
            uid = u[0]
            # Grant FRAUD_DETECTION & REGULATORY_AUDIT to user 1 (sarah.chen)
            if uid == 1:
                for p_code in ["FRAUD_DETECTION", "REGULATORY_AUDIT"]:
                    pid = p_map.get(p_code)
                    if pid:
                        await session.execute(
                            text("""
                            INSERT INTO user_purposes (user_id, purpose_id)
                            VALUES (:u, :p)
                            ON CONFLICT DO NOTHING;
                        """),
                            {"u": uid, "p": pid},
                        )

            # Grant DATA_SCIENCE_RESEARCH to users 2 and 3
            if uid in (2, 3):
                pid = p_map.get("DATA_SCIENCE_RESEARCH")
                if pid:
                    await session.execute(
                        text("""
                        INSERT INTO user_purposes (user_id, purpose_id)
                        VALUES (:u, :p)
                        ON CONFLICT DO NOTHING;
                    """),
                        {"u": uid, "p": pid},
                    )

            # Grant CUSTOMER_SERVICE_SUPPORT to user 4
            if uid == 4:
                pid = p_map.get("CUSTOMER_SERVICE_SUPPORT")
                if pid:
                    await session.execute(
                        text("""
                        INSERT INTO user_purposes (user_id, purpose_id)
                        VALUES (:u, :p)
                        ON CONFLICT DO NOTHING;
                    """),
                        {"u": uid, "p": pid},
                    )

        await session.commit()
        print("SUCCESS: Seeded CES PBAC purposes and user purpose authorizations.")


if __name__ == "__main__":
    asyncio.run(seed_purposes())
