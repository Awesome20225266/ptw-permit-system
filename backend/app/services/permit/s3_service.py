"""
services/permit/s3_service.py — S3 Portal business logic (v2).

Adds S1/S2-compatible filter + KPI API surface while retaining
original approve/reject/revoke logic.
"""
from __future__ import annotations

import sys
from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from app.database import get_supabase_client
from app.services.permit.lifecycle_utils import (
    _get_all_work_order_ids_for_ptw,
    _update_all_work_orders_lifecycle,
)
from app.services.permit.s1_service import (
    derive_ptw_status,
    fetch_work_orders_full,
    list_sites_from_work_orders,
)
from app.services.permit.s2_service import _row_wo_ids, _STATUS_PRIORITY, derive_work_order_status

TABLE_WORK_ORDERS = "work_orders"
TABLE_PTW_REQUESTS = "ptw_requests"


# ─────────────────────────────────────────────────────────────────────────────
# KPI — reuse S1/S2 engine
# ─────────────────────────────────────────────────────────────────────────────

def fetch_s3_work_orders_with_kpi(
    *,
    site_name: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict:
    """Returns { kpis, data } using the same engine as S1/S2."""
    return fetch_work_orders_full(
        site_name=site_name,
        start_date=start_date,
        end_date=end_date,
    )


def list_s3_users() -> list[str]:
    """Return all dashboard usernames for the permit issuer dropdown."""
    sb = get_supabase_client(prefer_service_role=True)
    resp = sb.table("dashboard_users").select("username").execute()
    rows = getattr(resp, "data", None) or []
    return sorted({str(r["username"]).strip() for r in rows if r.get("username")})


# ─────────────────────────────────────────────────────────────────────────────
# PTW list for S3 (with filters)
# ─────────────────────────────────────────────────────────────────────────────

def fetch_ptw_for_s3(
    *,
    site_name: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> list[dict]:
    """
    Fetch PTW requests for S3 portal.
    - Only PTWs where date_s2_forwarded IS NOT NULL (S2 has forwarded)
    - Filters by date_planned range and site_name
    - Status uses the same 6-state engine as S1/S2
    """
    sb = get_supabase_client(prefer_service_role=True)

    # Step 1: Work orders that have been forwarded to S3
    wo_q = (
        sb.table(TABLE_WORK_ORDERS)
        .select(
            "work_order_id,site_name,date_planned,date_s1_created,date_s2_forwarded,"
            "date_s3_approved,date_s2_rejected,date_s3_rejected,date_s1_closed"
        )
        .not_.is_("date_s2_forwarded", "null")
    )
    if site_name:
        wo_q = wo_q.eq("site_name", site_name)
    if start_date:
        wo_q = wo_q.gte("date_planned", start_date)
    if end_date:
        wo_q = wo_q.lte("date_planned", end_date + "T23:59:59")

    wo_resp = wo_q.execute()
    wo_rows = getattr(wo_resp, "data", None) or []
    if not wo_rows:
        return []

    scoped_wo_ids = {r["work_order_id"] for r in wo_rows if r.get("work_order_id")}
    wo_map = {r["work_order_id"]: r for r in wo_rows}

    # Step 2: PTW requests
    q = (
        sb.table(TABLE_PTW_REQUESTS)
        .select("ptw_id,permit_no,site_name,created_at,created_by,form_data")
        .order("created_at", desc=True)
    )
    if site_name:
        q = q.eq("site_name", site_name)
    resp = q.execute()
    data = getattr(resp, "data", None) or []

    result: list[dict] = []
    for r in data:
        ids = _row_wo_ids(r)
        if not any(wid in scoped_wo_ids for wid in ids):
            continue

        statuses = [derive_work_order_status(wo_map[wid]) for wid in ids if wid in wo_map]
        if not statuses:
            derived = "PENDING_S3"
        else:
            sset = set(statuses)
            derived = "PENDING_S3"
            for p in _STATUS_PRIORITY:
                if p in sset:
                    derived = p
                    break

        fd = r.get("form_data") or {}
        r["work_order_ids"] = ids
        r["derived_status"] = derived
        # Expose useful fields for the S3 table
        if isinstance(fd, dict):
            r["receiver_name"] = str(fd.get("receiver_name") or fd.get("permit_receiver") or "—")
            r["holder_name"]   = str(fd.get("permit_holder") or fd.get("holder_name") or "—")
            r["issuer_name"]   = str(fd.get("issuer_name") or "—")
            # date_s2_forwarded from the first matching work order
            for wid in ids:
                wo = wo_map.get(wid, {})
                if wo.get("date_s2_forwarded"):
                    r["date_s2_forwarded"] = wo["date_s2_forwarded"]
                    break
        result.append(r)

    print(f"[S3] fetch_ptw_for_s3 found {len(result)} PTWs", file=sys.stderr)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Approve by ptw_id (direct lookup — avoids limit(50) scan)
# ─────────────────────────────────────────────────────────────────────────────

def approve_ptw_by_id(
    *,
    ptw_id: str,
    issuer_name: str,
    remark: str = "Approved",
) -> tuple[bool, str]:
    """
    Approve a PTW directly by its UUID.
    Sets date_s3_approved on all linked work_orders and writes issuer info to form_data.
    """
    sb = get_supabase_client(prefer_service_role=True)
    ts = datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(sep=" ", timespec="seconds")

    # Fetch PTW by ptw_id
    resp = (
        sb.table(TABLE_PTW_REQUESTS)
        .select("ptw_id,permit_no,form_data")
        .eq("ptw_id", ptw_id)
        .single()
        .execute()
    )
    chosen = getattr(resp, "data", None)
    if not chosen:
        return False, "No PTW request found for this ptw_id."

    form_data = dict(chosen.get("form_data") or {})
    form_data["issuer_name"] = issuer_name
    form_data["issuer_datetime"] = ts
    form_data["s3_remark"] = remark

    # Update form_data in ptw_requests
    sb.table(TABLE_PTW_REQUESTS).update({"form_data": form_data}).eq("ptw_id", ptw_id).execute()

    # Find all linked work_order_ids
    wo_ids = _get_all_work_order_ids_for_ptw(
        ptw_id=ptw_id,
        permit_no=str(chosen.get("permit_no") or ""),
        form_data=form_data,
    )
    if not wo_ids:
        return False, "No work_order_ids linked to this PTW."

    # Guard: don't re-approve
    chk = sb.table(TABLE_WORK_ORDERS).select("work_order_id,date_s3_approved").in_("work_order_id", wo_ids).execute()
    chk_rows = getattr(chk, "data", None) or []
    if any(r.get("date_s3_approved") for r in chk_rows if isinstance(r, dict)):
        return False, "This PTW has already been approved (date_s3_approved is set)."

    _update_all_work_orders_lifecycle(wo_ids, {"date_s3_approved": ts})
    print(f"[S3] approved ptw_id={ptw_id} by {issuer_name} at {ts}", file=sys.stderr)
    return True, ts


def fetch_all_s3_ptws(
    *,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> list[dict]:
    """
    Fetch PTWs for S3 review (forwarded by S2).
    Verbatim query pattern from S3._fetch_all_s3_ptws.
    """
    sb = get_supabase_client(prefer_service_role=True)

    # Find work_orders that have date_s2_forwarded set
    wo_q = sb.table(TABLE_WORK_ORDERS).select(
        "work_order_id,date_s2_forwarded,date_s1_created,date_s2_rejected,"
        "date_s3_approved,date_s3_rejected,date_s1_closed"
    ).not_.is_("date_s2_forwarded", "null")

    if start_date:
        wo_q = wo_q.gte("date_s2_forwarded", start_date)
    if end_date:
        wo_q = wo_q.lte("date_s2_forwarded", end_date)

    wo_resp = wo_q.execute()
    wo_rows = getattr(wo_resp, "data", None) or []
    if not wo_rows:
        return []

    forwarded_ids = {str(w["work_order_id"]) for w in wo_rows}

    # Fetch PTW requests
    ptw_resp = (
        sb.table(TABLE_PTW_REQUESTS)
        .select("ptw_id,permit_no,site_name,created_at,created_by,form_data")
        .order("created_at", desc=True)
        .execute()
    )
    ptw_rows = getattr(ptw_resp, "data", None) or []

    wo_map = {str(w["work_order_id"]): w for w in wo_rows}

    def _extract_ids(r: dict) -> list[str]:
        fd = r.get("form_data") or {}
        if isinstance(fd, dict):
            ids = fd.get("work_order_ids")
            if isinstance(ids, list) and ids:
                return [str(x).strip() for x in ids if str(x).strip()]
            legacy = str(fd.get("work_order_id") or "").strip()
            if legacy:
                return [legacy]
        pn = str(r.get("permit_no") or "").strip()
        return [pn] if pn else []

    result: list[dict] = []
    for r in ptw_rows:
        ids = _extract_ids(r)
        # Only include PTWs that have at least one work_order forwarded to S3
        if not any(i in forwarded_ids for i in ids):
            continue

        wo_row_list = [wo_map[i] for i in ids if i in wo_map]
        statuses = [derive_ptw_status(w) for w in wo_row_list]
        sset = {s.upper() for s in statuses}

        if "REJECTED" in sset:
            lifecycle = "REJECTED"
        elif sset <= {"CLOSED"}:
            lifecycle = "CLOSED"
        elif sset <= {"APPROVED", "CLOSED"}:
            lifecycle = "APPROVED"
        else:
            lifecycle = "PENDING_AT_S3"

        r["work_order_ids"] = ids
        r["lifecycle"] = lifecycle
        result.append(r)

    return result


def approve_ptw(
    *,
    work_order_id: str,
    issuer_name: str,
) -> tuple[bool, str]:
    """
    Atomic approval: set date_s3_approved on all linked work_orders.
    Verbatim from S3._approve_work_order.
    Returns (ok: bool, message_or_timestamp: str).
    """
    sb = get_supabase_client(prefer_service_role=True)
    ts = datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(sep=" ", timespec="seconds")

    # Find the PTW for this work_order
    ptw_resp = (
        sb.table(TABLE_PTW_REQUESTS)
        .select("ptw_id,permit_no,form_data,created_at")
        .order("created_at", desc=True)
        .limit(50)
        .execute()
    )
    ptw_rows = getattr(ptw_resp, "data", None) or []
    chosen = None
    for r in ptw_rows:
        if not isinstance(r, dict):
            continue
        if str(r.get("permit_no") or "").strip() == str(work_order_id).strip():
            chosen = r
            break
        fd = r.get("form_data") or {}
        if isinstance(fd, dict):
            ids = fd.get("work_order_ids")
            if isinstance(ids, list) and str(work_order_id).strip() in {str(x).strip() for x in ids}:
                chosen = r
                break
            if str(fd.get("work_order_id") or "").strip() == str(work_order_id).strip():
                chosen = r
                break

    if chosen is None:
        return False, "No PTW request found for this work_order_id."

    form_data = dict(chosen.get("form_data") or {})
    form_data["issuer_name"] = issuer_name
    form_data["issuer_datetime"] = ts

    upd_ptw = (
        sb.table(TABLE_PTW_REQUESTS)
        .update({"form_data": form_data})
        .eq("ptw_id", chosen.get("ptw_id"))
        .execute()
    )
    if getattr(upd_ptw, "error", None):
        return False, f"Failed to update PTW issuer info: {getattr(upd_ptw, 'error', '')}"

    wo_ids = _get_all_work_order_ids_for_ptw(
        ptw_id=str(chosen.get("ptw_id") or ""),
        permit_no=str(chosen.get("permit_no") or ""),
        form_data=form_data,
    )
    if not wo_ids:
        wo_ids = [work_order_id]

    # Guard: don't re-approve
    chk = (
        sb.table(TABLE_WORK_ORDERS)
        .select("work_order_id,date_s3_approved")
        .in_("work_order_id", wo_ids)
        .execute()
    )
    chk_rows = getattr(chk, "data", None) or []
    if any(
        (r or {}).get("date_s3_approved") is not None
        for r in chk_rows
        if isinstance(r, dict)
    ):
        return False, "This PTW appears to already be approved (date_s3_approved is set)."

    _update_all_work_orders_lifecycle(wo_ids, {"date_s3_approved": ts})
    return True, ts


def reject_ptw(
    *,
    work_order_id: str,
    stage: str = "s3",  # "s2" or "s3"
    reason: Optional[str] = None,
) -> tuple[bool, str]:
    """
    Reject a PTW by setting date_s3_rejected (or date_s2_rejected).
    Returns (ok, message).
    """
    ts = datetime.now(ZoneInfo("Asia/Kolkata")).isoformat(sep=" ", timespec="seconds")
    field = "date_s3_rejected" if stage.lower() == "s3" else "date_s2_rejected"
    try:
        _update_all_work_orders_lifecycle([work_order_id], {field: ts})
        return True, ts
    except Exception as e:
        return False, str(e)


def revoke_s3_approval(*, work_order_id: str) -> tuple[bool, str]:
    """
    Revoke approval by clearing date_s3_approved on all linked work_orders.
    Verbatim from S3._revoke_s3_approval.
    """
    sb = get_supabase_client(prefer_service_role=True)
    try:
        ptw_resp = (
            sb.table(TABLE_PTW_REQUESTS)
            .select("permit_no,form_data,created_at")
            .order("created_at", desc=True)
            .limit(50)
            .execute()
        )
        ptw_rows = getattr(ptw_resp, "data", None) or []
        covered_ids: list[str] = []
        for r in ptw_rows:
            if not isinstance(r, dict):
                continue
            if str(r.get("permit_no") or "").strip() == str(work_order_id).strip():
                fd = r.get("form_data") if isinstance(r.get("form_data"), dict) else {}
                ids = fd.get("work_order_ids") if isinstance(fd, dict) else None
                if isinstance(ids, list) and ids:
                    covered_ids = [str(x).strip() for x in ids if str(x).strip()]
                break
            fd = r.get("form_data") or {}
            if isinstance(fd, dict):
                ids = fd.get("work_order_ids")
                if isinstance(ids, list) and str(work_order_id).strip() in {str(x).strip() for x in ids}:
                    covered_ids = [str(x).strip() for x in ids if str(x).strip()]
                    break
        if not covered_ids:
            covered_ids = [work_order_id]
    except Exception:
        covered_ids = [work_order_id]

    try:
        _update_all_work_orders_lifecycle(covered_ids, {"date_s3_approved": None})
    except Exception as e:
        return False, f"Failed to revoke approval: {e}"

    return True, "Approval revoked successfully"
