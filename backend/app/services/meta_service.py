"""
services/meta_service.py — DuckDB metadata inspection + Supabase master_db helpers.
"""
from __future__ import annotations

from typing import Optional

from app.database import get_cached_duckdb_path, get_duckdb_connection, get_supabase_client
from app.utils.cache import ttl_cache

# Known safe tables (whitelist — prevents arbitrary table name injection)
KNOWN_TABLES = {
    "daily_kpi",
    "budget_kpi",
    "pr",
    "syd",
    "dc_capacity",
    "array_details",
    "reconnect",
    "remarks",
}


@ttl_cache(ttl=300)
def list_tables(db_path: Optional[str] = None) -> list[dict]:
    """
    List all tables with row counts.
    Returns list of {table_name, row_count}.
    """
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        tables_df = con.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name"
        ).fetchdf()
        result = []
        for tbl in tables_df["table_name"].tolist():
            try:
                q_tbl = f'"{tbl}"'
                count_row = con.execute(f"SELECT COUNT(*) FROM {q_tbl}").fetchone()
                row_count = int(count_row[0]) if count_row else 0
            except Exception:
                row_count = -1
            result.append({"table_name": tbl, "row_count": row_count})
        return result
    finally:
        con.close()


@ttl_cache(ttl=300)
def get_table_schema(table_name: str, db_path: Optional[str] = None) -> list[dict]:
    """
    Return column schema for a table via PRAGMA table_info().
    Returns list of {cid, name, type, notnull, dflt_value, pk}.
    Table name is validated against KNOWN_TABLES to prevent injection.
    """
    safe_name = table_name.strip().lower()
    # Allow known tables OR site-specific tables (single-word identifiers)
    if safe_name not in KNOWN_TABLES:
        if not safe_name.replace("_", "").replace("-", "").isalnum():
            raise ValueError(f"Invalid table name: {table_name!r}")

    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        df = con.execute(f"pragma table_info('{safe_name}')").fetchdf()
        return df.to_dict(orient="records") if not df.empty else []
    finally:
        con.close()


@ttl_cache(ttl=300)
def get_table_sample(
    table_name: str, limit: int = 10, db_path: Optional[str] = None
) -> list[dict]:
    """Return first N rows of a table. Table name is validated."""
    safe_name = table_name.strip().lower()
    if not safe_name.replace("_", "").replace("-", "").isalnum():
        raise ValueError(f"Invalid table name: {table_name!r}")

    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        df = con.execute(
            f'SELECT * FROM "{safe_name}" LIMIT ?', [min(limit, 100)]
        ).fetchdf()
        # Serialise date columns
        for col in df.select_dtypes(include=["object", "datetime64[ns]"]).columns:
            df[col] = df[col].astype(str)
        return df.to_dict(orient="records")
    finally:
        con.close()


# ---------------------------------------------------------------------------
# Supabase: site access control (dashboard_users) + master_db lookups
# ---------------------------------------------------------------------------

def _find_col(row: dict, target: str) -> str | None:
    """Return the actual column key whose name matches target (case-insensitive)."""
    return next((k for k in row if k.lower() == target.lower()), None)


@ttl_cache(ttl=120)
def get_allowed_sites(username: str) -> list[str]:
    """
    Return the list of sites the user is allowed to see.
    Reads dashboard_users.site and handles four cases:
      - specific site   → ["GSPL"]
      - comma-separated → ["GSPL", "ASPL"]
      - "all"           → all distinct site_names from master_db
      - NULL / empty    → []
    """
    sb = get_supabase_client(prefer_service_role=True)
    res = (
        sb.table("dashboard_users")
        .select("site")
        .ilike("username", username.strip())
        .limit(1)
        .execute()
    )
    data = getattr(res, "data", None) or []
    if not data:
        return []

    # Use case-insensitive key lookup for the "site" column
    site_key = _find_col(data[0], "site")
    site_val = (data[0].get(site_key or "site") or "").strip() if site_key else ""
    if not site_val:
        return []

    if site_val.lower() == "all":
        # Fetch all distinct site names from master_db
        res2 = sb.table("master_db").select("*").limit(1).execute()
        d2 = getattr(res2, "data", None) or []
        if not d2:
            return []
        sn_key = _find_col(d2[0], "site_name") or "site_name"
        # Paginate to get all rows (Supabase default cap is 1000)
        all_sites: set[str] = set()
        offset = 0
        page = 1000
        while True:
            r = (
                sb.table("master_db")
                .select(sn_key)
                .range(offset, offset + page - 1)
                .execute()
            )
            rows = getattr(r, "data", None) or []
            for row in rows:
                v = row.get(sn_key)
                if v:
                    all_sites.add(str(v).strip())
            if len(rows) < page:
                break
            offset += page
        return sorted(all_sites)

    return sorted({s.strip() for s in site_val.split(",") if s.strip()})


@ttl_cache(ttl=300)
def _fetch_distinct_col(site_name: str, col_target: str) -> list[str]:
    """
    Fetch distinct values of `col_target` from master_db for the given site_name.
    Uses case-insensitive column name matching and ilike for site_name comparison.
    Paginates to bypass the Supabase 1000-row default limit.
    Results are cached for 5 minutes — master_db changes infrequently.
    """
    sb = get_supabase_client(prefer_service_role=True)

    # First, probe one row to discover the real column names
    probe = (
        sb.table("master_db")
        .select("*")
        .ilike("site_name", site_name)
        .limit(1)
        .execute()
    )
    probe_data = getattr(probe, "data", None) or []
    if not probe_data:
        return []

    sn_key  = _find_col(probe_data[0], "site_name") or "site_name"
    val_key = _find_col(probe_data[0], col_target)
    if not val_key:
        return []

    # Paginate through all rows for this site
    results: set[str] = set()
    offset = 0
    page = 1000
    while True:
        r = (
            sb.table("master_db")
            .select(f"{sn_key},{val_key}")
            .ilike(sn_key, site_name)
            .range(offset, offset + page - 1)
            .execute()
        )
        rows = getattr(r, "data", None) or []
        for row in rows:
            v = row.get(val_key)
            if v:
                results.add(str(v).strip())
        if len(rows) < page:
            break
        offset += page

    return sorted(results)


def get_master_locations(site_name: str) -> list[str]:
    """Return distinct locations for a site from master_db."""
    return _fetch_distinct_col(site_name, "location")


def get_master_equipment(site_name: str) -> list[str]:
    """Return distinct equipment for a site from master_db."""
    return _fetch_distinct_col(site_name, "equipment")
