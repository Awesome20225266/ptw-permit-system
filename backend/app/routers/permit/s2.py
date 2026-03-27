"""
routers/permit/s2.py — S2 Permit Forwarding endpoints (v2).

GET   /api/v1/permits/s2/work-order-sites
GET   /api/v1/permits/s2/work-orders
GET   /api/v1/permits/s2/users
GET   /api/v1/permits/s2/ptw
POST  /api/v1/permits/s2/ptw/{ptw_id}/upload-evidence
POST  /api/v1/permits/s2/ptw/{ptw_id}/forward
POST  /api/v1/permits/s2/ptw/{ptw_id}/revoke
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Path, Query, Request
from pydantic import BaseModel

from app.models.auth import UserInfo
from app.services.permit import s2_service as svc
from app.services.permit.s1_service import list_sites_from_work_orders
import app.services.permit.s1_service as s1_svc
from app.utils.security import require_role

router = APIRouter()
_s2_dep = require_role("s2")


# ─────────────────────────────────────────────────────────────────────────────
# Sites + users
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/work-order-sites")
async def s2_work_order_sites(_user: UserInfo = Depends(_s2_dep)) -> list[str]:
    """Distinct site names from work_orders for the universal filter dropdown."""
    return list_sites_from_work_orders()


@router.get("/users")
async def s2_users(_user: UserInfo = Depends(_s2_dep)) -> list[str]:
    """Usernames for the Permit Holder dropdown in the Process form."""
    return svc.list_s2_users()


# ─────────────────────────────────────────────────────────────────────────────
# Work orders + KPIs
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/work-orders")
async def s2_work_orders(
    site_name: Optional[str] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    _user: UserInfo = Depends(_s2_dep),
) -> dict:
    """Returns { kpis: {...}, data: [...] } using the S1 status engine."""
    return svc.fetch_s2_work_orders_with_kpi(
        site_name=site_name or None,
        start_date=start_date.isoformat() if start_date else None,
        end_date=end_date.isoformat() if end_date else None,
    )


# ─────────────────────────────────────────────────────────────────────────────
# PTW list
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/ptw")
async def s2_list_ptw(
    site_name: Optional[str] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    _user: UserInfo = Depends(_s2_dep),
) -> list[dict]:
    """
    PTWs visible to S2 (only those with date_s1_created IS NOT NULL).
    Filtered by site_name and date_planned range.
    """
    return svc.fetch_ptw_for_s2(
        site_name=site_name or None,
        start_date=start_date.isoformat() if start_date else None,
        end_date=end_date.isoformat() if end_date else None,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Evidence upload
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/ptw/{ptw_id}/upload-evidence")
async def s2_upload_evidence(
    ptw_id: str = Path(...),
    work_order_id: str = Query(...),
    folder: str = Query(...),          # "isolation" | "tbt"
    file_name: str = Query(default="photo.jpg"),
    request: Request = None,
    _user: UserInfo = Depends(_s2_dep),
) -> dict:
    """
    Upload an evidence photo (isolation or TBT) to Supabase Storage.
    Accepts raw binary body (image/jpeg) with work_order_id, folder as query params.
    Photos are appended — existing evidence is never overwritten.
    """
    if folder not in ("isolation", "tbt"):
        raise HTTPException(400, "folder must be 'isolation' or 'tbt'")

    content = await request.body()
    if not content:
        raise HTTPException(400, "Uploaded file body is empty")

    try:
        path = svc.upload_evidence(
            work_order_id=work_order_id,
            folder=folder,
            file_bytes=content,
            filename=file_name,
            content_type="image/jpeg",
        )
    except Exception as exc:
        import traceback, sys
        traceback.print_exc(file=sys.stderr)
        raise HTTPException(500, detail=f"Evidence upload failed: {exc}") from exc

    return {"ptw_id": ptw_id, "storage_path": path, "status": "uploaded"}


# ─────────────────────────────────────────────────────────────────────────────
# Evidence listing & streaming (for View modal)
# ─────────────────────────────────────────────────────────────────────────────

from fastapi import Response as FastAPIResponse  # noqa: E402 — local import to avoid circular


@router.get("/ptw/{ptw_id}/evidence")
async def s2_list_evidence(
    ptw_id: str = Path(...),
    _user: UserInfo = Depends(_s2_dep),
) -> list[dict]:
    """
    Return all S2 evidence files (isolation + TBT) for a PTW.
    Each item: { path, folder, wo_id }
    """
    return svc.fetch_s2_evidence(ptw_id)


@router.get("/ptw/{ptw_id}/evidence/{file_index}")
async def s2_stream_evidence(
    ptw_id: str = Path(...),
    file_index: int = Path(..., ge=0),
    _user: UserInfo = Depends(_s2_dep),
) -> FastAPIResponse:
    """Proxy-stream a single S2 evidence photo from Supabase storage."""
    import mimetypes
    items = svc.fetch_s2_evidence(ptw_id)
    if file_index >= len(items):
        raise HTTPException(404, "Evidence file not found")

    data = svc.download_s2_evidence_file(ptw_id, file_index)
    if data is None:
        raise HTTPException(404, "Could not download evidence file")

    path = items[file_index]["path"]
    content_type = mimetypes.guess_type(path)[0] or "image/jpeg"
    return FastAPIResponse(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )


# ─────────────────────────────────────────────────────────────────────────────
# Forward PTW to S3
# ─────────────────────────────────────────────────────────────────────────────

class S2ForwardBody(BaseModel):
    work_order_ids: list[str]
    permit_holder: str
    isolation_requirement: str = "NO"
    form_data_updates: dict = {}


@router.post("/ptw/{ptw_id}/forward")
async def s2_forward_ptw(
    body: S2ForwardBody,
    ptw_id: str = Path(...),
    _user: UserInfo = Depends(_s2_dep),
) -> dict:
    """
    Forward PTW to S3: stamps date_s2_forwarded on linked work_orders and
    persists permit_holder + S2 form data to ptw_requests.
    """
    if not body.permit_holder.strip():
        raise HTTPException(400, "permit_holder is required")
    if not body.work_order_ids:
        raise HTTPException(400, "work_order_ids must not be empty")

    svc.forward_ptw(
        ptw_id=ptw_id,
        work_order_ids=body.work_order_ids,
        permit_holder=body.permit_holder.strip(),
        isolation_requirement=body.isolation_requirement,
        s2_form_updates=body.form_data_updates or {},
    )
    return {"ptw_id": ptw_id, "status": "PENDING_S3"}


# ─────────────────────────────────────────────────────────────────────────────
# Revoke S2 submission
# ─────────────────────────────────────────────────────────────────────────────

class S2RevokeBody(BaseModel):
    work_order_ids: list[str]


@router.post("/ptw/{ptw_id}/revoke")
async def s2_revoke_ptw(
    body: S2RevokeBody,
    ptw_id: str = Path(...),
    _user: UserInfo = Depends(_s2_dep),
) -> dict:
    """
    Revoke S2 forwarding (only allowed before S3 approval).
    Clears date_s2_forwarded on all linked work_orders.
    """
    if not body.work_order_ids:
        raise HTTPException(400, "work_order_ids must not be empty")

    svc.revoke_s2_submission(ptw_id=ptw_id, work_order_ids=body.work_order_ids)
    return {"ptw_id": ptw_id, "status": "PENDING_S2"}


# ─────────────────────────────────────────────────────────────────────────────
# Work Order Create / Edit (S2 portal)
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
async def s2_create_work_order(
    body: WorkOrderCreateBody,
    _user: UserInfo = Depends(_s2_dep),
) -> dict:
    """Create a new work order (ID auto-assigned by DB trigger)."""
    try:
        return s1_svc.create_work_order(**body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.put("/work-orders/{work_order_id}")
async def s2_update_work_order(
    work_order_id: str = Path(...),
    body: WorkOrderUpdateBody = ...,
    _user: UserInfo = Depends(_s2_dep),
) -> dict:
    """Edit an existing work order (only when PTW not yet started)."""
    try:
        return s1_svc.update_work_order(work_order_id=work_order_id, **body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
