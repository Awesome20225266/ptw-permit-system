"""
routers/portfolio.py — Portfolio analytics endpoints.

GET /api/v1/portfolio/sites
GET /api/v1/portfolio/date-bounds
GET /api/v1/portfolio/summary?sites=A&sites=B&date_from=&date_to=
GET /api/v1/portfolio/raw?sites=A&sites=B&date_from=&date_to=
"""
from __future__ import annotations
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, Query
from app.models.auth import UserInfo
from app.models.portfolio import PortfolioSummary
from app.services import portfolio_service as svc
from app.utils.security import get_current_user

router = APIRouter()

@router.get("/sites")
async def portfolio_sites(_user: UserInfo = Depends(get_current_user)) -> list[str]:
    return svc.list_sites_from_budget()

@router.get("/date-bounds")
async def portfolio_date_bounds(_user: UserInfo = Depends(get_current_user)) -> dict:
    dmin, dmax = svc.date_bounds_from_budget()
    return {"date_min": dmin.isoformat() if dmin else None, "date_max": dmax.isoformat() if dmax else None}

@router.get("/summary", response_model=PortfolioSummary)
async def portfolio_summary(
    sites: list[str] = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    _user: UserInfo = Depends(get_current_user),
) -> PortfolioSummary:
    return svc.compute_aggregates(tuple(sites), date_from, date_to)

@router.get("/raw")
async def portfolio_raw(
    sites: list[str] = Query(...),
    date_from: date = Query(...),
    date_to: date = Query(...),
    _user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    return svc.fetch_raw_data(tuple(sites), date_from, date_to)
