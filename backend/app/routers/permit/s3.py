"""
routers/permit/s3.py — S3 Permit Approval endpoints (v2).

GET  /api/v1/permits/s3/work-order-sites
GET  /api/v1/permits/s3/work-orders
GET  /api/v1/permits/s3/users
GET  /api/v1/permits/s3/ptw
POST /api/v1/permits/s3/ptw/{ptw_id}/approve
POST /api/v1/permits/s3/ptw/{work_order_id}/approve-legacy
POST /api/v1/permits/s3/ptw/{work_order_id}/reject
POST /api/v1/permits/s3/ptw/{work_order_id}/revoke
GET  /api/v1/permits/s3/ptw/{work_order_id}/pdf
"""
from __future__ import annotations
from typing import Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response
from pydantic import BaseModel
from app.models.auth import UserInfo
from app.models.permit import (
    PTWApproveRequest, PTWApproveResponse,
    PTWRejectRequest, PTWRejectResponse,
)
from app.services.permit import s3_service as svc
from app.services.permit.s1_service import list_sites_from_work_orders
import app.services.permit.s1_service as s1_svc
from app.utils.security import require_role

router = APIRouter()
_s3_dep = require_role("s3")


# ─────────────────────────────────────────────────────────────────────────────
# Sites + users
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/work-order-sites")
async def s3_work_order_sites(_user: UserInfo = Depends(_s3_dep)) -> list[str]:
    return list_sites_from_work_orders()


@router.get("/users")
async def s3_users(_user: UserInfo = Depends(_s3_dep)) -> list[str]:
    return svc.list_s3_users()


# ─────────────────────────────────────────────────────────────────────────────
# Work orders + KPI
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/work-orders")
async def s3_work_orders(
    site_name: Optional[str] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    _user: UserInfo = Depends(_s3_dep),
) -> dict:
    return svc.fetch_s3_work_orders_with_kpi(
        site_name=site_name,
        start_date=start_date.isoformat() if start_date else None,
        end_date=end_date.isoformat() if end_date else None,
    )


# ─────────────────────────────────────────────────────────────────────────────
# PTW list (filtered, for S3 table)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/ptw")
async def s3_list_ptw(
    site_name: Optional[str] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    user: UserInfo = Depends(_s3_dep),
) -> list[dict]:
    return svc.fetch_ptw_for_s3(
        site_name=site_name,
        start_date=start_date.isoformat() if start_date else None,
        end_date=end_date.isoformat() if end_date else None,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Approve by ptw_id (new, direct lookup)
# ─────────────────────────────────────────────────────────────────────────────

class S3ApproveBody(BaseModel):
    issuer_name: str
    remark: str = "Approved"


@router.post("/ptw/{ptw_id}/approve")
async def s3_approve_by_ptw_id(
    body: S3ApproveBody,
    ptw_id: str = Path(...),
    user: UserInfo = Depends(_s3_dep),
) -> dict:
    issuer = body.issuer_name.strip() or user.username
    ok, msg = svc.approve_ptw_by_id(ptw_id=ptw_id, issuer_name=issuer, remark=body.remark)
    if not ok:
        raise HTTPException(409, msg)
    return {"ptw_id": ptw_id, "status": "APPROVED", "timestamp": msg}


@router.post("/ptw/{work_order_id}/approve-legacy", response_model=PTWApproveResponse)
async def s3_approve_ptw(
    body: PTWApproveRequest,
    work_order_id: str = Path(...),
    user: UserInfo = Depends(_s3_dep),
) -> PTWApproveResponse:
    issuer = body.issuer_name or user.username
    ok, msg = svc.approve_ptw(work_order_id=work_order_id, issuer_name=issuer)
    if not ok:
        raise HTTPException(409, msg)
    return PTWApproveResponse(ptw_id=work_order_id, status="APPROVED")


@router.post("/ptw/{work_order_id}/reject")
async def s3_reject_ptw(
    body: PTWRejectRequest,
    work_order_id: str = Path(...),
    user: UserInfo = Depends(_s3_dep),
) -> dict:
    ok, msg = svc.reject_ptw(work_order_id=work_order_id, stage="s3", reason=body.reason)
    if not ok:
        raise HTTPException(409, msg)
    return {"work_order_id": work_order_id, "status": "REJECTED", "timestamp": msg}


@router.post("/ptw/{work_order_id}/revoke")
async def s3_revoke_approval(
    work_order_id: str = Path(...),
    user: UserInfo = Depends(_s3_dep),
) -> dict:
    ok, msg = svc.revoke_s3_approval(work_order_id=work_order_id)
    if not ok:
        raise HTTPException(409, msg)
    return {"work_order_id": work_order_id, "status": "OPEN"}


@router.get("/ptw/{work_order_id}/pdf")
async def s3_download_approved_pdf(
    work_order_id: str = Path(...),
    user: UserInfo = Depends(_s3_dep),
) -> Response:
    """Generate approved PDF with stamp."""
    from app.database import get_supabase_client
    from app.services.permit.pdf_pipeline import generate_ptw_pdf_with_attachments
    from app.services.permit.approval_utils import (
        add_floating_approval_stamp,
        get_ptw_approval_times,
        inject_approval_times_into_form_data,
    )

    sb = get_supabase_client(prefer_service_role=True)
    resp = (
        sb.table("ptw_requests")
        .select("ptw_id,permit_no,form_data")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    rows = getattr(resp, "data", None) or []
    chosen = None
    for r in rows:
        if not isinstance(r, dict):
            continue
        if str(r.get("permit_no") or "").strip() == work_order_id:
            chosen = r
            break
        fd = r.get("form_data") or {}
        if isinstance(fd, dict):
            ids = fd.get("work_order_ids") or []
            if work_order_id in [str(x).strip() for x in ids]:
                chosen = r
                break

    if not chosen:
        raise HTTPException(404, f"No PTW found for work_order_id={work_order_id!r}")

    form_data = inject_approval_times_into_form_data(
        chosen.get("form_data") or {}, work_order_id, is_approved=True
    )
    pdf = generate_ptw_pdf_with_attachments(form_data=form_data, work_order_id=work_order_id)
    times = get_ptw_approval_times(work_order_id)
    pdf = add_floating_approval_stamp(pdf, approved_on=times.get("issuer_datetime", ""))

    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{work_order_id}_approved.pdf"'},
    )


# ─────────────────────────────────────────────────────────────────────────────
# Work Order Create + Edit (S3 portal)
# ─────────────────────────────────────────────────────────────────────────────

class WorkOrderCreateBody(BaseModel):
    site_name: str
    location: str
    equipment: str
    frequency: str
    isolation_requirement: str
    date_planned: str


class WorkOrderUpdateBody(BaseModel):
    site_name: str
    location: str
    equipment: str
    frequency: str
    isolation_requirement: str
    date_planned: str
    remark: str


@router.post("/work-orders/create")
async def s3_create_work_order(
    body: WorkOrderCreateBody,
    _user: UserInfo = Depends(_s3_dep),
) -> dict:
    """Create a new work order (ID auto-assigned by DB trigger)."""
    try:
        return s1_svc.create_work_order(**body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/work-orders/{work_order_id}")
async def s3_update_work_order(
    work_order_id: str = Path(...),
    body: WorkOrderUpdateBody = ...,
    _user: UserInfo = Depends(_s3_dep),
) -> dict:
    """Update a work order — only allowed when date_s1_created IS NULL."""
    try:
        return s1_svc.update_work_order(work_order_id=work_order_id, **body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
