import asyncio

from sqlalchemy import text

from db.session import AsyncSessionLocal


async def seed_tags():
    async with AsyncSessionLocal() as session:
        # Roots
        await session.execute(text("""
            INSERT INTO metadata_tags (tag_name, tag_category, full_path, source_type, description)
            VALUES
            ('Discovered', 'SYSTEM', 'Discovered', 'AUTOMATED_DISCOVERY', 'Root category for automated sensitive data discovery identifiers'),
            ('Governance', 'GOVERNANCE', 'Governance', 'MANUAL', 'Enterprise data governance, privacy, and confidentiality levels'),
            ('Compliance', 'COMPLIANCE', 'Compliance', 'MANUAL', 'Regulatory compliance mandates (HIPAA, GDPR, PCI-DSS)')
            ON CONFLICT (full_path) DO NOTHING;
        """))
        await session.commit()

        roots = (
            await session.execute(
                text("SELECT tag_id, tag_name FROM metadata_tags WHERE parent_tag_id IS NULL")
            )
        ).fetchall()
        root_map = {r[1]: r[0] for r in roots}
        disc_id = root_map.get("Discovered")
        gov_id = root_map.get("Governance")
        comp_id = root_map.get("Compliance")

        if disc_id:
            await session.execute(text(f"""
                INSERT INTO metadata_tags (tag_name, parent_tag_id, tag_category, full_path, source_type, description)
                VALUES
                ('PII', {disc_id}, 'PII', 'Discovered.PII', 'AUTOMATED_DISCOVERY', 'Personally Identifiable Information identifiers'),
                ('Financial', {disc_id}, 'FINANCIAL', 'Discovered.Financial', 'AUTOMATED_DISCOVERY', 'Financial account and compensation data identifiers'),
                ('Location', {disc_id}, 'LOCATION', 'Discovered.Location', 'AUTOMATED_DISCOVERY', 'Geographic and address identifiers')
                ON CONFLICT (full_path) DO NOTHING;
            """))
            await session.commit()

        if gov_id:
            await session.execute(text(f"""
                INSERT INTO metadata_tags (tag_name, parent_tag_id, tag_category, full_path, source_type, description)
                VALUES
                ('Confidentiality', {gov_id}, 'CONFIDENTIALITY', 'Governance.Confidentiality', 'MANUAL', 'Data classification tiers')
                ON CONFLICT (full_path) DO NOTHING;
            """))
            await session.commit()

        if comp_id:
            await session.execute(text(f"""
                INSERT INTO metadata_tags (tag_name, parent_tag_id, tag_category, full_path, source_type, description)
                VALUES
                ('HIPAA', {comp_id}, 'COMPLIANCE', 'Compliance.HIPAA', 'MANUAL', 'Health Insurance Portability and Accountability Act data'),
                ('GDPR', {comp_id}, 'COMPLIANCE', 'Compliance.GDPR', 'MANUAL', 'European General Data Protection Regulation personal data'),
                ('PCI-DSS', {comp_id}, 'COMPLIANCE', 'Compliance.PCI-DSS', 'MANUAL', 'Payment Card Industry Data Security Standard data')
                ON CONFLICT (full_path) DO NOTHING;
            """))
            await session.commit()

        subcats = (
            await session.execute(text("SELECT tag_id, full_path FROM metadata_tags"))
        ).fetchall()
        sub_map = {s[1]: s[0] for s in subcats}

        pii_id = sub_map.get("Discovered.PII")
        fin_id = sub_map.get("Discovered.Financial")
        loc_id = sub_map.get("Discovered.Location")
        conf_id = sub_map.get("Governance.Confidentiality")

        if pii_id:
            await session.execute(text(f"""
                INSERT INTO metadata_tags (tag_name, parent_tag_id, tag_category, full_path, source_type, description)
                VALUES
                ('Email', {pii_id}, 'PII', 'Discovered.PII.Email', 'AUTOMATED_DISCOVERY', 'Email address columns'),
                ('Phone', {pii_id}, 'PII', 'Discovered.PII.Phone', 'AUTOMATED_DISCOVERY', 'Telephone, mobile, or contact phone numbers'),
                ('SSN', {pii_id}, 'PII', 'Discovered.PII.SSN', 'AUTOMATED_DISCOVERY', 'Social Security or National Identification numbers'),
                ('Name', {pii_id}, 'PII', 'Discovered.PII.Name', 'AUTOMATED_DISCOVERY', 'Customer, employee, or person names')
                ON CONFLICT (full_path) DO NOTHING;
            """))

        if fin_id:
            await session.execute(text(f"""
                INSERT INTO metadata_tags (tag_name, parent_tag_id, tag_category, full_path, source_type, description)
                VALUES
                ('CreditCard', {fin_id}, 'FINANCIAL', 'Discovered.Financial.CreditCard', 'AUTOMATED_DISCOVERY', 'Payment credit/debit card numbers'),
                ('Salary', {fin_id}, 'FINANCIAL', 'Discovered.Financial.Salary', 'AUTOMATED_DISCOVERY', 'Employee salary, compensation, or wage figures'),
                ('BankAccount', {fin_id}, 'FINANCIAL', 'Discovered.Financial.BankAccount', 'AUTOMATED_DISCOVERY', 'Bank account, IBAN, or routing numbers')
                ON CONFLICT (full_path) DO NOTHING;
            """))

        if loc_id:
            await session.execute(text(f"""
                INSERT INTO metadata_tags (tag_name, parent_tag_id, tag_category, full_path, source_type, description)
                VALUES
                ('Address', {loc_id}, 'LOCATION', 'Discovered.Location.Address', 'AUTOMATED_DISCOVERY', 'Street, postal address, or residence')
                ON CONFLICT (full_path) DO NOTHING;
            """))

        if conf_id:
            await session.execute(text(f"""
                INSERT INTO metadata_tags (tag_name, parent_tag_id, tag_category, full_path, source_type, description)
                VALUES
                ('Restricted', {conf_id}, 'CONFIDENTIALITY', 'Governance.Confidentiality.Restricted', 'MANUAL', 'Highest protection: restricted access only'),
                ('Confidential', {conf_id}, 'CONFIDENTIALITY', 'Governance.Confidentiality.Confidential', 'MANUAL', 'Internal confidential business data'),
                ('Internal', {conf_id}, 'CONFIDENTIALITY', 'Governance.Confidentiality.Internal', 'MANUAL', 'General internal business data'),
                ('Public', {conf_id}, 'CONFIDENTIALITY', 'Governance.Confidentiality.Public', 'MANUAL', 'Publicly accessible unclassified data')
                ON CONFLICT (full_path) DO NOTHING;
            """))

        await session.commit()
        print("SUCCESS: Seeded CES Hierarchical Tags taxonomy.")


if __name__ == "__main__":
    asyncio.run(seed_tags())
