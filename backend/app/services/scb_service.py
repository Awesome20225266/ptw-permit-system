"""
services/scb_service.py — SCB Operation Theatre service.

Ported from scb_ot.py (Zelestra-Dashboard).
Implements the strict Excel-style median-based SCB deviation logic.

Pipeline:
1) Fetch raw time-series from site table (06:00–18:00 window)
2) Per-SCB outlier nulling: value > 3 * SCB_median → nullify only that cell
3) Aggregate per SCB: SCB_sum = sum(valid values) per (inv_stn_name, inv_name, scb_name)
4) Capacity normalization: normalized_value = SCB_sum / load_kwp from array_details
5) Median benchmark across SCBs (median of normalized_value)
6) Deviation: ((normalized_value / median_value) - 1) * 100
"""
from __future__ import annotations

from datetime import date
from typing import Optional

import numpy as np
import pandas as pd

from app.database import get_cached_duckdb_path, get_duckdb_connection
from app.utils.cache import ttl_cache

TIME_START = "06:00"
TIME_END = "23:59:59"
ABS_SCB_MAX = 1000.0


def _sanitize_table_name(site_name: str) -> str:
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


def _sql_date_expr(col: str) -> str:
    c = _quote(col)
    return f"coalesce(try_cast({c} as date), try_strptime(cast({c} as varchar), '%d-%m-%Y')::date)"


def _sql_time_expr(col: str) -> str:
    c = _quote(col)
    return (
        f"coalesce("
        f"try_strptime(cast({c} as varchar), '%H:%M'), "
        f"try_strptime(cast({c} as varchar), '%H:%M:%S')"
        f")::time"
    )


def _norm_key(s: object) -> str:
    return str(s or "").strip().lower()


# ─── Site listing ────────────────────────────────────────────────────────────

@ttl_cache(ttl=300)
def list_sites(db_path: Optional[str] = None) -> list[str]:
    """Sites come from array_details, same as raw_analyser."""
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


# ─── Date bounds ─────────────────────────────────────────────────────────────

@ttl_cache(ttl=300)
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


# ─── Array capacities ────────────────────────────────────────────────────────

@ttl_cache(ttl=600)
def get_array_capacities(site_name: str, db_path: Optional[str] = None) -> pd.DataFrame:
    """
    Load load_kwp per (site, inv_stn, inv, scb) from array_details.
    Returns a DataFrame with normalised key columns for joining.
    """
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        df = con.execute("""
            SELECT
                trim(site_name)     AS site_name,
                trim(inv_stn_name)  AS inv_stn_name,
                trim(inv_name)      AS inv_name,
                trim(scb_name)      AS scb_name,
                load_kwp
            FROM array_details
            WHERE lower(trim(site_name)) = lower(trim(?))
              AND scb_name IS NOT NULL AND trim(scb_name) != ''
        """, [site_name]).fetchdf()
    except Exception:
        return pd.DataFrame(columns=["site_name", "inv_stn_name", "inv_name", "scb_name", "load_kwp"])
    finally:
        con.close()

    if df is None or df.empty:
        return pd.DataFrame(columns=["site_name", "inv_stn_name", "inv_name", "scb_name", "load_kwp"])

    for col in ["site_name", "inv_stn_name", "inv_name", "scb_name"]:
        df[f"{col}_key"] = df[col].map(_norm_key)

    return df


# ─── SCB column names from the site table ────────────────────────────────────

@ttl_cache(ttl=600)
def get_scb_columns(site_name: str, db_path: Optional[str] = None) -> list[str]:
    """Return SCB column names (SCB1, SCB2, …) from the site table."""
    path = db_path or get_cached_duckdb_path()
    table = _sanitize_table_name(site_name)
    con = get_duckdb_connection(path)
    try:
        info = con.execute(f"pragma table_info({_quote(table)})").fetchdf()
        if info is None or info.empty:
            return []
        cols = [str(c) for c in info["name"].tolist()]
        return [c for c in cols if str(c).upper().startswith("SCB")]
    except Exception:
        return []
    finally:
        con.close()


