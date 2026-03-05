"""
routers/permit/s1.py — S1 Permit Receiver endpoints.

GET  /api/v1/permits/s1/work-order-sites
GET  /api/v1/permits/s1/work-orders
GET  /api/v1/permits/s1/open-work-orders    — OPEN work orders for PTW dropdown
GET  /api/v1/permits/s1/server-time         — current IST timestamp + validity date
POST /api/v1/permits/s1/ptw
PUT  /api/v1/permits/s1/ptw/{ptw_id}        — edit (overwrite) a PTW
GET  /api/v1/permits/s1/ptw
POST /api/v1/permits/s1/ptw/{ptw_id}/close
GET  /api/v1/permits/s1/ptw/{ptw_id}/pdf
"""
from __future__ import annotations
import json
from datetime import date
from typing import List, Optional
from fastapi import APIRouter, Depends, File, Form, HTTPException, Path, Query, Response, UploadFile
from pydantic import BaseModel
from app.models.auth import UserInfo
from app.models.permit import PTWRequestCreate, PTWCreateResponse, PTWCloseRequest
from app.services.permit import s1_service as svc
from app.utils.security import require_role

router = APIRouter()
_s1_dep = require_role("s1")


# ── New v2 request body ──────────────────────────────────────────────────────

class PTWCreateV2(BaseModel):
    permit_no: str
    site_name: str
    work_order_ids: List[str]
    description_of_work: str
    contractor_name: str
    work_location: str
    validity_date: str
    extra_form_data: Optional[dict] = None


class PTWEditV2(BaseModel):
    permit_no: str
    work_order_ids: List[str]
    description_of_work: str
    contractor_name: str
    work_location: str
    validity_date: str
    extra_form_data: Optional[dict] = None


@router.get("/work-order-sites")
async def s1_work_order_sites(_user: UserInfo = Depends(_s1_dep)) -> list[str]:
    """Return distinct site names from work_orders for the filter dropdown."""
    return svc.list_sites_from_work_orders()


@router.get("/open-work-orders")
async def s1_open_work_orders(
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    site_name: Optional[str] = Query(default=None),
    _user: UserInfo = Depends(_s1_dep),
) -> list[dict]:
    """
    Return OPEN work orders (date_s1_created IS NULL) filtered by date_planned.
    Used to populate the multi-select dropdown in Request PTW.
    """
    return svc.fetch_open_work_orders_for_ptw(
        start_date=start_date.isoformat() if start_date else None,
        end_date=end_date.isoformat() if end_date else None,
        site_name=site_name,
    )


@router.get("/server-time")
async def s1_server_time(_user: UserInfo = Depends(_s1_dep)) -> dict:
    """Return current IST timestamp and validity date (now + 8 h)."""
    return {
        "now_ist": svc.get_server_time_ist(),
        "validity_date": svc.get_validity_date_ist(),
    }


@router.get("/work-orders")
async def s1_work_orders(
    site_name: Optional[str] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    _user: UserInfo = Depends(_s1_dep),
) -> dict:
    """
    Returns { kpis: {...}, data: [...] } filtered by site_name + date_planned range.
    Status is derived server-side with Closed/Expired 8-hour logic.
    """
    return svc.fetch_work_orders_full(
        site_name=site_name if site_name else None,
        start_date=start_date.isoformat() if start_date else None,
        end_date=end_date.isoformat() if end_date else None,
    )


@router.post("/ptw", response_model=PTWCreateResponse, status_code=201)
async def s1_create_ptw(body: PTWRequestCreate, user: UserInfo = Depends(_s1_dep)) -> PTWCreateResponse:
    ptw_id = svc.insert_ptw_request(
        permit_no=body.permit_no,
        site_name=body.site_name,
        created_by=user.username,
        form_data=body.form_data,
    )
    return PTWCreateResponse(ptw_id=ptw_id)


@router.post("/ptw/v2", status_code=201)
async def s1_create_ptw_v2(body: PTWCreateV2, user: UserInfo = Depends(_s1_dep)) -> dict:
    """Create PTW with auto work-order stamping (new flow)."""
    try:
        return svc.insert_ptw_request_v2(
            permit_no=body.permit_no,
            site_name=body.site_name,
            work_order_ids=body.work_order_ids,
            created_by=user.username,
            description_of_work=body.description_of_work,
            contractor_name=body.contractor_name,
            work_location=body.work_location,
            validity_date=body.validity_date,
            extra_form_data=body.extra_form_data,
        )
    except RuntimeError as e:
        raise HTTPException(400, str(e))


