"""
routers/analytics.py — Per-site KPI endpoints.

GET /api/v1/analytics/sites
GET /api/v1/analytics/dates?site_name=...
GET /api/v1/analytics/daily-kpi?site_name=&date=
GET /api/v1/analytics/budget-kpi?site_name=&date=
GET /api/v1/analytics/pr?site_name=&date=
GET /api/v1/analytics/syd?site_name=&date=
"""
from __future__ import annotations
from datetime import date
from fastapi import APIRouter, Depends, Query
from app.models.auth import UserInfo
from app.services import analytics_service as svc
from app.utils.security import get_current_user

router = APIRouter()

@router.get("/sites")
async def get_sites(_user: UserInfo = Depends(get_current_user)) -> list[str]:
    return svc.list_sites()

@router.get("/dates")
async def get_dates(site_name: str = Query(...), _user: UserInfo = Depends(get_current_user)) -> list[str]:
    return [d.isoformat() for d in svc.get_available_dates(site_name)]

@router.get("/daily-kpi")
async def get_daily_kpi(site_name: str = Query(...), date: date = Query(...), _user: UserInfo = Depends(get_current_user)) -> list[dict]:
    return svc.get_daily_row(site_name, date)

@router.get("/budget-kpi")
async def get_budget_kpi(site_name: str = Query(...), date: date = Query(...), _user: UserInfo = Depends(get_current_user)) -> list[dict]:
    return svc.get_budget_row(site_name, date)

@router.get("/pr")
async def get_pr(site_name: str = Query(...), date: date = Query(...), _user: UserInfo = Depends(get_current_user)) -> list[dict]:
    return svc.get_pr_equipment(site_name, date)

@router.get("/syd")
async def get_syd(site_name: str = Query(...), date: date = Query(...), _user: UserInfo = Depends(get_current_user)) -> list[dict]:
    return svc.get_syd_equipment(site_name, date)
