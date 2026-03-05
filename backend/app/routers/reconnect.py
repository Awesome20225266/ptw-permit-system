"""
routers/reconnect.py — DSM reconnect endpoints.

GET /api/v1/reconnect/plants
GET /api/v1/reconnect/date-range?plant_names=A&plant_names=B
GET /api/v1/reconnect/data?plant_names=A&plant_names=B&start_date=&end_date=
"""
from __future__ import annotations
from datetime import date
from fastapi import APIRouter, Depends, Query
from app.models.auth import UserInfo
from app.services import reconnect_service as svc
from app.utils.security import get_current_user

router = APIRouter()

@router.get("/plants")
async def reconnect_plants(_user: UserInfo = Depends(get_current_user)) -> list[str]:
    return svc.get_reconnect_plants()

@router.get("/date-range")
async def reconnect_date_range(plant_names: list[str] = Query(...), _user: UserInfo = Depends(get_current_user)) -> dict:
    dmin, dmax = svc.get_reconnect_date_range(tuple(plant_names))
    return {"date_min": dmin.isoformat() if dmin else None, "date_max": dmax.isoformat() if dmax else None}

@router.get("/data")
async def reconnect_data(
    plant_names: list[str] = Query(...),
    start_date: date = Query(...),
    end_date: date = Query(...),
    _user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    return svc.load_reconnect_data(plant_names, start_date, end_date)