@router.put("/ptw/{ptw_id}")
async def s1_edit_ptw_v2(
    body: PTWEditV2,
    ptw_id: str = Path(...),
    _user: UserInfo = Depends(_s1_dep),
) -> dict:
    """Edit an existing PTW (only if not yet forwarded to S2)."""
    try:
        return svc.update_ptw_request_v2(
            ptw_id=ptw_id,
            permit_no=body.permit_no,
            work_order_ids=body.work_order_ids,
            description_of_work=body.description_of_work,
            contractor_name=body.contractor_name,
            work_location=body.work_location,
            validity_date=body.validity_date,
            extra_form_data=body.extra_form_data,
        )
    except RuntimeError as e:
        raise HTTPException(400, str(e))


@router.get("/ptw")
async def s1_list_ptw(
    site_name: Optional[str] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    user: UserInfo = Depends(_s1_dep),
) -> list[dict]:
    return svc.fetch_ptw_requests(
        site_name=site_name or None,
        start_date=start_date.isoformat() if start_date else None,
        end_date=end_date.isoformat() if end_date else None,
    )


@router.delete("/ptw/{ptw_id}", status_code=200)
async def s1_delete_ptw(
    ptw_id: str = Path(...),
    user: UserInfo = Depends(_s1_dep),
) -> dict:
    """
    Delete a PTW request when it is still PENDING_S2 (before S2 acts).
    Resets date_s1_created on linked work orders so they return to OPEN.
    """
    svc.delete_ptw_request(ptw_id=ptw_id)
    return {"ptw_id": ptw_id, "deleted": True}


@router.post("/ptw/{ptw_id}/close")
async def s1_close_ptw(
    body: PTWCloseRequest,
    ptw_id: str = Path(...),
    permit_no: str = Query(...),
    user: UserInfo = Depends(_s1_dep),
) -> dict:
    svc.close_ptw(
        ptw_id=ptw_id,
        permit_no=permit_no,
        form_data={},
        closure_notes=body.closure_notes,
    )
    return {"ptw_id": ptw_id, "status": "CLOSED"}


@router.post("/ptw/{ptw_id}/close-with-evidence")
async def s1_close_with_evidence(
    ptw_id: str = Path(...),
    work_order_ids: str = Form(...),          # JSON-encoded list of WO IDs
    closure_notes: str = Form(default=""),
    closure_details: str = Form(default="{}"), # JSON-encoded closure details
    user: UserInfo = Depends(_s1_dep),
    files: List[UploadFile] = File(default=[]),
) -> dict:
    """Close a PTW with closure undertaking + evidence photo upload."""
    from app.database import get_supabase_client

    wo_ids: list[str] = json.loads(work_order_ids)
    details: dict = json.loads(closure_details) if closure_details else {}
    sb = get_supabase_client(prefer_service_role=True)

    uploaded_paths: list[str] = []
    for f in files:
        content = await f.read()
        primary_wo = wo_ids[0] if wo_ids else ptw_id
        storage_path = f"{primary_wo}/closure/{f.filename}"
        try:
            sb.storage.from_("ptw-evidence").upload(
                storage_path, content, {"content-type": f.content_type or "application/octet-stream"}
            )
        except Exception:
            # If file already exists, upsert via remove + re-upload
            try:
                sb.storage.from_("ptw-evidence").remove([storage_path])
                sb.storage.from_("ptw-evidence").upload(
                    storage_path, content, {"content-type": f.content_type or "application/octet-stream"}
                )
            except Exception:
                pass
        uploaded_paths.append(storage_path)

    svc.close_ptw_with_evidence(
        ptw_id=ptw_id,
        work_order_ids=wo_ids,
        closure_notes=closure_notes or None,
        evidence_paths=uploaded_paths if uploaded_paths else None,
        closure_details=details if details else None,
    )
    return {"ptw_id": ptw_id, "status": "CLOSED", "evidence_files": len(uploaded_paths)}


@router.get("/ptw/{ptw_id}/evidence-count")
async def s1_ptw_evidence_count(
    ptw_id: str = Path(...),
    _user: UserInfo = Depends(_s1_dep),
) -> dict:
    """Return the count of evidence photos (all sources) for a closed PTW."""
    paths = svc.fetch_ptw_evidence_paths(ptw_id=ptw_id)
    return {"ptw_id": ptw_id, "count": len(paths), "paths": paths}


