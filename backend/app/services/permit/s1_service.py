"""
services/permit/s1_service.py — S1 Portal business logic.

Ported from S1.py — Supabase queries and lifecycle updates only.
PDF generation is delegated to pdf_pipeline and s1_generate.
Streamlit UI code is NOT ported.
"""
from __future__ import annotations

from datetime import datetime
from typing import Any, Optional
from zoneinfo import ZoneInfo

import pandas as pd

from app.database import get_supabase_client
from app.services.permit.lifecycle_utils import (
    _get_all_work_order_ids_for_ptw,
    _update_all_work_orders_lifecycle,
)

TABLE_WORK_ORDERS = "work_orders"
TABLE_PTW_REQUESTS = "ptw_requests"
TABLE_PTW_TEMPLATES = "ptw_templates"

_8_HOURS_SECONDS = 8 * 3600


# ---------------------------------------------------------------------------
# Status derivation
# ---------------------------------------------------------------------------

def _has_value(val: object) -> bool:
    if val is None:
        return False
    if isinstance(val, float) and pd.isna(val):
        return False
    if isinstance(val, str) and val.strip() == "":
        return False
    return True


def _parse_ts(val: object) -> Optional[datetime]:
    """Parse ISO/Supabase timestamp string to datetime, returns None on failure."""
    if not _has_value(val):
        return None
    try:
        s = str(val).strip().replace("T", " ").split("+")[0].split("Z")[0]
        return datetime.fromisoformat(s)
    except Exception:
        return None


def derive_ptw_status(row: dict) -> str:
    """
    Legacy status for PTW requests (WIP / OPEN / APPROVED / CLOSED / REJECTED).
    Used by fetch_ptw_requests and backward-compat callers.
    """
    s1_created   = row.get("date_s1_created")
    s2_forwarded = row.get("date_s2_forwarded")
    s3_approved  = row.get("date_s3_approved")
    s2_rejected  = row.get("date_s2_rejected")
    s3_rejected  = row.get("date_s3_rejected")
    s1_closed    = row.get("date_s1_closed")

    if _has_value(s2_rejected) or _has_value(s3_rejected):
        return "REJECTED"
    if _has_value(s1_closed):
        return "CLOSED"
    if _has_value(s3_approved):
        return "APPROVED"
    if _has_value(s1_created):
        return "WIP"
    return "OPEN"


def derive_work_order_status(row: dict) -> str:
    """
    Extended 6-state status for work_orders table.

    OPEN           — date_s1_created IS NULL
    PENDING_S2     — s1 set, s2 null
    PENDING_S3     — s1+s2 set, s3 null
    APPROVED       — s3 set, closed null, elapsed ≤ 8 h
    PERMIT_EXPIRED — s3 set, closed null, elapsed > 8 h
    CLOSED         — s1_closed set (regardless of elapsed; permit was formally closed)
    """
    s1_created   = row.get("date_s1_created")
    s2_forwarded = row.get("date_s2_forwarded")
    s3_approved  = row.get("date_s3_approved")
    s1_closed    = row.get("date_s1_closed")

    if not _has_value(s1_created):
        return "OPEN"
    if not _has_value(s2_forwarded):
        return "PENDING_S2"
    if not _has_value(s3_approved):
        return "PENDING_S3"
    # date_s3_approved is set
    if _has_value(s1_closed):
        return "CLOSED"
    # Approved but not yet closed — check 8-hour expiry window
    ts_approved = _parse_ts(s3_approved)
    if ts_approved:
        now_utc = datetime.now(ZoneInfo("UTC"))
        if ts_approved.tzinfo is None:
            ts_approved = ts_approved.replace(tzinfo=ZoneInfo("Asia/Kolkata"))
        elapsed = (now_utc - ts_approved).total_seconds()
        if elapsed > _8_HOURS_SECONDS:
            return "PERMIT_EXPIRED"
    return "APPROVED"


# ---------------------------------------------------------------------------
# Work order queries
# ---------------------------------------------------------------------------

def get_server_time_ist() -> str:
    """Return current IST timestamp as 'YYYY-MM-DD HH:MM:SS'."""
    return datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y-%m-%d %H:%M:%S")


