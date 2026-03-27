"""
routers/raw.py — Raw Analyser time-series endpoints.

GET  /api/v1/raw/sites
GET  /api/v1/raw/inv-stations?site_name=X
GET  /api/v1/raw/inverters?site_name=X&inv_stations=A&inv_stations=B
GET  /api/v1/raw/units?site_name=X&inv_stations=A&inverters=B
GET  /api/v1/raw/scbs?site_name=X&inv_stations=A&inverters=B&units=C
GET  /api/v1/raw/date-bounds?site_name=X
POST /api/v1/raw/timeseries
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.models.auth import UserInfo
from app.services import raw_service as svc
from app.utils.security import get_current_user

router = APIRouter()


class TimeseriesRequest(BaseModel):
    site_name: str
    from_date: date
    to_date: date
    inv_stations: list[str] = []
    inverters:    list[str] = []
    units:        list[str] = []
    scb_cols:     list[str] = []
    normalize:    bool = False


@router.get("/sites")
async def raw_sites(_user: UserInfo = Depends(get_current_user)) -> list[str]:
    try:
        return svc.list_sites()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/inv-stations")
async def raw_inv_stations(
    site_name: str = Query(...),
    _user: UserInfo = Depends(get_current_user),
) -> list[str]:
    try:
        return svc.list_inv_stations(site_name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/inverters")
async def raw_inverters(
    site_name:    str       = Query(...),
    inv_stations: list[str] = Query(default=[]),
    _user: UserInfo = Depends(get_current_user),
) -> list[str]:
    try:
        return svc.list_inverters(site_name, inv_stations)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/units")
async def raw_units(
    site_name:    str       = Query(...),
    inv_stations: list[str] = Query(default=[]),
    inverters:    list[str] = Query(default=[]),
    _user: UserInfo = Depends(get_current_user),
) -> list[str]:
    try:
        return svc.list_units(site_name, inv_stations, inverters)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/scbs")
async def raw_scbs(
    site_name:    str       = Query(...),
    inv_stations: list[str] = Query(default=[]),
    inverters:    list[str] = Query(default=[]),
    units:        list[str] = Query(default=[]),
    _user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    try:
        return svc.list_scbs(site_name, inv_stations, inverters, units)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/date-bounds")
async def raw_date_bounds(
    site_name: str = Query(...),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    try:
        d_min, d_max = svc.get_date_bounds(site_name)
        return {
            "date_min": d_min.isoformat() if d_min else None,
            "date_max": d_max.isoformat() if d_max else None,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/timeseries")
async def raw_timeseries(
    req: TimeseriesRequest,
    _user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    if req.from_date > req.to_date:
        raise HTTPException(status_code=422, detail="from_date must be <= to_date")
    try:
        return svc.fetch_raw_timeseries(
            site_name=req.site_name,
            from_date=req.from_date,
            to_date=req.to_date,
            inv_stations=req.inv_stations,
            inverters=req.inverters,
            units=req.units,
            scb_cols=req.scb_cols,
            normalize=req.normalize,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Raw timeseries error: {exc}") from exc