# ─── Full SCB OT pipeline ────────────────────────────────────────────────────

def run_scb_ot(
    site_name: str,
    from_date: date,
    to_date: date,
    threshold: float = -20.0,
    db_path: Optional[str] = None,
) -> dict:
    """
    Full SCB Operation Theatre analysis.
    Returns the structured result dict expected by the frontend.
    """
    path = db_path or get_cached_duckdb_path()
    table = _sanitize_table_name(site_name)

    scb_cols = get_scb_columns(site_name, path)
    if not scb_cols:
        return _empty_result(site_name, from_date, to_date, threshold, "No SCB columns found in table")

    # Step 1: Fetch raw data in time window
    df_raw = _fetch_raw(path, table, from_date, to_date, scb_cols)
    if df_raw is None or df_raw.empty:
        return _empty_result(site_name, from_date, to_date, threshold, "No data in selected range")

    # Step 2–6: Compute deviations
    result_df = _compute_deviation(df_raw, site_name, scb_cols, path)
    if result_df is None or result_df.empty:
        return _empty_result(site_name, from_date, to_date, threshold, "Deviation computation returned no rows")

    deviations = []
    for _, row in result_df.iterrows():
        deviations.append({
            "label":          str(row.get("scb_label", "")),
            "inv_stn_name":   str(row.get("inv_stn_name", "")),
            "inv_name":       str(row.get("inv_name", "")),
            "scb_name":       str(row.get("scb_name", "")),
            "deviation_pct":  float(row.get("deviation_pct", 0.0)),
            "normalized_value": float(row.get("normalized_value", 0.0)) if pd.notna(row.get("normalized_value")) else None,
        })

    below = [d for d in deviations if d["deviation_pct"] <= threshold]
    above = [d for d in deviations if d["deviation_pct"] > threshold]
    devs  = [d["deviation_pct"] for d in deviations]

    # Build insights
    insights = []
    if below:
        insights.append({"category": f"Below {threshold}%", "count": len(below), "labels": [d["label"] for d in below[:10]]})

    return {
        "site_name":   site_name,
        "from_date":   from_date.isoformat(),
        "to_date":     to_date.isoformat(),
        "threshold":   threshold,
        "deviations":  deviations,
        "deviations_below_threshold": below,
        "insights":    insights,
        "kpis": {
            "total_scbs":        len(deviations),
            "below_threshold":   len(below),
            "above_threshold":   len(above),
            "max_deviation_pct": max(devs) if devs else None,
            "min_deviation_pct": min(devs) if devs else None,
            "scb_cols_count":    len(scb_cols),
        },
    }


# ─── Internal helpers ─────────────────────────────────────────────────────────

def _empty_result(site_name: str, from_date: date, to_date: date, threshold: float, reason: str) -> dict:
    return {
        "site_name": site_name,
        "from_date": from_date.isoformat(),
        "to_date":   to_date.isoformat(),
        "threshold": threshold,
        "deviations": [],
        "deviations_below_threshold": [],
        "insights":  [{"category": "info", "count": 0, "labels": [reason]}],
        "kpis": {
            "total_scbs": 0, "below_threshold": 0, "above_threshold": 0,
            "max_deviation_pct": None, "min_deviation_pct": None, "scb_cols_count": 0,
        },
    }


def _fetch_raw(db_path: str, table: str, from_date: date, to_date: date, scb_cols: list[str]) -> pd.DataFrame:
    date_expr = _sql_date_expr("date")
    time_expr = _sql_time_expr("timestamp")
    cols = ["inv_stn_name", "inv_name"] + list(scb_cols)
    select_list = ", ".join([_quote(c) for c in cols])

    sql = f"""
        SELECT {select_list}
        FROM {_quote(table)}
        WHERE {date_expr} BETWEEN ? AND ?
          AND {time_expr} BETWEEN time '{TIME_START}' AND time '{TIME_END}'
    """
    con = get_duckdb_connection(db_path)
    try:
        return con.execute(sql, [from_date, to_date]).fetchdf()
    except Exception:
        return pd.DataFrame()
    finally:
        con.close()


