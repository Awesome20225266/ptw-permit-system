"""
services/permit/s2_service.py — S2 Permit Forwarding business logic (v2).

Rewrites old S2 service to use the unified 6-state status engine from s1_service
and adds evidence upload, camera-capture path storage, and proper site/date filtering.
"""
from __future__ import annotations

import re
import sys
from typing import Optional
from zoneinfo import ZoneInfo
from datetime import datetime

from app.database import get_supabase_client
from app.services.permit.lifecycle_utils import _update_all_work_orders_lifecycle
from app.services.permit.s1_service import (
    derive_work_order_status,
    list_sites_from_work_orders,
    fetch_work_orders_full,
    get_server_time_ist,
)

TABLE_WORK_ORDERS = "work_orders"
TABLE_PTW_REQUESTS = "ptw_requests"
EVIDENCE_BUCKET = "ptw-evidence"

# Status priority for multi-WO PTWs (worst-case wins)
_STATUS_PRIORITY = [
    "PERMIT_EXPIRED", "REJECTED", "PENDING_S3", "PENDING_S2", "APPROVED", "CLOSED", "OPEN"
]


# ─────────────────────────────────────────────────────────────────────────────
# Users
# ─────────────────────────────────────────────────────────────────────────────

def list_s2_users() -> list[str]:
    """Return sorted usernames from dashboard_users for the Permit Holder dropdown."""
    sb = get_supabase_client(prefer_service_role=True)
    resp = sb.table("dashboard_users").select("username").execute()
    return sorted(r["username"] for r in (resp.data or []) if r.get("username"))


# ─────────────────────────────────────────────────────────────────────────────
# Work orders + KPIs (reuse S1 engine directly)
# ─────────────────────────────────────────────────────────────────────────────

