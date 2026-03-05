"""
routers/operation.py — Operation Theatre endpoints.

GET /api/v1/operation/sites
GET /api/v1/operation/date-bounds
GET /api/v1/operation/syd?sites=A&sites=B[&date=][&date_from=&date_to=]
GET /api/v1/operation/pr?sites=A&sites=B[&date=][&date_from=&date_to=]
"""
from __future__ import annotations
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from app.models.auth import UserInfo
from app.services import operation_service as svc
from app.utils.security import get_current_user

router = APIRouter()

@router.get("/sites")
async def operation_sites(_user: UserInfo = Depends(get_current_user)) -> list[str]:
    return svc.list_sites_from_syd()

@router.get("/date-bounds")
async def operation_date_bounds(_user: UserInfo = Depends(get_current_user)) -> dict:
    dmin, dmax = svc.date_bounds_from_syd()
    return {"date_min": dmin.isoformat() if dmin else None, "date_max": dmax.isoformat() if dmax else None}

@router.get("/syd")
async def operation_syd(
    sites: list[str] = Query(...),
    date: Optional[date] = Query(default=None),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    _user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    """
    Three query modes matching Operation Theatre behaviour:
    - date_from + date_to  → median over range (Case B)
    - date only            → exact date (Case A')
    - neither              → latest per site (Case A)
    """
    t = tuple(sites)
    if date_from and date_to:
        return svc.fetch_median_syd(t, date_from, date_to)
    if date:
        return svc.fetch_syd_for_date(t, date)
    return svc.fetch_latest_syd(t)

@router.get("/pr")
async def operation_pr(
    sites: list[str] = Query(...),
    date: Optional[date] = Query(default=None),
    date_from: Optional[date] = Query(default=None),
    date_to: Optional[date] = Query(default=None),
    _user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    t = tuple(sites)
    if date_from and date_to:
        return svc.fetch_median_pr(t, date_from, date_to)
    if date:
        return svc.fetch_pr_for_date(t, date)
    return svc.fetch_latest_pr(t)
