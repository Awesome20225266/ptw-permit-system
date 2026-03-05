"""
routers/comments.py — zelestra_comments CRUD endpoints.

GET    /api/v1/comments
POST   /api/v1/comments
POST   /api/v1/comments/bulk
PUT    /api/v1/comments/{id}
DELETE /api/v1/comments/{id}
"""
from __future__ import annotations
from datetime import date
from typing import Any, Optional
from fastapi import APIRouter, Depends, Path, Query
from app.models.auth import UserInfo
from app.models.comments import BulkInsertResult, Comment, CommentCreate, CommentUpdate
from app.services import comments_service as svc
from app.utils.security import get_current_user

router = APIRouter()

@router.get("/", response_model=list[dict])
async def list_comments(
    site_names: Optional[list[str]] = Query(default=None),
    start_date: Optional[date] = Query(default=None),
    end_date: Optional[date] = Query(default=None),
    limit: int = Query(default=500, le=2000),
    _user: UserInfo = Depends(get_current_user),
) -> list[dict]:
    return svc.fetch_comments(site_names=site_names, start_date=start_date, end_date=end_date, limit=limit)

@router.post("/", response_model=dict, status_code=201)
async def create_comment(body: CommentCreate, _user: UserInfo = Depends(get_current_user)) -> dict:
    return svc.insert_comment(body.model_dump(exclude_none=True))

@router.post("/bulk", response_model=BulkInsertResult, status_code=201)
async def bulk_create_comments(payloads: list[dict[str, Any]], _user: UserInfo = Depends(get_current_user)) -> BulkInsertResult:
    result = svc.insert_bulk_comments(payloads)
    return BulkInsertResult(**result)

@router.put("/{comment_id}", response_model=dict)
async def update_comment(comment_id: Any = Path(...), body: CommentUpdate = ..., _user: UserInfo = Depends(get_current_user)) -> dict:
    return svc.update_comment(comment_id, body.model_dump(exclude_none=True))

@router.delete("/{comment_id}", status_code=204)
async def delete_comment(comment_id: Any = Path(...), _user: UserInfo = Depends(get_current_user)) -> None:
    svc.delete_comment(comment_id)
