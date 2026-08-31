"""Metadata Router."""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from src.db.session import get_db

router = APIRouter()


@router.get("/platforms")
async def list_platforms(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(text("SELECT * FROM metadata_platforms WHERE is_active = TRUE ORDER BY platform_code"))).mappings().all()
    return [dict(r) for r in rows]

@router.get("/platforms/{platform_id}/databases")
async def list_databases(platform_id: int, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(text("SELECT * FROM metadata_databases WHERE platform_id = :p ORDER BY database_name"), {"p": platform_id})).mappings().all()
    return [dict(r) for r in rows]

@router.get("/databases/{database_id}/schemas")
async def list_schemas(database_id: int, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(text("SELECT * FROM metadata_schemas WHERE database_id = :d ORDER BY schema_name"), {"d": database_id})).mappings().all()
    return [dict(r) for r in rows]

@router.get("/schemas/{schema_id}/tables")
async def list_tables(schema_id: int, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(text("SELECT * FROM metadata_tables WHERE schema_id = :s ORDER BY table_name"), {"s": schema_id})).mappings().all()
    return [dict(r) for r in rows]

@router.get("/tables/{table_id}/columns")
async def list_columns(table_id: int, db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(text("SELECT * FROM metadata_columns WHERE table_id = :t ORDER BY ordinal_position"), {"t": table_id})).mappings().all()
    return [dict(r) for r in rows]

@router.get("/search")
async def search_metadata(
    q: str = Query(..., min_length=2),
    type: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
):
    results = {}
    if not type or type == "table":
        rows = (await db.execute(
            text("""
                SELECT t.table_id, t.table_name, t.table_type, s.schema_name, d.database_name, p.platform_code
                FROM metadata_tables t
                JOIN metadata_schemas s ON s.schema_id = t.schema_id
                JOIN metadata_databases d ON d.database_id = s.database_id
                JOIN metadata_platforms p ON p.platform_id = d.platform_id
                WHERE LOWER(t.table_name) LIKE LOWER(:q) LIMIT 20
            """),
            {"q": f"%{q}%"}
        )).mappings().all()
        results["tables"] = [dict(r) for r in rows]

    if not type or type == "column":
        rows = (await db.execute(
            text("""
                SELECT c.column_id, c.column_name, c.data_type, c.normalized_type,
                       t.table_name, s.schema_name, d.database_name, p.platform_code
                FROM metadata_columns c
                JOIN metadata_tables t ON t.table_id = c.table_id
                JOIN metadata_schemas s ON s.schema_id = t.schema_id
                JOIN metadata_databases d ON d.database_id = s.database_id
                JOIN metadata_platforms p ON p.platform_id = d.platform_id
                WHERE LOWER(c.column_name) LIKE LOWER(:q) LIMIT 20
            """),
            {"q": f"%{q}%"}
        )).mappings().all()
        results["columns"] = [dict(r) for r in rows]

    return results

@router.get("/tags")
async def list_tags(platform_id: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    query = "SELECT * FROM metadata_tags"
    params = {}
    if platform_id:
        query += " WHERE platform_id = :p"
        params["p"] = platform_id
    rows = (await db.execute(text(query), params)).mappings().all()
    return [dict(r) for r in rows]

@router.get("/domains")
async def list_domains(db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        text("SELECT dd.*, o.org_name FROM data_domains dd JOIN organizations o ON o.organization_id = dd.organization_id WHERE dd.is_active = TRUE ORDER BY dd.domain_name")
    )).mappings().all()
    return [dict(r) for r in rows]

@router.get("/products")
async def list_products(domain_id: Optional[int] = None, db: AsyncSession = Depends(get_db)):
    query = "SELECT dp.*, dd.domain_name FROM data_products dp JOIN data_domains dd ON dd.domain_id = dp.domain_id WHERE dp.is_active = TRUE"
    params = {}
    if domain_id:
        query += " AND dp.domain_id = :d"
        params["d"] = domain_id
    rows = (await db.execute(text(query), params)).mappings().all()
    return [dict(r) for r in rows]


@router.get("/attributes")
async def list_attributes(db: AsyncSession = Depends(get_db)):
    """Return distinct column names, user attributes, and tags for autocomplete."""
    cols = (await db.execute(text("SELECT DISTINCT LOWER(column_name) FROM metadata_columns"))).scalars().all()
    u_attrs = (await db.execute(text("SELECT DISTINCT LOWER(attribute_key) FROM user_attributes"))).scalars().all()
    tags = (await db.execute(text("SELECT DISTINCT LOWER(tag_name) FROM metadata_tags"))).scalars().all()

    defaults = ["department", "clearance_level", "cost_center", "office_location", "job_title", "region", "region_code"]
    combined = sorted(list(set(cols + u_attrs + tags + defaults)))
    return combined

