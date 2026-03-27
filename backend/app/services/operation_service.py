"""
services/operation_service.py — Operation Theatre service.

Ported from operation_theatre.py.
All SQL is copied verbatim; @st.cache_data replaced with @ttl_cache.
Plotly/AgGrid code is NOT ported — the React frontend handles rendering.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Optional

import pandas as pd

from app.database import get_cached_duckdb_path, get_duckdb_connection
from app.utils.cache import ttl_cache


def _sql_in_list(n: int) -> str:
    return "(" + ",".join(["?"] * n) + ")"


# ---------------------------------------------------------------------------
# Site / date discovery
# ---------------------------------------------------------------------------

@ttl_cache(ttl=300)
def list_sites_from_syd(db_path: Optional[str] = None) -> list[str]:
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        rows = con.execute(
            "select distinct site_name from syd order by site_name"
        ).fetchall()
        return [r[0] for r in rows]
    finally:
        con.close()


@ttl_cache(ttl=300)
def date_bounds_from_syd(
    db_path: Optional[str] = None,
) -> tuple[Optional[date], Optional[date]]:
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        row = con.execute(
            "select min(date) as dmin, max(date) as dmax from syd"
        ).fetchone()
        if not row:
            return None, None
        return row[0], row[1]
    finally:
        con.close()


# ---------------------------------------------------------------------------
# SYD queries (verbatim SQL from operation_theatre.py)
# ---------------------------------------------------------------------------

@ttl_cache(ttl=300)
def fetch_latest_syd(
    sites: tuple[str, ...], db_path: Optional[str] = None
) -> list[dict]:
    """Case A: Most recent date per site — verbatim from fetch_latest_syd."""
    if not sites:
        return []
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        in_clause = _sql_in_list(len(sites))
        params: list[Any] = [*sites]
        df = con.execute(
            f"""
            select
              s.site_name,
              s.equipment_name,
              s.date,
              s.syd_percent * 100.0 as syd_dev_pct
            from syd s
            join (
              select site_name, max(date) as max_date
              from syd
              where site_name in {in_clause}
              group by 1
            ) m
              on m.site_name = s.site_name
             and m.max_date = s.date
            where s.site_name in {in_clause}
            order by s.site_name, s.equipment_name
            """,
            [*params, *params],
        ).fetchdf()
        if "date" in df.columns:
            df["date"] = df["date"].astype(str)
        return df.to_dict(orient="records")
    finally:
        con.close()


@ttl_cache(ttl=300)
def fetch_syd_for_date(
    sites: tuple[str, ...], d: date, db_path: Optional[str] = None
) -> list[dict]:
    """Case A': Single date — verbatim from fetch_syd_for_date."""
    if not sites:
        return []
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        in_clause = _sql_in_list(len(sites))
        df = con.execute(
            f"""
            select
              site_name,
              equipment_name,
              date,
              syd_percent * 100.0 as syd_dev_pct
            from syd
            where site_name in {in_clause}
              and date = ?
            order by 1,2
            """,
            [*sites, d],
        ).fetchdf()
        if "date" in df.columns:
            df["date"] = df["date"].astype(str)
        return df.to_dict(orient="records")
    finally:
        con.close()


@ttl_cache(ttl=300)
def fetch_median_syd(
    sites: tuple[str, ...], d1: date, d2: date, db_path: Optional[str] = None
) -> list[dict]:
    """Case B: Date range — median(syd_percent*100) per site/equipment."""
    if not sites:
        return []
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        in_clause = _sql_in_list(len(sites))
        df = con.execute(
            f"""
            select
              site_name,
              equipment_name,
              median(syd_percent * 100.0) as syd_dev_pct
            from syd
            where site_name in {in_clause}
              and date between ? and ?
            group by 1,2
            order by 1,2
            """,
            [*sites, d1, d2],
        ).fetchdf()
        return df.to_dict(orient="records")
    finally:
        con.close()


# ---------------------------------------------------------------------------
# PR queries (verbatim SQL from operation_theatre.py)
# ---------------------------------------------------------------------------

@ttl_cache(ttl=300)
def fetch_latest_pr(
    sites: tuple[str, ...], db_path: Optional[str] = None
) -> list[dict]:
    """Case A: PR aligned to each site's most recent SYD date."""
    if not sites:
        return []
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        in_clause = _sql_in_list(len(sites))
        params: list[Any] = [*sites]
        df = con.execute(
            f"""
            select
              p.site_name,
              p.equipment_name,
              p.date,
              p.pr_percent * 100.0 as pr_pct
            from pr p
            join (
              select site_name, max(date) as max_date
              from syd
              where site_name in {in_clause}
              group by 1
            ) m
              on m.site_name = p.site_name
             and m.max_date = p.date
            where p.site_name in {in_clause}
            order by p.site_name, p.equipment_name
            """,
            [*params, *params],
        ).fetchdf()
        if "date" in df.columns:
            df["date"] = df["date"].astype(str)
        return df.to_dict(orient="records")
    finally:
        con.close()


@ttl_cache(ttl=300)
def fetch_pr_for_date(
    sites: tuple[str, ...], d: date, db_path: Optional[str] = None
) -> list[dict]:
    if not sites:
        return []
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        in_clause = _sql_in_list(len(sites))
        df = con.execute(
            f"""
            select
              site_name,
              equipment_name,
              date,
              pr_percent * 100.0 as pr_pct
            from pr
            where site_name in {in_clause}
              and date = ?
            order by 1,2
            """,
            [*sites, d],
        ).fetchdf()
        if "date" in df.columns:
            df["date"] = df["date"].astype(str)
        return df.to_dict(orient="records")
    finally:
        con.close()


@ttl_cache(ttl=300)
def fetch_median_pr(
    sites: tuple[str, ...], d1: date, d2: date, db_path: Optional[str] = None
) -> list[dict]:
    if not sites:
        return []
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        in_clause = _sql_in_list(len(sites))
        df = con.execute(
            f"""
            select
              site_name,
              equipment_name,
              median(pr_percent * 100.0) as pr_pct
            from pr
            where site_name in {in_clause}
              and date between ? and ?
            group by 1,2
            order by 1,2
            """,
            [*sites, d1, d2],
        ).fetchdf()
        return df.to_dict(orient="records")
    finally:
        con.close()
