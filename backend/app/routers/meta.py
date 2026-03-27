"""
routers/meta.py — DuckDB metadata inspection endpoints.

GET /api/v1/meta/tables
GET /api/v1/meta/schema?table_name=daily_kpi
GET /api/v1/meta/sample?table_name=daily_kpi&limit=10
"""
from __future__ import annotations
from fastapi import APIRouter, Depends, Query
from app.models.auth import UserInfo
from app.services import meta_service as svc
from app.utils.security import get_current_user

router = APIRouter()

@router.get("/tables")
async def meta_tables(_user: UserInfo = Depends(get_current_user)) -> list[dict]:
    return svc.list_tables()

@router.get("/schema")
async def meta_schema(table_name: str = Query(...), _user: UserInfo = Depends(get_current_user)) -> list[dict]:
    return svc.get_table_schema(table_name)

@router.get("/sample")
async def meta_sample(table_name: str = Query(...), limit: int = Query(default=10, le=100), _user: UserInfo = Depends(get_current_user)) -> list[dict]:
    return svc.get_table_sample(table_name, limit)


# ---------------------------------------------------------------------------
# Site access control + master_db lookups
# ---------------------------------------------------------------------------

@router.get("/allowed-sites")
async def allowed_sites(user: UserInfo = Depends(get_current_user)) -> list[str]:
    """Return the list of sites the authenticated user is allowed to access."""
    return svc.get_allowed_sites(user.username)


@router.get("/master-locations")
async def master_locations(
    site_name: str = Query(..., description="Site to query locations for"),
    _user: UserInfo = Depends(get_current_user),
) -> list[str]:
    """Return distinct locations for a site from master_db."""
    return svc.get_master_locations(site_name)


@router.get("/master-equipment")
async def master_equipment(
    site_name: str = Query(..., description="Site to query equipment for"),
    _user: UserInfo = Depends(get_current_user),
) -> list[str]:
    """Return distinct equipment for a site from master_db."""
    return svc.get_master_equipment(site_name)