def get_validity_date_ist() -> str:
    """Return date of (now + 8 hours) in IST as 'YYYY-MM-DD'."""
    from datetime import timedelta
    return (datetime.now(ZoneInfo("Asia/Kolkata")) + timedelta(hours=8)).strftime("%Y-%m-%d")


def fetch_open_work_orders_for_ptw(
    *,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    site_name: Optional[str] = None,
) -> list[dict]:
    """
    Fetch OPEN work orders (date_s1_created IS NULL) filtered by date_planned range.
    Returns work_order_id, site_name, location, equipment, frequency, date_planned.
    """
    sb = get_supabase_client(prefer_service_role=True)
    cols = "work_order_id,site_name,location,equipment,frequency,date_planned"
    q = (
        sb.table(TABLE_WORK_ORDERS)
        .select(cols)
        .is_("date_s1_created", "null")
    )
    if site_name:
        q = q.eq("site_name", site_name)
    if start_date:
        q = q.gte("date_planned", start_date)
    if end_date:
        q = q.lte("date_planned", end_date + "T23:59:59")
    q = q.order("date_planned", desc=False)
    resp = q.execute()
    return getattr(resp, "data", None) or []


def insert_ptw_request_v2(
    *,
    permit_no: str,
    site_name: str,
    work_order_ids: list[str],
    created_by: str,
    description_of_work: str,
    contractor_name: str,
    work_location: str,
    validity_date: str,
    extra_form_data: Optional[dict] = None,
) -> dict:
    """
    Insert PTW request + stamp date_s1_created on all linked work orders.
    Returns { ptw_id, permit_no, site_name, work_location, work_order_ids, validity_date }.
    """
    sb = get_supabase_client(prefer_service_role=True)
    now_ist = get_server_time_ist()

    tpl = (
        sb.table(TABLE_PTW_TEMPLATES)
        .select("template_id")
        .eq("permit_type", "ELECTRICAL")
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    tpl_data = getattr(tpl, "data", None) or []
    if not tpl_data:
        raise RuntimeError("No active Electrical PTW template found in database")
    template_id = tpl_data[0]["template_id"]

    form_data: dict = dict(extra_form_data or {})
    form_data.update({
        "permit_no": permit_no,
        "site_name": site_name,
        "work_order_ids": work_order_ids,
        "work_location": work_location,
        "validity_date": validity_date,
        "permit_validity_date": validity_date,   # alias used by PDF overlay
        "description_of_work": description_of_work,
        "contractor_name": contractor_name,
        "date_s1_created": now_ist,
        # PDF overlay fields — receiver datetime = time of submission
        "receiver_datetime": now_ist,
        "start_time": now_ist,  # full IST datetime YYYY-MM-DD HH:MM:SS
    })

    resp = (
        sb.table(TABLE_PTW_REQUESTS)
        .insert({
            "template_id": template_id,
            "permit_type": "ELECTRICAL",
            "permit_no": permit_no,
            "site_name": site_name,
            "status": "SUBMITTED",
            "form_data": form_data,
            "created_by": created_by,
        })
        .execute()
    )
    err = getattr(resp, "error", None)
    if err:
        raise RuntimeError(err)
    data = getattr(resp, "data", None) or []
    if not data:
        raise RuntimeError("PTW insert returned no data")
    ptw_id: str = data[0]["ptw_id"]

    # Stamp date_s1_created on every linked work order
    if work_order_ids:
        sb.table(TABLE_WORK_ORDERS).update(
            {"date_s1_created": now_ist}
        ).in_("work_order_id", work_order_ids).execute()

    return {
        "ptw_id": ptw_id,
        "permit_no": permit_no,
        "site_name": site_name,
        "work_location": work_location,
        "work_order_ids": work_order_ids,
        "validity_date": validity_date,
        "created_by": created_by,
    }


def update_ptw_request_v2(
    *,
    ptw_id: str,
    permit_no: str,
    work_order_ids: list[str],
    description_of_work: str,
    contractor_name: str,
    work_location: str,
    validity_date: str,
    extra_form_data: Optional[dict] = None,
) -> dict:
    """
    Overwrite a PTW request's form_data and re-stamp date_s1_created.
    Raises RuntimeError if date_s2_forwarded is already set (cannot edit).
    """
    sb = get_supabase_client(prefer_service_role=True)

    # Guard: if any linked work order has been forwarded, block edit
    if work_order_ids:
        check = (
            sb.table(TABLE_WORK_ORDERS)
            .select("work_order_id,date_s2_forwarded")
            .in_("work_order_id", work_order_ids)
            .execute()
        )
        for row in (getattr(check, "data", None) or []):
            if _has_value(row.get("date_s2_forwarded")):
                raise RuntimeError(
                    "This PTW cannot be edited as it has already been processed by S2."
                )

    now_ist = get_server_time_ist()
    form_data: dict = dict(extra_form_data or {})

    # Fetch existing site_name so it stays in form_data after edit
    existing = (
        sb.table(TABLE_PTW_REQUESTS)
        .select("permit_no,site_name")
        .eq("ptw_id", ptw_id)
        .limit(1)
        .execute()
    )
    existing_row = ((getattr(existing, "data", None) or []) + [{}])[0]
    resolved_permit_no = permit_no or existing_row.get("permit_no", "")
    resolved_site = existing_row.get("site_name", "")

    form_data.update({
        "permit_no": resolved_permit_no,
        "site_name": resolved_site,
        "work_order_ids": work_order_ids,
        "work_location": work_location,
        "validity_date": validity_date,
        "permit_validity_date": validity_date,   # alias used by PDF overlay
        "description_of_work": description_of_work,
        "contractor_name": contractor_name,
        "date_s1_created": now_ist,
        "receiver_datetime": now_ist,
        "start_time": now_ist,  # full IST datetime YYYY-MM-DD HH:MM:SS
    })

    sb.table(TABLE_PTW_REQUESTS).update(
        {"form_data": form_data, "status": "SUBMITTED"}
    ).eq("ptw_id", ptw_id).execute()

    # Re-stamp date_s1_created on work orders
    if work_order_ids:
        sb.table(TABLE_WORK_ORDERS).update(
            {"date_s1_created": now_ist}
        ).in_("work_order_id", work_order_ids).execute()

    return {
        "ptw_id": ptw_id,
        "permit_no": permit_no,
        "work_order_ids": work_order_ids,
        "work_location": work_location,
        "validity_date": validity_date,
    }


def list_sites_from_work_orders() -> list[str]:
    sb = get_supabase_client(prefer_service_role=True)
    resp = sb.table(TABLE_WORK_ORDERS).select("site_name").execute()
    rows = getattr(resp, "data", None) or []
    seen: set[str] = set()
    out: list[str] = []
    for r in rows:
        sn = str(r.get("site_name") or "").strip()
        if sn and sn not in seen:
            out.append(sn)
            seen.add(sn)
    return sorted(out)


def fetch_work_orders_full(
    *,
    site_name: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict:
    """
    Fetch work_orders filtered by site_name + date_planned range.
    Derives status per row, computes KPI counts.
    Returns { kpis: {...}, data: [...] }
    """
    sb = get_supabase_client(prefer_service_role=True)
    cols = (
        "work_order_id,site_name,location,equipment,frequency,date_planned,"
        "isolation_requirement,"
        "date_s1_created,date_s2_forwarded,date_s3_approved,date_s1_closed,"
        "date_s2_rejected,date_s3_rejected"
    )
    q = sb.table(TABLE_WORK_ORDERS).select(cols)
    if site_name:
        q = q.eq("site_name", site_name)
    if start_date:
        q = q.gte("date_planned", start_date)
    if end_date:
        # Inclusive end: use lte on date_planned (date part only)
        q = q.lte("date_planned", end_date + "T23:59:59")
    q = q.order("date_planned", desc=False)

    resp = q.execute()
    rows = getattr(resp, "data", None) or []

    kpis = {
        "open": 0,
        "pending_s2": 0,
        "pending_s3": 0,
        "approved": 0,  # date_s3_approved IS NOT NULL (includes CLOSED + active APPROVED)
        "closed": 0,    # informational only — date_s1_closed IS NOT NULL
        "expired": 0,
        "total": 0,     # open + pending_s2 + pending_s3 + approved + expired
    }
    data: list[dict] = []

    for r in rows:
        status = derive_work_order_status(r)
        row_out = {
            "work_order_id":        r.get("work_order_id"),
            "site_name":            r.get("site_name"),
            "location":             r.get("location"),
            "equipment":            r.get("equipment"),
            "frequency":            r.get("frequency"),
            "date_planned":         r.get("date_planned"),
            "date_s1_created":      r.get("date_s1_created"),
            "isolation_requirement": r.get("isolation_requirement"),
            "status":               status,
        }
        data.append(row_out)

        # Approved KPI = any work order where date_s3_approved IS NOT NULL
        # (covers both APPROVED display status and CLOSED display status)
        has_s3 = _has_value(r.get("date_s3_approved"))

        if status == "OPEN":
            kpis["open"] += 1
        elif status == "PENDING_S2":
            kpis["pending_s2"] += 1
        elif status == "PENDING_S3":
            kpis["pending_s3"] += 1
        elif status == "APPROVED" or (status == "CLOSED" and has_s3):
            kpis["approved"] += 1
        elif status == "PERMIT_EXPIRED":
            kpis["expired"] += 1

        if status == "CLOSED":
            kpis["closed"] += 1  # informational card only

    # Total = open + pending_s2 + pending_s3 + approved + expired
    kpis["total"] = (
        kpis["open"] + kpis["pending_s2"] + kpis["pending_s3"]
        + kpis["approved"] + kpis["expired"]
    )

    return {"kpis": kpis, "data": data}


def fetch_work_orders(
    *,
    site_name: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    statuses: Optional[list[str]] = None,
) -> list[dict]:
    """Legacy endpoint — kept for PTW form site list."""
    sb = get_supabase_client(prefer_service_role=True)
    cols = (
        "work_order_id,site_name,date_s1_created,date_s2_forwarded,"
        "date_s3_approved,date_s2_rejected,date_s3_rejected,date_s1_closed"
    )
    q = sb.table(TABLE_WORK_ORDERS).select(cols)
    if site_name:
        q = q.eq("site_name", site_name)
    resp = q.order("date_s1_created", desc=True).execute()
    rows = getattr(resp, "data", None) or []
    result: list[dict] = []
    for r in rows:
        r["status"] = derive_ptw_status(r)
        result.append(r)
    if statuses:
        upper = {s.upper() for s in statuses}
        result = [r for r in result if r["status"].upper() in upper]
    return result


# ---------------------------------------------------------------------------
# PTW request queries (verbatim Supabase pattern from S1.py)
# ---------------------------------------------------------------------------

def insert_ptw_request(
    *,
    permit_no: str,
    site_name: str,
    created_by: str,
    form_data: dict,
) -> str:
    """Insert PTW request. Returns ptw_id. Verbatim from S1.insert_ptw_request."""
    sb = get_supabase_client(prefer_service_role=True)

    tpl = (
        sb.table(TABLE_PTW_TEMPLATES)
        .select("template_id")
        .eq("permit_type", "ELECTRICAL")
        .eq("is_active", True)
        .limit(1)
        .execute()
    )
    tpl_err = getattr(tpl, "error", None)
    if tpl_err:
        raise RuntimeError(tpl_err)
    tpl_data = getattr(tpl, "data", None) or []
    if not tpl_data:
        raise RuntimeError("No active Electrical PTW template found in database")
    template_id = tpl_data[0]["template_id"]

    resp = (
        sb.table(TABLE_PTW_REQUESTS)
        .insert(
            {
                "template_id": template_id,
                "permit_type": "ELECTRICAL",
                "permit_no": permit_no,
                "site_name": site_name,
                "status": "SUBMITTED",
                "form_data": form_data,
                "created_by": created_by,
            }
        )
        .execute()
    )
    resp_err = getattr(resp, "error", None)
    if resp_err:
        raise RuntimeError(resp_err)
    resp_data = getattr(resp, "data", None) or []
    if not resp_data:
        raise RuntimeError("PTW insert succeeded but returned no data")
    return resp_data[0]["ptw_id"]


def fetch_ptw_requests(
    *,
    site_name: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> list[dict]:
    """
    Fetch PTW requests, deriving status from work_orders.
    Filters: site_name (mandatory for scoping), start_date/end_date filter
    on the work_orders.date_s1_created column of the linked work orders.
    """
    sb = get_supabase_client(prefer_service_role=True)

    # When a date range is provided, scope PTWs to work orders whose date_planned
    # falls in the range AND have already been assigned to a PTW (date_s1_created IS NOT NULL).
    # Using date_planned matches the same filter used by the Work Orders tab so that
    # "My PTWs" shows PTWs for the same work orders the user sees in "Work Orders".
    scoped_wo_ids: Optional[list[str]] = None
    if start_date or end_date:
        wo_q = (
            sb.table(TABLE_WORK_ORDERS)
            .select("work_order_id")
            .not_.is_("date_s1_created", "null")  # only WOs that have a PTW
        )
        if site_name:
            wo_q = wo_q.eq("site_name", site_name)
        if start_date:
            wo_q = wo_q.gte("date_planned", start_date)
        if end_date:
            wo_q = wo_q.lte("date_planned", end_date + "T23:59:59")
        wo_resp = wo_q.execute()
        wo_rows = getattr(wo_resp, "data", None) or []
        scoped_wo_ids = [r["work_order_id"] for r in wo_rows if r.get("work_order_id")]

        # If no work orders found in range, return empty
        if not scoped_wo_ids:
            return []

    q = (
        sb.table(TABLE_PTW_REQUESTS)
        .select("ptw_id,permit_no,site_name,status,created_at,created_by,form_data")
        .order("created_at", desc=True)
    )
    if site_name:
        q = q.eq("site_name", site_name)
    resp = q.execute()
    err = getattr(resp, "error", None)
    if err:
        raise RuntimeError(f"Failed to fetch PTW requests: {err}")
    data = getattr(resp, "data", None) or []
    if not data:
        return []

    # Derive status from linked work_orders
    def _row_wo_ids(r: dict) -> list[str]:  # noqa: E306 — inner helper
        try:
            fd = r.get("form_data") or {}
            if isinstance(fd, dict):
                ids = fd.get("work_order_ids")
                if isinstance(ids, list) and ids:
                    return [str(x).strip() for x in ids if str(x).strip()]
                legacy = str(fd.get("work_order_id") or "").strip()
                if legacy:
                    return [legacy]
        except Exception:
            pass
        pn = str(r.get("permit_no") or "").strip()
        return [pn] if pn else []

    all_ids: set[str] = set()
    for r in data:
        all_ids.update(_row_wo_ids(r))

    status_lookup: dict[str, str] = {}
    if all_ids:
        wo_resp = (
            sb.table(TABLE_WORK_ORDERS)
            .select(
                "work_order_id,date_s1_created,date_s2_forwarded,date_s3_approved,"
                "date_s2_rejected,date_s3_rejected,date_s1_closed"
            )
            .in_("work_order_id", list(all_ids))
            .execute()
        )
        for wo in (getattr(wo_resp, "data", None) or []):
            woid = str(wo.get("work_order_id") or "").strip()
            if woid:
                # Use the full 6-state work_order status engine
                status_lookup[woid] = derive_work_order_status(wo)

    # Priority order for multi-WO PTWs (worst-case wins)
    _STATUS_PRIORITY = [
        "PERMIT_EXPIRED", "REJECTED", "PENDING_S3", "PENDING_S2", "APPROVED", "CLOSED", "OPEN"
    ]

    result: list[dict] = []
    scoped_set = set(scoped_wo_ids) if scoped_wo_ids is not None else None

    for r in data:
        ids = _row_wo_ids(r)

        # Date-range scoping: skip PTW if none of its work orders are in the scoped set
        if scoped_set is not None and not any(wid in scoped_set for wid in ids):
            continue

        statuses = [status_lookup.get(i) for i in ids if status_lookup.get(i)]
        if not statuses:
            # PTW submitted but no work_order record found — use column-level status
            r["derived_status"] = r.get("status") or "PENDING_S2"
        else:
            # Pick highest-priority status across all linked work orders
            sset = set(statuses)
            derived = "PENDING_S2"
            for p in _STATUS_PRIORITY:
                if p in sset:
                    derived = p
                    break
            r["derived_status"] = derived
        # Expose work_order_ids at top level for convenience
        r["work_order_ids"] = ids
        result.append(r)

    # Generate signed URLs for evidence photos (1-hour expiry)
    # Stored in form_data.closure_evidence_paths as relative paths in the ptw-evidence bucket
    EVIDENCE_BUCKET = "ptw-evidence"
    for r in result:
        try:
            fd: dict = r.get("form_data") or {}
            paths: list = fd.get("closure_evidence_paths") or []
            if paths:
                signed_urls: list[str] = []
                for path in paths:
                    try:
                        url_resp = sb.storage.from_(EVIDENCE_BUCKET).create_signed_url(path, 3600)
                        # supabase-py v1/v2 return a dict with 'signedURL' or 'signedUrl'
                        url = (url_resp or {}).get("signedURL") or (url_resp or {}).get("signedUrl") or ""
                        if url:
                            signed_urls.append(url)
                    except Exception:
                        pass
                if signed_urls:
                    # Attach to form_data so the frontend can access them
                    if isinstance(fd, dict):
                        fd = dict(fd)
                        fd["evidence_urls"] = signed_urls
                        r["form_data"] = fd
        except Exception:
            pass

    return result


def update_work_order_s1_created(work_order_id: str, s1_timestamp: str) -> None:
    """Set date_s1_created only if currently NULL (atomic)."""
    sb = get_supabase_client(prefer_service_role=True)
    sb.table(TABLE_WORK_ORDERS).update(
        {"date_s1_created": s1_timestamp}
    ).eq("work_order_id", work_order_id).is_("date_s1_created", "null").execute()


def close_ptw(
    *,
    ptw_id: str,
    permit_no: str,
    form_data: dict,
    closure_notes: Optional[str] = None,
) -> None:
    """S1 closure: set date_s1_closed + update form_data."""
    sb = get_supabase_client(prefer_service_role=True)
    now = datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(sep=" ", timespec="seconds")

    fd = dict(form_data) if form_data else {}
    if closure_notes:
        fd["closure_notes"] = closure_notes

    wo_ids = _get_all_work_order_ids_for_ptw(ptw_id, permit_no, fd)
    _update_all_work_orders_lifecycle(wo_ids, {"date_s1_closed": now})

    sb.table(TABLE_PTW_REQUESTS).update({"form_data": fd}).eq("ptw_id", ptw_id).execute()


def delete_ptw_request(*, ptw_id: str) -> None:
    """
    Delete a PTW request (only allowed when PENDING_S2 — before S2 acts).
    Resets date_s1_created to NULL for all linked work orders so they
    revert to OPEN status and can be re-raised.
    """
    sb = get_supabase_client(prefer_service_role=True)

    # Fetch PTW to get linked work order IDs
    ptw_resp = (
        sb.table(TABLE_PTW_REQUESTS)
        .select("form_data,permit_no")
        .eq("ptw_id", ptw_id)
        .single()
        .execute()
    )
    existing = getattr(ptw_resp, "data", None) or {}
    fd: dict = dict(existing.get("form_data") or {})

    wo_ids = _get_all_work_order_ids_for_ptw(ptw_id, existing.get("permit_no", ""), fd)

    # Reset date_s1_created on work orders → they become OPEN again
    if wo_ids:
        sb.table(TABLE_WORK_ORDERS).update(
            {"date_s1_created": None}
        ).in_("work_order_id", wo_ids).execute()

    # Delete the PTW request
    sb.table(TABLE_PTW_REQUESTS).delete().eq("ptw_id", ptw_id).execute()


def _list_storage_folder(sb, bucket: str, folder_path: str) -> list[str]:
    """List all file paths inside a storage folder. Returns relative paths."""
    try:
        items = sb.storage.from_(bucket).list(folder_path) or []
        paths = []
        for item in items:
            if isinstance(item, dict) and item.get("name"):
                name = item["name"]
                # Skip .emptyFolderPlaceholder or sub-folders with no extension
                if "." in name:
                    paths.append(f"{folder_path}/{name}")
        return paths
    except Exception:
        return []


def fetch_ptw_evidence_paths(ptw_id: str) -> list[str]:
    """
    Return all evidence file paths for a closed PTW.

    Sources checked (in order, deduplicated):
      1. form_data.closure_evidence_paths  — React app close-with-evidence upload
      2. Supabase storage scan of {wo_id}/closure/, {wo_id}/isolation/, {wo_id}/toolbox/
         for every work order linked to this PTW  (covers Streamlit-app uploads too)
    """
    import sys
    EVIDENCE_BUCKET = "ptw-evidence"

    sb = get_supabase_client(prefer_service_role=True)
    resp = (
        sb.table(TABLE_PTW_REQUESTS)
        .select("form_data")
        .eq("ptw_id", ptw_id)
        .single()
        .execute()
    )
    data = getattr(resp, "data", None) or {}
    fd: dict = data.get("form_data") or {}

    # ── Source 1: paths stored by close-with-evidence endpoint ──────────────
    stored: list[str] = fd.get("closure_evidence_paths") or []
    seen: set[str] = set(stored)
    all_paths: list[str] = list(stored)

    # ── Source 2: direct Supabase storage scan ───────────────────────────────
    # Get linked work order IDs from form_data
    wo_ids: list[str] = []
    raw_ids = fd.get("work_order_ids")
    if isinstance(raw_ids, list):
        wo_ids = [str(x).strip() for x in raw_ids if str(x).strip()]
    if not wo_ids:
        legacy = str(fd.get("work_order_id") or "").strip()
        if legacy:
            wo_ids = [legacy]

    SCAN_FOLDERS = ["closure", "isolation", "tbt", "toolbox"]
    for wo_id in wo_ids:
        for folder in SCAN_FOLDERS:
            folder_path = f"{wo_id}/{folder}"
            for path in _list_storage_folder(sb, EVIDENCE_BUCKET, folder_path):
                if path not in seen:
                    seen.add(path)
                    all_paths.append(path)

    if not all_paths:
        print(
            f"[S1] fetch_ptw_evidence_paths: no evidence found for ptw={ptw_id} "
            f"wo_ids={wo_ids} stored={stored}",
            file=sys.stderr,
        )
    else:
        print(f"[S1] fetch_ptw_evidence_paths: ptw={ptw_id} found {len(all_paths)} files", file=sys.stderr)

    return all_paths


def fetch_ptw_evidence_signed(ptw_id: str, ttl: int = 3600) -> list[dict]:
    """
    Return S1 evidence photos with pre-signed Supabase URLs.
    Covers closure, isolation, and toolbox (legacy tbt) folders.
    Each item: { path, folder, signed_url }
    """
    import re as _re
    EVIDENCE_BUCKET = "ptw-evidence"
    paths = fetch_ptw_evidence_paths(ptw_id)
    if not paths:
        return []

    sb = get_supabase_client(prefer_service_role=True)
    result: list[dict] = []
    for path in paths:
        parts = path.split("/")
        folder = parts[1] if len(parts) >= 2 else "evidence"
        # Normalise folder label
        if folder == "toolbox":
            folder = "tbt"
        signed_url = ""
        try:
            res = sb.storage.from_(EVIDENCE_BUCKET).create_signed_url(path, ttl)
            raw = res.get("signedURL") or res.get("signedUrl") or ""
            signed_url = _re.sub(r"(?<!:)//+", "/", raw)
        except Exception as exc:
            import sys
            print(f"[S1] signed URL error for {path}: {exc}", file=sys.stderr)
        result.append({"path": path, "folder": folder, "signed_url": signed_url})
    return result


def download_ptw_evidence_file(ptw_id: str, file_index: int) -> Optional[bytes]:
    """
    Download evidence photo bytes from Supabase storage by index.
    Returns None if not found.
    """
    import sys
    paths = fetch_ptw_evidence_paths(ptw_id)
    if file_index < 0 or file_index >= len(paths):
        print(f"[S1] download_ptw_evidence_file: index {file_index} out of range (total={len(paths)})", file=sys.stderr)
        return None
    EVIDENCE_BUCKET = "ptw-evidence"
    sb = get_supabase_client(prefer_service_role=True)
    try:
        return sb.storage.from_(EVIDENCE_BUCKET).download(paths[file_index])
    except Exception as e:
        print(f"[S1] download_ptw_evidence_file error ptw={ptw_id} idx={file_index} path={paths[file_index]}: {e}", file=sys.stderr)
        return None


def close_ptw_with_evidence(
    *,
    ptw_id: str,
    work_order_ids: list[str],
    closure_notes: Optional[str] = None,
    evidence_paths: Optional[list[str]] = None,
    closure_details: Optional[dict] = None,
) -> None:
    """
    Close PTW with evidence photos already uploaded to storage.
    Sets date_s1_closed on all linked work orders and updates PTW form_data.
    Stores closure_details (signatures, tools, undertaking proof, etc.) in form_data.
    """
    sb = get_supabase_client(prefer_service_role=True)
    now_ist = get_server_time_ist()

    # Fetch current form_data
    ptw_resp = (
        sb.table(TABLE_PTW_REQUESTS)
        .select("form_data,permit_no")
        .eq("ptw_id", ptw_id)
        .single()
        .execute()
    )
    existing = getattr(ptw_resp, "data", None) or {}
    fd: dict = dict(existing.get("form_data") or {})

    if closure_notes:
        fd["closure_notes"] = closure_notes
    if evidence_paths:
        fd["closure_evidence_paths"] = evidence_paths
    if closure_details:
        fd.update(closure_details)
    # Backend always sets the authoritative closure time (overrides any frontend value)
    fd["date_s1_closed"] = now_ist
    fd["end_time"] = now_ist  # used in PDF overlay

    # Update work orders
    if work_order_ids:
        sb.table(TABLE_WORK_ORDERS).update(
            {"date_s1_closed": now_ist}
        ).in_("work_order_id", work_order_ids).execute()

    sb.table(TABLE_PTW_REQUESTS).update({"form_data": fd}).eq("ptw_id", ptw_id).execute()


# ──────────────────────────────────────────────────────────────────────────────
# Work Order CRUD — used by S2/S3 portals
# ──────────────────────────────────────────────────────────────────────────────

def create_work_order(
    *,
    site_name: str,
    location: str,
    equipment: str,
    frequency: str,
    isolation_requirement: str,
    date_planned: str,
) -> dict:
    """
    Insert a new work order row.
    work_order_id is auto-generated by the DB trigger trg_work_orders_generate_id.
    """
    sb = get_supabase_client(prefer_service_role=True)
    payload: dict = {
        "site_name": site_name,
        "location": location,
        "equipment": equipment,
        "frequency": frequency,
        "isolation_requirement": isolation_requirement,
        "date_planned": date_planned,
    }
    resp = sb.table(TABLE_WORK_ORDERS).insert(payload).execute()
    data = getattr(resp, "data", None) or []
    if not data:
        raise ValueError("Work order creation failed — no data returned.")
    return data[0]


def update_work_order(
    *,
    work_order_id: str,
    site_name: str,
    location: str,
    equipment: str,
    frequency: str,
    isolation_requirement: str,
    date_planned: str,
    remark: str,  # kept for API compatibility but not persisted (column absent in DB)
) -> dict:
    """
    Update an existing work order.
    Only allowed when date_s1_created IS NULL (PTW not yet initiated).
    NOTE: 'remark' is accepted from the UI as an audit confirmation but is NOT
    written to the DB because the work_orders table has no remark column.
    """
    sb = get_supabase_client(prefer_service_role=True)
    # Use execute() then inspect the list; maybe_single() unavailable in some SDK versions
    check_resp = (
        sb.table(TABLE_WORK_ORDERS)
        .select("work_order_id,date_s1_created")
        .eq("work_order_id", work_order_id)
        .execute()
    )
    rows = getattr(check_resp, "data", None) or []
    if not rows:
        raise ValueError(f"Work order {work_order_id} not found.")
    row = rows[0]
    if row.get("date_s1_created"):
        raise ValueError("Update blocked: Work Order may already have an initiated PTW.")
    # Only update columns that actually exist in the DB schema
    payload: dict = {
        "site_name": site_name,
        "location": location,
        "equipment": equipment,
        "frequency": frequency,
        "isolation_requirement": isolation_requirement,
        "date_planned": date_planned,
    }
    resp = sb.table(TABLE_WORK_ORDERS).update(payload).eq("work_order_id", work_order_id).execute()
    data = getattr(resp, "data", None) or []
    if not data:
        # Supabase sometimes returns empty on update; re-fetch to confirm success
        fetch = sb.table(TABLE_WORK_ORDERS).select("*").eq("work_order_id", work_order_id).execute()
        fetched = getattr(fetch, "data", None) or []
        if fetched:
            return fetched[0]
        raise ValueError("Work order update failed — no data returned.")
    return data[0]