def _compute_deviation(
    df_raw: pd.DataFrame,
    site_name: str,
    scb_cols: list[str],
    db_path: str,
) -> pd.DataFrame:
    base_cols = ["inv_stn_name", "inv_name"]
    empty = pd.DataFrame(columns=[*base_cols, "scb_name", "scb_sum", "load_kwp", "normalized_value", "median_value", "deviation_pct", "scb_label"])

    if df_raw is None or df_raw.empty or not scb_cols:
        return empty

    df = df_raw.copy()
    for c in base_cols:
        df[c] = df[c].astype(str)

    # Melt to long form
    long_df = df.melt(id_vars=base_cols, value_vars=scb_cols, var_name="scb_name", value_name="scb_value")
    long_df["scb_name"] = long_df["scb_name"].astype(str)
    long_df["scb_value"] = pd.to_numeric(long_df["scb_value"], errors="coerce")

    # Per-SCB median
    def safe_median(s: pd.Series) -> Optional[float]:
        s2 = pd.to_numeric(s, errors="coerce").dropna()
        return float(s2.median()) if not s2.empty else None

    scb_median = long_df.groupby([*base_cols, "scb_name"], dropna=False)["scb_value"].transform(
        lambda s: pd.to_numeric(s, errors="coerce").median()
    )
    long_df["scb_median"] = scb_median

    # Drop SCBs with median <= 0
    bad = long_df["scb_median"].isna() | (pd.to_numeric(long_df["scb_median"], errors="coerce") <= 0)
    long_df.loc[bad, "scb_value"] = pd.NA

    # Outlier nulling: value > 3 * SCB_median
    thr = pd.to_numeric(long_df["scb_median"], errors="coerce") * 3.0
    is_outlier = pd.to_numeric(long_df["scb_value"], errors="coerce") > thr
    long_df.loc[is_outlier, "scb_value"] = pd.NA

    # Aggregate per SCB
    sums = (
        long_df.dropna(subset=["scb_value"])
        .groupby([*base_cols, "scb_name"], as_index=False)["scb_value"]
        .sum()
        .rename(columns={"scb_value": "scb_sum"})
    )
    if sums.empty:
        return empty

    # Join to array_details for capacity normalization
    cap = get_array_capacities(site_name, db_path)
    if cap.empty:
        return empty

    sums["site_name"] = site_name
    for c in ["site_name", "inv_stn_name", "inv_name", "scb_name"]:
        sums[f"{c}_key"] = sums[c].map(_norm_key)

    joined = sums.merge(
        cap[["site_name_key", "inv_stn_name_key", "inv_name_key", "scb_name_key", "load_kwp"]],
        on=["site_name_key", "inv_stn_name_key", "inv_name_key", "scb_name_key"],
        how="left",
    )

    joined["load_kwp"] = pd.to_numeric(joined["load_kwp"], errors="coerce")
    joined = joined.dropna(subset=["load_kwp"])
    joined = joined[joined["load_kwp"] > 0]
    if joined.empty:
        return empty

    joined["normalized_value"] = joined["scb_sum"] / joined["load_kwp"]

    # Median benchmark
    median_val = float(joined["normalized_value"].median())
    if pd.isna(median_val) or median_val == 0:
        return empty

    if len(joined) == 1:
        joined["deviation_pct"] = 0.0
    else:
        joined["deviation_pct"] = ((joined["normalized_value"] / median_val) - 1.0) * 100.0

    joined["median_value"] = median_val
    joined["scb_label"] = (
        joined["inv_stn_name"].astype(str) + "-"
        + joined["inv_name"].astype(str) + "-"
        + joined["scb_name"].astype(str)
    )

    return joined[[*base_cols, "scb_name", "scb_sum", "load_kwp", "normalized_value", "median_value", "deviation_pct", "scb_label"]]