def fetch_s2_work_orders_with_kpi(
    *,
    site_name: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> dict:
    """
    Returns { kpis: {...}, data: [...] } using the same engine as S1.
    S2 shows ALL work orders (not just those with date_s1_created),
    so supervisors can see the full picture.
    """
    return fetch_work_orders_full(
        site_name=site_name,
        start_date=start_date,
        end_date=end_date,
    )


# ─────────────────────────────────────────────────────────────────────────────
# PTW list for S2
# ─────────────────────────────────────────────────────────────────────────────

def _row_wo_ids(r: dict) -> list[str]:
    """Extract work_order_ids from a ptw_requests row."""
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


def fetch_ptw_for_s2(
    *,
    site_name: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
) -> list[dict]:
    """
    Fetch PTW requests for S2 portal.
    - Only PTWs where date_s1_created IS NOT NULL (S1 has already submitted)
    - Filters by date_planned range (same column used by Work Orders tab in S1)
    - Status uses the full 6-state derive_work_order_status engine
    """
    sb = get_supabase_client(prefer_service_role=True)

    # Step 1: Find work_order_ids in scope
    # Only WOs that have been submitted (date_s1_created IS NOT NULL)
    # filtered by date_planned range and site_name
    wo_q = (
        sb.table(TABLE_WORK_ORDERS)
        .select(
            "work_order_id,site_name,date_planned,date_s1_created,date_s2_forwarded,"
            "date_s3_approved,date_s2_rejected,date_s3_rejected,date_s1_closed"
        )
        .not_.is_("date_s1_created", "null")
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

    # Step 2: Fetch PTW requests (filtered by site_name)
    q = (
        sb.table(TABLE_PTW_REQUESTS)
        .select("ptw_id,permit_no,site_name,created_at,created_by,form_data")
        .order("created_at", desc=True)
    )
    if site_name:
        q = q.eq("site_name", site_name)
    resp = q.execute()
    data = getattr(resp, "data", None) or []
    if not data:
        return []

    # Step 3: Build result — filter by scoped work orders, derive status
    result: list[dict] = []
    for r in data:
        ids = _row_wo_ids(r)

        # Skip if none of this PTW's work orders are in the scoped set
        if not any(wid in scoped_wo_ids for wid in ids):
            continue

        statuses = [derive_work_order_status(wo_map[wid]) for wid in ids if wid in wo_map]
        if not statuses:
            derived = "PENDING_S2"
        else:
            sset = set(statuses)
            derived = "PENDING_S2"
            for p in _STATUS_PRIORITY:
                if p in sset:
                    derived = p
                    break

        fd = r.get("form_data") or {}
        permit_holder = ""
        if isinstance(fd, dict):
            permit_holder = str(fd.get("permit_holder") or fd.get("holder_name") or "")

        r["work_order_ids"] = ids
        r["derived_status"] = derived
        r["permit_holder"] = permit_holder
        result.append(r)

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Evidence upload
# ─────────────────────────────────────────────────────────────────────────────

def upload_evidence(
    *,
    work_order_id: str,
    folder: str,        # "isolation" | "tbt"
    file_bytes: bytes,
    filename: str,
    content_type: str = "image/jpeg",
) -> str:
    """
    Upload an evidence photo to Supabase Storage in ptw-evidence bucket.
    Uses a timestamp suffix to APPEND (not replace) existing evidence.
    Returns the storage path (relative to bucket root).
    """
    sb = get_supabase_client(prefer_service_role=True)

    ts = datetime.now(ZoneInfo("Asia/Kolkata")).strftime("%Y%m%d_%H%M%S")
    name_parts = filename.rsplit(".", 1)
    safe_filename = f"{name_parts[0]}_{ts}.{name_parts[1]}" if len(name_parts) == 2 else f"{filename}_{ts}"

    storage_path = f"{work_order_id}/{folder}/{safe_filename}"

    try:
        sb.storage.from_(EVIDENCE_BUCKET).upload(
            storage_path, file_bytes, {"content-type": content_type}
        )
    except Exception:
        try:
            sb.storage.from_(EVIDENCE_BUCKET).remove([storage_path])
            sb.storage.from_(EVIDENCE_BUCKET).upload(
                storage_path, file_bytes, {"content-type": content_type}
            )
        except Exception as e:
            print(f"[S2] upload_evidence error {storage_path}: {e}", file=sys.stderr)
            raise

    print(f"[S2] Uploaded evidence: {storage_path}", file=sys.stderr)
    return storage_path


# ─────────────────────────────────────────────────────────────────────────────
# Evidence listing & download
# ─────────────────────────────────────────────────────────────────────────────

def _list_storage_folder(sb, bucket: str, folder_path: str) -> list[str]:
    """List all file paths inside a storage folder (returns relative paths)."""
    try:
        items = sb.storage.from_(bucket).list(folder_path) or []
        paths = []
        for item in items:
            if isinstance(item, dict) and item.get("name"):
                name = item["name"]
                if "." in name:   # skip placeholder dirs
                    paths.append(f"{folder_path}/{name}")
        return sorted(paths)
    except Exception:
        return []


def fetch_s2_evidence(ptw_id: str, signed_url_ttl: int = 3600) -> list[dict]:
    """
    Return all S2 evidence file paths for a PTW, with pre-signed Supabase URLs.

    Scans ptw-evidence/{wo_id}/isolation/ and ptw-evidence/{wo_id}/tbt/
    for every work order linked to this PTW.

    Returns: [{"path": ..., "folder": ..., "wo_id": ..., "signed_url": ...}, ...]
    The signed_url can be used directly in <img src> without an auth header.
    """
    sb = get_supabase_client(prefer_service_role=True)

    # Get work_order_ids from ptw_requests.form_data
    resp = (
        sb.table(TABLE_PTW_REQUESTS)
        .select("form_data")
        .eq("ptw_id", ptw_id)
        .single()
        .execute()
    )
    data = getattr(resp, "data", None) or {}
    fd: dict = data.get("form_data") or {}
    wo_ids: list[str] = []
    raw_ids = fd.get("work_order_ids")
    if isinstance(raw_ids, list):
        wo_ids = [str(x).strip() for x in raw_ids if str(x).strip()]
    if not wo_ids:
        legacy = str(fd.get("work_order_id") or "").strip()
        if legacy:
            wo_ids = [legacy]

    result: list[dict] = []
    for wo_id in wo_ids:
        for folder in ("isolation", "tbt", "toolbox"):  # "toolbox" = legacy name for tbt
            for path in _list_storage_folder(sb, EVIDENCE_BUCKET, f"{wo_id}/{folder}"):
                signed_url = ""
                try:
                    res = sb.storage.from_(EVIDENCE_BUCKET).create_signed_url(path, signed_url_ttl)
                    # Supabase Python SDK returns {"signedURL": "..."} or {"signedUrl": "..."}
                    raw = res.get("signedURL") or res.get("signedUrl") or ""
                    # Normalize double-slashes in path (SDK bug: sometimes emits //storage)
                    signed_url = re.sub(r"(?<!:)//+", "/", raw)
                except Exception as e:
                    print(f"[S2] signed URL error for {path}: {e}", file=sys.stderr)
                result.append({
                    "path": path,
                    # Normalise legacy "toolbox" → "tbt" for consistent frontend display
                    "folder": "tbt" if folder == "toolbox" else folder,
                    "wo_id": wo_id,
                    "signed_url": signed_url,
                })

    print(f"[S2] fetch_s2_evidence ptw={ptw_id} found {len(result)} files", file=sys.stderr)
    return result


def download_s2_evidence_file(ptw_id: str, file_index: int) -> Optional[bytes]:
    """Download a single S2 evidence photo by index from Supabase storage."""
    items = fetch_s2_evidence(ptw_id)
    if file_index < 0 or file_index >= len(items):
        return None
    sb = get_supabase_client(prefer_service_role=True)
    path = items[file_index]["path"]
    try:
        return sb.storage.from_(EVIDENCE_BUCKET).download(path)
    except Exception as e:
        print(f"[S2] download_s2_evidence_file error idx={file_index} path={path}: {e}", file=sys.stderr)
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Forward PTW to S3
# ─────────────────────────────────────────────────────────────────────────────

def forward_ptw(
    *,
    ptw_id: str,
    work_order_ids: list[str],
    permit_holder: str,
    isolation_requirement: str = "NO",
    s2_form_updates: dict | None = None,
) -> None:
    """
    S2 forward: stamps date_s2_forwarded on all linked work_orders and
    merges permit_holder + s2 form data into ptw_requests.form_data.
    """
    now = get_server_time_ist()
    sb = get_supabase_client(prefer_service_role=True)

    # Stamp work orders
    _update_all_work_orders_lifecycle(
        work_order_ids,
        {
            "date_s2_forwarded": now,
            "isolation_requirement": isolation_requirement,
        },
    )

    # Merge S2 fields into existing form_data
    ptw_resp = (
        sb.table(TABLE_PTW_REQUESTS)
        .select("form_data")
        .eq("ptw_id", ptw_id)
        .single()
        .execute()
    )
    existing_fd = dict((getattr(ptw_resp, "data", None) or {}).get("form_data") or {})
    if s2_form_updates:
        existing_fd.update(s2_form_updates)
    existing_fd["permit_holder"] = permit_holder
    existing_fd["isolation_requirement"] = isolation_requirement
    existing_fd["date_s2_forwarded"] = now

    sb.table(TABLE_PTW_REQUESTS).update({"form_data": existing_fd}).eq("ptw_id", ptw_id).execute()


# ─────────────────────────────────────────────────────────────────────────────
# Revoke S2 submission
# ─────────────────────────────────────────────────────────────────────────────

def revoke_s2_submission(
    *,
    ptw_id: str,
    work_order_ids: list[str],
) -> None:
    """
    Clear date_s2_forwarded on all linked work_orders
    (allowed only while date_s3_approved IS NULL).
    """
    _update_all_work_orders_lifecycle(work_order_ids, {"date_s2_forwarded": None})

    # Also clear date_s2_forwarded from form_data for consistency
    sb = get_supabase_client(prefer_service_role=True)
    ptw_resp = (
        sb.table(TABLE_PTW_REQUESTS)
        .select("form_data")
        .eq("ptw_id", ptw_id)
        .single()
        .execute()
    )
    fd = dict((getattr(ptw_resp, "data", None) or {}).get("form_data") or {})
    fd.pop("date_s2_forwarded", None)
    sb.table(TABLE_PTW_REQUESTS).update({"form_data": fd}).eq("ptw_id", ptw_id).execute()
