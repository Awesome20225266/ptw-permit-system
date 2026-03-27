"""models/auth.py — Auth request/response schemas."""
from __future__ import annotations

from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, description="Dashboard username")
    password: str = Field(..., min_length=1, description="Dashboard password")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserInfo"


class UserInfo(BaseModel):
    username: str
    role: str                       # comma-separated page keys, e.g. "portfolio,operation,s1"
    allowed_pages: list[str]        # parsed from role


TokenResponse.model_rebuild()
