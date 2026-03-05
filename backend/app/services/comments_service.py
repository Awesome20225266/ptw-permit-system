"""
services/comments_service.py — zelestra_comments CRUD.

Ported from add_comments.py.
Supabase queries and deduplication logic are copied verbatim.
Streamlit UI code is not ported.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Optional

from app.database import get_supabase_client


TABLE = "zelestra_comments"


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------

def fetch_comments(
    *,
    site_names: Optional[list[str]] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    limit: int = 500,
) -> list[dict]:
    """
    Fetch comments from zelestra_comments.
    Optionally filter by site names and/or date overlap.
    Verbatim query logic from add_comments.fetch_comments_live.
    """
    sb = get_supabase_client(prefer_service_role=True)
    q = (
        sb.table(TABLE)
        .select("*")
        .order("created_at", desc=True)
        .limit(int(limit))
    )
    if site_names:
        q = q.in_("site_name", site_names)
    if start_date:
        q = q.lte("start_date", end_date.isoformat() if end_date else start_date.isoformat())
    if end_date:
        q = q.gte("end_date", start_date.isoformat() if start_date else end_date.isoformat())

    resp = q.execute()
    return resp.data or []


# ---------------------------------------------------------------------------
# Create (single)
# ---------------------------------------------------------------------------

def insert_comment(payload: dict[str, Any]) -> dict:
    """Insert one comment row. Returns the inserted row."""
    sb = get_supabase_client(prefer_service_role=True)
    resp = sb.table(TABLE).insert(payload).execute()
    data = getattr(resp, "data", None) or []
    if not data:
        raise RuntimeError("Comment insert returned no data")
    return data[0]


# ---------------------------------------------------------------------------
# Bulk insert with deduplication (verbatim logic from add_comments.py)
# ---------------------------------------------------------------------------

def _norm_str(x: object) -> str:
    return str(x).strip().lower() if x is not None else ""


def _norm_list(x: object) -> tuple[str, ...]:
    if isinstance(x, list):
        return tuple(sorted(_norm_str(i) for i in x))
    return (_norm_str(x),)


def _dev_key(x: object) -> str:
    """Normalise deviation for dedup comparison."""
    try:
        return str(int(float(str(x))))
    except Exception:
        return _norm_str(x)


def insert_bulk_comments(payloads: list[dict[str, Any]]) -> dict[str, int]:
    """
    Bulk insert with deduplication.
    Returns {"inserted": N, "duplicates": M}.
    Logic ported verbatim from add_comments.insert_bulk_comments.
    """
    if not payloads:
        return {"inserted": 0, "duplicates": 0}

    sb = get_supabase_client(prefer_service_role=True)

    # Fetch existing rows for the same sites to detect duplicates
    site_names = list({p.get("site_name") for p in payloads if p.get("site_name")})
    existing_resp = (
        sb.table(TABLE)
        .select("site_name,deviation,start_date,end_date,equipment_names,reasons")
        .in_("site_name", site_names)
        .execute()
    )
    existing = existing_resp.data or []

    def _row_key(r: dict) -> tuple:
        return (
            _norm_str(r.get("site_name")),
            _dev_key(r.get("deviation")),
            _norm_str(r.get("start_date")),
            _norm_str(r.get("end_date")),
            _norm_list(r.get("equipment_names")),
            _norm_list(r.get("reasons")),
        )

    existing_keys = {_row_key(r) for r in existing}

    new_payloads = [p for p in payloads if _row_key(p) not in existing_keys]
    dup_count = len(payloads) - len(new_payloads)

    if not new_payloads:
        return {"inserted": 0, "duplicates": dup_count}

    try:
        sb.table(TABLE).insert(new_payloads).execute()
    except Exception as e:
        # Retry with int deviation if float caused a type error
        err_str = str(e).lower()
        if "integer" in err_str or "int4" in err_str:
            for p in new_payloads:
                if "deviation" in p and p["deviation"] is not None:
                    try:
                        p["deviation"] = int(float(str(p["deviation"])))
                    except Exception:
                        pass
            sb.table(TABLE).insert(new_payloads).execute()
        else:
            raise

    return {"inserted": len(new_payloads), "duplicates": dup_count}


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------

def update_comment(comment_id: Any, payload: dict[str, Any]) -> dict:
    """Update a comment by ID. Returns the updated row."""
    sb = get_supabase_client(prefer_service_role=True)
    resp = sb.table(TABLE).update(payload).eq("id", comment_id).execute()
    data = getattr(resp, "data", None) or []
    if not data:
        raise RuntimeError(f"Comment {comment_id} not found or update returned no data")
    return data[0]


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------

def delete_comment(comment_id: Any) -> None:
    """Delete a comment by ID."""
    sb = get_supabase_client(prefer_service_role=True)
    sb.table(TABLE).delete().eq("id", comment_id).execute()
