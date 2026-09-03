"""Data Entitlement & Subscription Requests Router."""

import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from db.session import get_db

router = APIRouter()


class RequestCreate(BaseModel):
    user_id: int = 1
    table_id: Optional[int] = None
    product_id: Optional[int] = None
    purpose_id: Optional[int] = None
    reason: str
    duration_days: int = 30


@router.get("")
async def list_requests(status: Optional[str] = Query(None), db: AsyncSession = Depends(get_db)):
    query = """
        SELECT
            r.request_id,
            r.request_number,
            r.requestor_id AS user_id,
            u.username,
            u.email,
            r.product_id,
            p.product_name,
            pr.purpose_name,
            pr.purpose_code,
            r.justification AS reason,
            r.status,
            r.reviewed_by_id AS approved_by,
            r.created_at,
            (r.created_at + (r.valid_for_days || ' days')::INTERVAL) AS expires_at
        FROM data_access_requests r
        JOIN users u ON r.requestor_id = u.user_id
        LEFT JOIN data_products p ON r.product_id = p.product_id
        LEFT JOIN purposes pr ON r.purpose_id = pr.purpose_id
    """
    params = {}
    if status and status.upper() != "ALL":
        query += " WHERE r.status = :s"
        params["s"] = status.upper()
    query += " ORDER BY r.created_at DESC"

    rows = (await db.execute(text(query), params)).mappings().all()
    return [dict(r) for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_request(body: RequestCreate, db: AsyncSession = Depends(get_db)):
    req_num = f"REQ-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:4].upper()}"
    res = await db.execute(
        text("""
            INSERT INTO data_access_requests (request_number, requestor_id, product_id, purpose_id, justification, valid_for_days, status)
            VALUES (:num, :u, :p, :purp, :r, :days, 'PENDING')
            RETURNING request_id, request_number, status, created_at
        """),
        {
            "num": req_num,
            "u": body.user_id,
            "p": body.product_id,
            "purp": body.purpose_id,
            "r": body.reason,
            "days": max(1, body.duration_days),
        },
    )
    row = res.mappings().first()
    await db.commit()
    return dict(row)


@router.post("/{request_id}/approve")
async def approve_request(request_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(
        text(
            "UPDATE data_access_requests SET status = 'APPROVED', reviewed_by_id = 1, reviewed_at = NOW(), updated_at = NOW() WHERE request_id = :id"
        ),
        {"id": request_id},
    )
    await db.commit()
    return {"status": "APPROVED", "request_id": request_id}


@router.post("/{request_id}/reject")
async def reject_request(request_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(
        text(
            "UPDATE data_access_requests SET status = 'REJECTED', reviewed_by_id = 1, reviewed_at = NOW(), updated_at = NOW() WHERE request_id = :id"
        ),
        {"id": request_id},
    )
    await db.commit()
    return {"status": "REJECTED", "request_id": request_id}


@router.delete("/{request_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_request(request_id: int, db: AsyncSession = Depends(get_db)):
    await db.execute(
        text("DELETE FROM data_access_requests WHERE request_id = :id"), {"id": request_id}
    )
    await db.commit()
