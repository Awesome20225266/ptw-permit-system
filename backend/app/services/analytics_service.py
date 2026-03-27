"""
services/analytics_service.py — Low-level per-site KPI helpers.

Ported from dashboard.py (list_sites, get_daily_row, get_budget_row,
get_pr_equipment, get_syd_equipment, get_available_dates).

All SQL is copied verbatim; @st.cache_data replaced with @ttl_cache.
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
def list_sites(db_path: Optional[str] = None) -> list[str]:
    """SELECT distinct site_name FROM daily_kpi ORDER BY site_name."""
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        rows = con.execute(
            "select distinct site_name from daily_kpi order by site_name"
        ).fetchall()
        return [r[0] for r in rows]
    finally:
        con.close()


@ttl_cache(ttl=300)
def get_available_dates(site_name: str, db_path: Optional[str] = None) -> list[date]:
    """All distinct dates for a given site in daily_kpi."""
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        rows = con.execute(
            "select distinct date from daily_kpi where site_name = ? order by date",
            [site_name],
        ).fetchall()
        return [r[0] for r in rows]
    finally:
        con.close()


# ---------------------------------------------------------------------------
# Per-site, per-date KPI rows (exact queries from dashboard.py)
# ---------------------------------------------------------------------------

@ttl_cache(ttl=300)
def get_daily_row(site_name: str, d: date, db_path: Optional[str] = None) -> list[dict]:
    """SELECT * FROM daily_kpi WHERE site_name=? AND date=?"""
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        df = con.execute(
            """
            select *
            from daily_kpi
            where site_name = ? and date = ?
            """,
            [site_name, d],
        ).fetchdf()
        return df.to_dict(orient="records")
    finally:
        con.close()


@ttl_cache(ttl=300)
def get_budget_row(site_name: str, d: date, db_path: Optional[str] = None) -> list[dict]:
    """SELECT * FROM budget_kpi WHERE site_name=? AND date=?"""
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        df = con.execute(
            """
            select *
            from budget_kpi
            where site_name = ? and date = ?
            """,
            [site_name, d],
        ).fetchdf()
        return df.to_dict(orient="records")
    finally:
        con.close()


@ttl_cache(ttl=300)
def get_pr_equipment(
    site_name: str, d: date, db_path: Optional[str] = None
) -> list[dict]:
    """SELECT equipment_name, pr_percent FROM pr WHERE site_name=? AND date=?"""
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        df = con.execute(
            """
            select equipment_name, pr_percent
            from pr
            where site_name = ? and date = ?
            order by equipment_name
            """,
            [site_name, d],
        ).fetchdf()
        return df.to_dict(orient="records")
    finally:
        con.close()


@ttl_cache(ttl=300)
def get_syd_equipment(
    site_name: str, d: date, db_path: Optional[str] = None
) -> list[dict]:
    """SELECT equipment_name, syd_percent FROM syd WHERE site_name=? AND date=?"""
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        df = con.execute(
            """
            select equipment_name, syd_percent
            from syd
            where site_name = ? and date = ?
            order by equipment_name
            """,
            [site_name, d],
        ).fetchdf()
        return df.to_dict(orient="records")
    finally:
        con.close()
