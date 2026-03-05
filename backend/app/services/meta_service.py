"""
services/meta_service.py — DuckDB metadata inspection.

Ported from meta_viewer.py.
Queries use PRAGMA table_info() exactly as the original.
"""
from __future__ import annotations

from typing import Optional

from app.database import get_cached_duckdb_path, get_duckdb_connection
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
