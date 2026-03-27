"""
routers/scb.py — SCB Operation Theatre endpoints.

GET  /api/v1/scb/sites
GET  /api/v1/scb/date-bounds?site_name=X
POST /api/v1/scb/ot
"""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.models.auth import UserInfo
from app.services import scb_service as svc
from app.utils.security import get_current_user

router = APIRouter()


class SCBOTRequest(BaseModel):
    site_name: str
    from_date: date
    to_date: date
    threshold: float = -20.0


@router.get("/sites")
async def scb_sites(_user: UserInfo = Depends(get_current_user)) -> list[str]:
    return svc.list_sites()


@router.get("/date-bounds")
async def scb_date_bounds(
    site_name: str = Query(...),
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    d_min, d_max = svc.get_date_bounds(site_name)
    return {
        "date_min": d_min.isoformat() if d_min else None,
        "date_max": d_max.isoformat() if d_max else None,
    }


@router.post("/ot")
async def scb_run_ot(
    req: SCBOTRequest,
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    return svc.run_scb_ot(
        site_name=req.site_name,
        from_date=req.from_date,
        to_date=req.to_date,
        threshold=req.threshold,
    )
