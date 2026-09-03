"""
Sensitive Data Discovery Scanner (CES-style automated identifiers).
Evaluates regex & dictionary matchers against data catalog columns to discover PII,
Financial, and Location attributes and automatically tags columns across enterprise datasets.
"""

import re
from typing import Any

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

log = structlog.get_logger()

# CES-style Automated Identifiers
IDENTIFIERS = [
    {
        "tag_path": "Discovered.PII.Email",
        "category": "PII",
        "pattern": re.compile(r".*(email|mail_addr|e_mail).*", re.IGNORECASE),
        "description": "Email address classifier",
    },
    {
        "tag_path": "Discovered.PII.Phone",
        "category": "PII",
        "pattern": re.compile(r".*(phone|mobile|cell|contact_num|tel_num).*", re.IGNORECASE),
        "description": "Telephone & mobile number classifier",
    },
    {
        "tag_path": "Discovered.PII.SSN",
        "category": "PII",
        "pattern": re.compile(r".*(ssn|social_sec|national_id|tax_id).*", re.IGNORECASE),
        "description": "Social Security & National ID classifier",
    },
    {
        "tag_path": "Discovered.PII.Name",
        "category": "PII",
        "pattern": re.compile(
            r".*(first_name|last_name|full_name|customer_name|patient_name|user_name|contact_name).*",
            re.IGNORECASE,
        ),
        "description": "Person full/first/last name classifier",
    },
    {
        "tag_path": "Discovered.Financial.CreditCard",
        "category": "FINANCIAL",
        "pattern": re.compile(r".*(card_num|credit_card|cc_num|pan|card_number).*", re.IGNORECASE),
        "description": "Payment card / credit card classifier",
    },
    {
        "tag_path": "Discovered.Financial.Salary",
        "category": "FINANCIAL",
        "pattern": re.compile(
            r".*(salary|wage|compensation|bonus|annual_income|pay_rate).*", re.IGNORECASE
        ),
        "description": "Employee compensation / wage classifier",
    },
    {
        "tag_path": "Discovered.Financial.BankAccount",
        "category": "FINANCIAL",
        "pattern": re.compile(
            r".*(account_num|bank_acc|iban|routing_num|swift_code).*", re.IGNORECASE
        ),
        "description": "Bank account and routing number classifier",
    },
    {
        "tag_path": "Discovered.Location.Address",
        "category": "LOCATION",
        "pattern": re.compile(
            r".*(address|street|zip_code|postal_code|city|state_code).*", re.IGNORECASE
        ),
        "description": "Physical / postal address classifier",
    },
]


async def run_sensitive_data_discovery(db: AsyncSession) -> dict[str, Any]:
    """
    Scan all registered data catalog columns, evaluate regex classifiers,
    and automatically create tag assignments in metadata_tag_assignments.
    """
    # 1. Fetch all catalog columns
    query = text("""
        SELECT
            c.column_id,
            c.column_name,
            c.data_type,
            t.table_id,
            t.table_name,
            s.schema_name,
            d.database_name,
            p.platform_name
        FROM metadata_columns c
        JOIN metadata_tables t ON t.table_id = c.table_id
        JOIN metadata_schemas s ON s.schema_id = t.schema_id
        JOIN metadata_databases d ON d.database_id = s.database_id
        JOIN metadata_platforms p ON p.platform_id = d.platform_id
        ORDER BY t.table_name, c.column_id
    """)
    columns = (await db.execute(query)).mappings().all()

    # 2. Fetch existing tag cache by full_path
    tag_rows = (await db.execute(text("SELECT tag_id, full_path FROM metadata_tags"))).fetchall()
    tag_cache = {r[1]: r[0] for r in tag_rows}

    # 3. Fetch existing assignments to avoid duplicates: set of (tag_id, column_id)
    assign_rows = (
        await db.execute(
            text(
                "SELECT tag_id, column_id FROM metadata_tag_assignments WHERE column_id IS NOT NULL"
            )
        )
    ).fetchall()
    assigned_set = {(r[0], r[1]) for r in assign_rows}

    discovered = []
    new_applied = 0

    for col in columns:
        col_name = col["column_name"]
        for ident in IDENTIFIERS:
            if ident["pattern"].match(col_name):
                tag_path = ident["tag_path"]
                tag_id = tag_cache.get(tag_path)

                if tag_id and (tag_id, col["column_id"]) not in assigned_set:
                    # Insert assignment
                    await db.execute(
                        text("""
                            INSERT INTO metadata_tag_assignments (tag_id, column_id, tag_value, assigned_at_source)
                            VALUES (:tag_id, :col_id, 'CONFIRMED', NOW())
                        """),
                        {"tag_id": tag_id, "col_id": col["column_id"]},
                    )
                    assigned_set.add((tag_id, col["column_id"]))
                    new_applied += 1

                discovered.append(
                    {
                        "column_id": col["column_id"],
                        "column_name": col_name,
                        "data_type": col["data_type"],
                        "table_name": col["table_name"],
                        "schema_name": col["schema_name"],
                        "database_name": col["database_name"],
                        "platform_name": col["platform_name"],
                        "tag_path": tag_path,
                        "category": ident["category"],
                    }
                )
                break  # Match first highest-priority pattern per column

    await db.commit()
    log.info(
        "sensitive_data_discovery_completed",
        scanned=len(columns),
        discovered=len(discovered),
        new_applied=new_applied,
    )

    return {
        "total_columns_scanned": len(columns),
        "total_discovered": len(discovered),
        "new_tags_applied": new_applied,
        "classifications": discovered,
    }
