"""models/portfolio.py — Portfolio analytics schemas."""
from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel


class PortfolioSummary(BaseModel):
    """Aggregated KPIs across selected sites and date range."""
    b_energy_kwh: float = 0.0
    a_energy_kwh: float = 0.0
    b_poa: float = 0.0
    a_poa: float = 0.0
    b_pa: float = 0.0
    a_pa: float = 0.0
    b_ga: float = 0.0
    a_ga: float = 0.0
    energy_gap_kwh: float = 0.0
    pr_percent: Optional[float] = None


class PortfolioRawRow(BaseModel):
    """One site/date row from the budget_kpi + daily_kpi join."""
    site_name: str
    date: date
    b_energy_kwh: Optional[float] = None
    b_poa: Optional[float] = None
    b_pa_percent: Optional[float] = None
    b_ga_percent: Optional[float] = None
    abt_export_kwh: Optional[float] = None
    poa: Optional[float] = None
    pa_percent: Optional[float] = None
    ga_percent: Optional[float] = None


class PortfolioQueryParams(BaseModel):
    sites: list[str]
    date_from: date
    date_to: date
