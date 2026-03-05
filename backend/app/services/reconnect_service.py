"""
services/reconnect_service.py — DSM reconnect data service.

Ported from reconnect_dsm.py.
SQL queries are copied verbatim; @st.cache_data replaced with @ttl_cache.
The DSM calculation engine (compute_slot_row, band logic) is left in place
as pure Python — it has no Streamlit dependency and runs unchanged.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Optional

from app.database import get_cached_duckdb_path, get_duckdb_connection
from app.utils.cache import ttl_cache


# ---------------------------------------------------------------------------
# Site / date discovery (verbatim SQL from reconnect_dsm.py)
# ---------------------------------------------------------------------------

@ttl_cache(ttl=300)
def get_reconnect_plants(db_path: Optional[str] = None) -> list[str]:
    """SELECT DISTINCT plant_name FROM reconnect ORDER BY plant_name."""
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        result = con.execute("""
            SELECT DISTINCT plant_name
            FROM reconnect
            ORDER BY plant_name
        """).fetchall()
        return [r[0] for r in result] if result else []
    finally:
        con.close()


@ttl_cache(ttl=300)
def get_reconnect_date_range(
    plant_names: tuple[str, ...],
    db_path: Optional[str] = None,
) -> tuple[Optional[date], Optional[date]]:
    if not plant_names:
        return None, None
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        placeholders = ",".join(["?"] * len(plant_names))
        result = con.execute(
            f"""
            SELECT MIN(date) as min_date, MAX(date) as max_date
            FROM reconnect
            WHERE plant_name IN ({placeholders})
            """,
            list(plant_names),
        ).fetchone()
        if result and result[0] and result[1]:
            return result[0], result[1]
        return None, None
    finally:
        con.close()


# ---------------------------------------------------------------------------
# Data loading (verbatim SQL from reconnect_dsm.load_reconnect_data)
# ---------------------------------------------------------------------------

def load_reconnect_data(
    plant_names: list[str],
    start_date: date,
    end_date: date,
    db_path: Optional[str] = None,
) -> list[dict]:
    """
    Load raw reconnect rows.
    SQL is verbatim from reconnect_dsm.load_reconnect_data.
    Returns serialisable list[dict] (dates as ISO strings).
    """
    if not plant_names:
        return []
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        placeholders = ",".join(["?"] * len(plant_names))
        query = f"""
            SELECT
                plant_name,
                date,
                time,
                block,
                forecast_da_mw,
                actual_mw,
                accepted_schedule_eod_mw,
                generated_schedule_mw
            FROM reconnect
            WHERE plant_name IN ({placeholders})
              AND date >= ?
              AND date <= ?
            ORDER BY plant_name, date, block
        """
        params: list[Any] = list(plant_names) + [start_date, end_date]
        df = con.execute(query, params).fetchdf()

        if df.empty:
            return []

        # Serialise date/time columns
        if "date" in df.columns:
            df["date"] = df["date"].astype(str)
        if "time" in df.columns:
            df["time"] = df["time"].astype(str)

        return df.to_dict(orient="records")
    finally:
        con.close()
