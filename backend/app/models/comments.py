"""models/comments.py — zelestra_comments table schemas."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any, Optional

from pydantic import BaseModel


class CommentBase(BaseModel):
    site_name: str
    deviation: Optional[Any] = None          # float or int depending on DB column
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    equipment_names: Optional[Any] = None    # list or JSON
    reasons: Optional[Any] = None            # list or JSON
    comment: Optional[str] = None


class CommentCreate(CommentBase):
    pass


class CommentUpdate(BaseModel):
    """Partial update — all fields optional."""
    site_name: Optional[str] = None
    deviation: Optional[Any] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    equipment_names: Optional[Any] = None
    reasons: Optional[Any] = None
    comment: Optional[str] = None


class Comment(CommentBase):
    id: Any
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


class BulkInsertResult(BaseModel):
    inserted: int
    duplicates: int
