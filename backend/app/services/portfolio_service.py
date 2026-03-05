"""
services/portfolio_service.py — Portfolio analytics service.

Ported from portfolio_analytics.py.
All SQL is copied verbatim; @st.cache_data replaced with @ttl_cache.
Plotly chart code is NOT ported — the React frontend renders charts using
the raw data returned by these functions.
"""
from __future__ import annotations

from datetime import date
from typing import Any, Optional

import pandas as pd

from app.database import get_cached_duckdb_path, get_duckdb_connection
from app.models.portfolio import PortfolioSummary
from app.utils.cache import ttl_cache


def _sql_in_list(n: int) -> str:
    return "(" + ",".join(["?"] * n) + ")"


# ---------------------------------------------------------------------------
# Site / date discovery (from portfolio_analytics.py)
# ---------------------------------------------------------------------------

@ttl_cache(ttl=300)
def list_sites_from_budget(db_path: Optional[str] = None) -> list[str]:
    """SELECT distinct site_name FROM budget_kpi ORDER BY site_name."""
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        rows = con.execute(
            "select distinct site_name from budget_kpi order by site_name"
        ).fetchall()
        return [r[0] for r in rows]
    finally:
        con.close()


@ttl_cache(ttl=300)
def date_bounds_from_budget(
    db_path: Optional[str] = None,
) -> tuple[Optional[date], Optional[date]]:
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        row = con.execute(
            "select min(date) as dmin, max(date) as dmax from budget_kpi"
        ).fetchone()
        if not row:
            return None, None
        return row[0], row[1]
    finally:
        con.close()


# ---------------------------------------------------------------------------
# Raw joined data (verbatim from portfolio_analytics.fetch_raw_data)
# ---------------------------------------------------------------------------

@ttl_cache(ttl=300)
def fetch_raw_data(
    sites: tuple[str, ...],  # tuple for hashability with @ttl_cache
    d1: date,
    d2: date,
    db_path: Optional[str] = None,
) -> list[dict]:
    """
    Budget_kpi LEFT JOIN daily_kpi — site/date level rows.
    SQL copied verbatim from portfolio_analytics.fetch_raw_data.
    """
    if not sites:
        return []
    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        in_clause = _sql_in_list(len(sites))
        params: list[Any] = [*sites, d1, d2]
        df = con.execute(
            f"""
            select
              b.site_name,
              b.date,
              b.b_energy_kwh,
              b.b_poa,
              b.b_pa_percent,
              b.b_ga_percent,
              d.abt_export_kwh,
              d.poa,
              d.pa_percent,
              d.ga_percent
            from budget_kpi b
            left join daily_kpi d
              on d.site_name = b.site_name and d.date = b.date
            where b.site_name in {in_clause}
              and b.date between ? and ?
            order by b.site_name, b.date
            """,
            params,
        ).fetchdf()
        # Convert dates to ISO strings for JSON serialisation
        if "date" in df.columns:
            df["date"] = df["date"].astype(str)
        return df.to_dict(orient="records")
    finally:
        con.close()


# ---------------------------------------------------------------------------
# Aggregation (verbatim from portfolio_analytics.compute_aggregates)
# ---------------------------------------------------------------------------

@ttl_cache(ttl=300)
def compute_aggregates(
    sites: tuple[str, ...],
    d1: date,
    d2: date,
    db_path: Optional[str] = None,
) -> PortfolioSummary:
    """
    Weighted aggregate KPIs across sites and date range.
    Aggregation rules unchanged from portfolio_analytics.compute_aggregates:
      - Energy: SUM
      - POA/PA/GA: energy-weighted average
    """
    if not sites:
        return PortfolioSummary()

    path = db_path or get_cached_duckdb_path()
    con = get_duckdb_connection(path)
    try:
        in_clause = _sql_in_list(len(sites))
        params: list[Any] = [*sites, d1, d2]

        b = con.execute(
            f"""
            select
              coalesce(sum(b_energy_kwh), 0) as b_energy,
              coalesce(sum(b_poa * b_energy_kwh), 0) as b_poa_w,
              coalesce(sum(b_pa_percent * b_energy_kwh), 0) as b_pa_w,
              coalesce(sum(b_ga_percent * b_energy_kwh), 0) as b_ga_w
            from budget_kpi
            where site_name in {in_clause}
              and date between ? and ?
            """,
            params,
        ).fetchone()

        a = con.execute(
            f"""
            select
              coalesce(sum(abt_export_kwh), 0) as a_energy,
              coalesce(sum(poa * abt_export_kwh), 0) as a_poa_w,
              coalesce(sum(pa_percent * abt_export_kwh), 0) as a_pa_w,
              coalesce(sum(ga_percent * abt_export_kwh), 0) as a_ga_w
            from daily_kpi
            where site_name in {in_clause}
              and date between ? and ?
            """,
            params,
        ).fetchone()

        b_energy = float(b[0] or 0.0)
        a_energy = float(a[0] or 0.0)

        b_poa = float(b[1] or 0.0) / b_energy if b_energy else 0.0
        b_pa  = float(b[2] or 0.0) / b_energy if b_energy else 0.0
        b_ga  = float(b[3] or 0.0) / b_energy if b_energy else 0.0

        a_poa = float(a[1] or 0.0) / a_energy if a_energy else 0.0
        a_pa  = float(a[2] or 0.0) / a_energy if a_energy else 0.0
        a_ga  = float(a[3] or 0.0) / a_energy if a_energy else 0.0

        return PortfolioSummary(
            b_energy_kwh=b_energy,
            a_energy_kwh=a_energy,
            b_poa=b_poa,
            a_poa=a_poa,
            b_pa=b_pa,
            a_pa=a_pa,
            b_ga=b_ga,
            a_ga=a_ga,
            energy_gap_kwh=b_energy - a_energy,
        )
    finally:
        con.close()
