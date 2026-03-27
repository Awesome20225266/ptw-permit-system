"""
services/raw_service.py — Raw time-series data service.

Ported from raw_analyser.py (Zelestra-Dashboard).
Uses array_details for hierarchy (site → inv_station → inverter → unit → scb)
and per-site tables (table_name = site_name.lower()) for the actual time series.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from app.database import get_cached_duckdb_path, get_duckdb_connection
from app.utils.cache import ttl_cache

TIME_START = "06:00"
TIME_END = "18:00"


def _sanitize_table_name(site_name: str) -> str:
    """Convert site_name to the DuckDB table name: lowercase + non-alphanum → '_'."""
    s = str(site_name).strip().lower()
    out: list[str] = []
    prev_us = False
    for ch in s:
        if ch.isalnum():
            out.append(ch)
            prev_us = False
        else:
            if not prev_us:
                out.append("_")
                prev_us = True
    return "".join(out).strip("_") or s


def _quote(name: str) -> str:
    return '"' + str(name).replace('"', '""') + '"'


def _num_suffix(s: str) -> int:
    """Natural sort helper: IS1 < IS2 < IS10."""
    s = str(s)
    num = ""
    for ch in reversed(s):
        if ch.isdigit():
            num = ch + num
        else:
            break
    try:
        return int(num) if num else 10 ** 9
    except Exception:
        return 10 ** 9


def _sql_date_expr(col: str) -> str:
    c = _quote(col)
    return f"coalesce(try_cast({c} as date), try_strptime(cast({c} as varchar), '%d-%m-%Y')::date)"


def _sql_time_expr(col: str) -> str:
    c = _quote(col)
    return (
        f"coalesce("
        f"try_cast({c} as time),"
        f"try_strptime(cast({c} as varchar), '%H:%M:%S')::time,"
        f"try_strptime(cast({c} as varchar), '%H:%M')::time"
        f")"
    )


def _table_columns(db_path: str, table: str) -> list[str]:
    con = get_duckdb_connection(db_path)
    try:
        info = con.execute(f"pragma table_info({_quote(table)})").fetchdf()
        return [str(x) for x in info.get("name", []).tolist()]
    except Exception:
        return []
    finally:
        con.close()


# ─── Site listing ────────────────────────────────────────────────────────────

@ttl_cache(ttl=300)
def list_sites(db_path: Optional[str] = None) -> list[str]:
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        rows = con.execute("""
            SELECT DISTINCT trim(site_name) AS site_name
            FROM array_details
            WHERE site_name IS NOT NULL AND trim(site_name) != ''
            ORDER BY 1
        """).fetchall()
        return [str(r[0]) for r in rows if r and r[0] is not None]
    except Exception:
        return []
    finally:
        con.close()


# ─── Hierarchy from array_details ────────────────────────────────────────────

@ttl_cache(ttl=300)
def list_inv_stations(site_name: str, db_path: Optional[str] = None) -> list[str]:
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        rows = con.execute("""
            SELECT DISTINCT trim(inv_stn_name) AS inv_stn_name
            FROM array_details
            WHERE lower(trim(site_name)) = lower(trim(?))
              AND inv_stn_name IS NOT NULL AND trim(inv_stn_name) != ''
            ORDER BY 1
        """, [site_name]).fetchall()
        out = [str(r[0]) for r in rows if r and r[0] is not None]
        return sorted(out, key=lambda x: (_num_suffix(x), x))
    except Exception:
        return []
    finally:
        con.close()


@ttl_cache(ttl=300)
def list_inverters(
    site_name: str,
    inv_stations: list[str],
    db_path: Optional[str] = None,
) -> list[str]:
    if not inv_stations:
        return []
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        placeholders = ", ".join(["?"] * len(inv_stations))
        rows = con.execute(f"""
            SELECT DISTINCT trim(inv_stn_name) AS inv_stn_name, trim(inv_name) AS inv_name
            FROM array_details
            WHERE lower(trim(site_name)) = lower(trim(?))
              AND trim(inv_stn_name) IN ({placeholders})
              AND inv_name IS NOT NULL AND trim(inv_name) != ''
        """, [site_name, *inv_stations]).fetchall()
        out = [str(r[1]) for r in rows if r and r[1] is not None]
        return sorted(list(set(out)), key=lambda x: (_num_suffix(x), x))
    except Exception:
        return []
    finally:
        con.close()


@ttl_cache(ttl=300)
def list_units(
    site_name: str,
    inv_stations: list[str],
    inverters: list[str],
    db_path: Optional[str] = None,
) -> list[str]:
    if not inverters:
        return []
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        params: list = [site_name]
        conditions = ["lower(trim(site_name)) = lower(trim(?))"]
        if inv_stations:
            ph = ", ".join(["?"] * len(inv_stations))
            conditions.append(f"trim(inv_stn_name) IN ({ph})")
            params.extend(inv_stations)
        inv_ph = ", ".join(["?"] * len(inverters))
        conditions.append(f"trim(inv_name) IN ({inv_ph})")
        params.extend(inverters)
        conditions.append("inv_unit_name IS NOT NULL AND trim(inv_unit_name) != ''")

        where = " AND ".join(conditions)
        rows = con.execute(f"""
            SELECT DISTINCT trim(inv_unit_name) AS inv_unit_name
            FROM array_details
            WHERE {where}
            ORDER BY 1
        """, params).fetchall()
        out = [str(r[0]) for r in rows if r and r[0] is not None]
        return sorted(out, key=lambda x: (_num_suffix(x), x))
    except Exception:
        return []
    finally:
        con.close()


def list_scbs(
    site_name: str,
    inv_stations: list[str],
    inverters: list[str],
    units: list[str],
    db_path: Optional[str] = None,
) -> list[dict]:
    """Return SCB entries from array_details for the given filter."""
    if not inverters:
        return []
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        params: list = [site_name]
        conditions = ["lower(trim(site_name)) = lower(trim(?))"]
        if inv_stations:
            ph = ", ".join(["?"] * len(inv_stations))
            conditions.append(f"trim(inv_stn_name) IN ({ph})")
            params.extend(inv_stations)
        inv_ph = ", ".join(["?"] * len(inverters))
        conditions.append(f"trim(inv_name) IN ({inv_ph})")
        params.extend(inverters)
        if units:
            u_ph = ", ".join(["?"] * len(units))
            conditions.append(f"trim(inv_unit_name) IN ({u_ph})")
            params.extend(units)
        conditions.append("scb_name IS NOT NULL AND trim(scb_name) != ''")

        where = " AND ".join(conditions)
        rows = con.execute(f"""
            SELECT
              trim(inv_stn_name) AS inv_stn_name,
              trim(inv_name)     AS inv_name,
              trim(inv_unit_name) AS inv_unit_name,
              trim(scb_name)     AS scb_name
            FROM array_details
            WHERE {where}
        """, params).fetchall()

        seen: set[tuple] = set()
        result = []
        for r in rows:
            key = (str(r[0] or ""), str(r[1] or ""), str(r[2] or ""), str(r[3] or ""))
            if key not in seen:
                seen.add(key)
                result.append({
                    "inv_stn_name": key[0],
                    "inv_name": key[1],
                    "inv_unit_name": key[2],
                    "scb_name": key[3],
                    "col": key[3],
                })
        return sorted(result, key=lambda x: (
            _num_suffix(x["inv_stn_name"]), x["inv_stn_name"],
            _num_suffix(x["inv_name"]),     x["inv_name"],
            _num_suffix(x["scb_name"]),     x["scb_name"],
        ))
    except Exception:
        return []
    finally:
        con.close()


# ─── Date bounds ─────────────────────────────────────────────────────────────

def get_date_bounds(
    site_name: str,
    db_path: Optional[str] = None,
) -> tuple[Optional[date], Optional[date]]:
    path = db_path or get_cached_duckdb_path()
    table = _sanitize_table_name(site_name)
    con = get_duckdb_connection(path)
    try:
        date_expr = _sql_date_expr("date")
        row = con.execute(
            f"SELECT min({date_expr}) as dmin, max({date_expr}) as dmax FROM {_quote(table)}"
        ).fetchone()
        if row and row[0] and row[1]:
            return row[0], row[1]
        return None, None
    except Exception:
        return None, None
    finally:
        con.close()


# ─── Raw time series ─────────────────────────────────────────────────────────

def fetch_raw_timeseries(
    site_name: str,
    from_date: date,
    to_date: date,
    inv_stations: list[str],
    inverters: list[str],
    units: list[str],
    scb_cols: list[str],
    normalize: bool = False,
    db_path: Optional[str] = None,
) -> list[dict]:
    if not scb_cols:
        return []

    path = db_path or get_cached_duckdb_path()
    table = _sanitize_table_name(site_name)

    all_cols = _table_columns(path, table)
    all_lower = {c.lower(): c for c in all_cols}
    has_unit = "inv_unit_name" in all_lower

    # Validate requested SCB columns exist in the table
    valid_scb = [c for c in scb_cols if c in all_lower or c.lower() in all_lower]
    if not valid_scb:
        return []

    date_expr = _sql_date_expr("date")
    time_expr = _sql_time_expr("timestamp")

    base_cols = ["inv_stn_name", "inv_name"]
    if has_unit:
        base_cols.append("inv_unit_name")
    select_cols = base_cols + valid_scb

    where_parts = [
        f"{date_expr} between ? and ?",
        f"{time_expr} between time '{TIME_START}' and time '{TIME_END}'",
    ]
    params: list = [from_date, to_date]

    if inv_stations:
        ph = ", ".join(["?"] * len(inv_stations))
        where_parts.append(f"trim(inv_stn_name) IN ({ph})")
        params.extend(inv_stations)
    if inverters:
        ph = ", ".join(["?"] * len(inverters))
        where_parts.append(f"trim(inv_name) IN ({ph})")
        params.extend(inverters)
    if units and has_unit:
        ph = ", ".join(["?"] * len(units))
        where_parts.append(f"trim(inv_unit_name) IN ({ph})")
        params.extend(units)

    select_list = ", ".join([_quote(c) for c in select_cols])
    sql = f"""
        SELECT
            {date_expr} AS date,
            {time_expr} AS timestamp,
            {select_list}
        FROM {_quote(table)}
        WHERE {' AND '.join(where_parts)}
        ORDER BY {date_expr}, {time_expr}
        LIMIT 100000
    """

    con = get_duckdb_connection(path)
    try:
        df = con.execute(sql, params).fetchdf()
    except Exception as exc:
        raise ValueError(f"Raw timeseries query failed for {table}: {exc}") from exc
    finally:
        con.close()

    if df.empty:
        return []

    for col in ["date", "timestamp"]:
        if col in df.columns:
            df[col] = df[col].astype(str)

    if normalize and valid_scb:
        import numpy as np
        for col in valid_scb:
            if col in df.columns:
                col_max = df[col].max()
                if col_max and col_max > 0:
                    df[col] = df[col] / col_max

    return df.to_dict(orient="records")
