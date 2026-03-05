"""models/analytics.py — KPI row schemas (mirrors DuckDB table shapes)."""
from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel


class DailyKPIRow(BaseModel):
    site_name: str
    date: date
    abt_export_kwh: Optional[float] = None
    poa: Optional[float] = None
    pa_percent: Optional[float] = None
    ga_percent: Optional[float] = None


class BudgetKPIRow(BaseModel):
    site_name: str
    date: date
    b_energy_kwh: Optional[float] = None
    b_poa: Optional[float] = None
    b_pa_percent: Optional[float] = None
    b_ga_percent: Optional[float] = None


class PRRow(BaseModel):
    site_name: str
    date: date
    equipment_name: str
    pr_percent: Optional[float] = None


class SYDRow(BaseModel):
    site_name: str
    date: date
    equipment_name: str
    syd_percent: Optional[float] = None


class AnalyticsQueryParams(BaseModel):
    site_name: str
    date_from: date
    date_to: date