@router.get("/ptw/{ptw_id}/evidence-list")
async def s1_ptw_evidence_list(
    ptw_id: str = Path(...),
    _user: UserInfo = Depends(_s1_dep),
) -> list[dict]:
    """Return evidence photos as pre-signed Supabase URLs (no auth header needed for <img src>)."""
    return svc.fetch_ptw_evidence_signed(ptw_id=ptw_id)


@router.get("/ptw/{ptw_id}/evidence/{file_index}")
async def s1_ptw_evidence_file(
    ptw_id: str = Path(...),
    file_index: int = Path(..., ge=0),
    _user: UserInfo = Depends(_s1_dep),
) -> Response:
    """Proxy-stream a single evidence photo from Supabase storage to the browser."""
    import mimetypes
    paths = svc.fetch_ptw_evidence_paths(ptw_id=ptw_id)
    if file_index >= len(paths):
        raise HTTPException(404, "Evidence file not found")

    data = svc.download_ptw_evidence_file(ptw_id=ptw_id, file_index=file_index)
    if data is None:
        raise HTTPException(404, "Evidence file could not be downloaded")

    path = paths[file_index]
    content_type = mimetypes.guess_type(path)[0] or "application/octet-stream"
    return Response(
        content=data,
        media_type=content_type,
        headers={"Cache-Control": "private, max-age=3600"},
    )


@router.get("/ptw/{ptw_id}/pdf")
async def s1_download_pdf(ptw_id: str = Path(...), user: UserInfo = Depends(_s1_dep)) -> Response:
    """Generate and return PTW PDF bytes."""
    from app.database import get_supabase_client
    from app.services.permit.pdf_pipeline import generate_ptw_pdf_with_attachments
    from app.services.permit.approval_utils import add_floating_approval_stamp, get_ptw_approval_times

    sb = get_supabase_client(prefer_service_role=True)
    resp = (
        sb.table("ptw_requests")
        .select("ptw_id,permit_no,site_name,form_data")
        .eq("ptw_id", ptw_id)
        .limit(1)
        .execute()
    )
    rows = getattr(resp, "data", None) or []
    if not rows:
        raise HTTPException(404, f"PTW {ptw_id!r} not found")

    row = rows[0]
    permit_no = str(row.get("permit_no") or "").strip()
    site_name  = str(row.get("site_name")  or "").strip()

    # Merge DB-level fields into form_data so the PDF overlay picks them up
    form_data: dict = dict(row.get("form_data") or {})
    form_data.setdefault("permit_no", permit_no)
    form_data.setdefault("site_name", site_name)

    # Normalise validity_date → permit_validity_date (key used by PDF overlay)
    if "validity_date" in form_data and "permit_validity_date" not in form_data:
        form_data["permit_validity_date"] = form_data["validity_date"]

    # Auto-derive start_time from date_s1_created if not already present
    date_s1 = form_data.get("date_s1_created") or ""
    if date_s1 and not form_data.get("start_time"):
        form_data["start_time"] = date_s1[11:16] if len(date_s1) >= 16 else date_s1

    # Auto-derive end_time from date_s1_closed if available
    date_closed = form_data.get("date_s1_closed") or ""
    if date_closed and not form_data.get("end_time"):
        form_data["end_time"] = date_closed[11:16] if len(date_closed) >= 16 else date_closed

    # Ensure receiver_datetime is populated
    if date_s1 and not form_data.get("receiver_datetime"):
        form_data["receiver_datetime"] = date_s1

    # Determine which work order ID to use for evidence / approval lookup.
    # Prefer the first linked work order; fall back to permit_no.
    linked_ids: list = form_data.get("work_order_ids") or []
    evidence_id = linked_ids[0] if linked_ids else permit_no

    pdf = generate_ptw_pdf_with_attachments(form_data=form_data, work_order_id=evidence_id)

    # Stamp approval if the PTW has been approved
    times = get_ptw_approval_times(evidence_id)
    if times.get("date_s3_approved_raw"):
        pdf = add_floating_approval_stamp(pdf, approved_on=times.get("issuer_datetime", ""))

    safe_name = permit_no.replace("/", "-").replace(" ", "_") or ptw_id
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="PTW_{safe_name}.pdf"'},
    )
