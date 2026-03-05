"""models/operation.py — Operation Theatre schemas."""
from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel


class EquipmentRow(BaseModel):
    equipment_name: str
    pr_percent: Optional[float] = None
    syd_percent: Optional[float] = None


class EquipmentDelta(BaseModel):
    equipment_name: str
    pr_date1: Optional[float] = None
    pr_date2: Optional[float] = None
    pr_delta: Optional[float] = None
    syd_date1: Optional[float] = None
    syd_date2: Optional[float] = None
    syd_delta: Optional[float] = None


class OTResponse(BaseModel):
    site_name: str
    date1: date
    date2: date
    equipment_deltas: list[EquipmentDelta]


class OTQueryParams(BaseModel):
    site_name: str
    date1: date
    date2: date
