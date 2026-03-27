"""
utils/security.py — JWT creation, verification and FastAPI Bearer dependency.

Token payload mirrors the Streamlit session_state structure:
  {sub: username, role: "portfolio,operation,s1", exp: now+8h}

FastAPI dependencies:
  get_current_user(token) → UserInfo
  require_role("s1")      → UserInfo (raises 403 if role not in allowed_pages)
"""
from __future__ import annotations

from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import get_settings
from app.models.auth import UserInfo
from app.services.access_control import get_allowed_pages_from_role

_bearer_scheme = HTTPBearer(auto_error=True)


# ---------------------------------------------------------------------------
# Token creation
# ---------------------------------------------------------------------------

def create_access_token(
    *,
    username: str,
    role: str,
) -> tuple[str, datetime]:
    """
    Create a signed JWT.
    Returns (token_string, expiry_datetime_utc).
    """
    settings = get_settings()
    expire = datetime.now(tz=timezone.utc) + timedelta(hours=settings.JWT_EXPIRE_HOURS)

    payload = {
        "sub": username,
        "role": role,
        "exp": expire,
        "iat": datetime.now(tz=timezone.utc),
    }

    token = jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM,
    )
    return token, expire


# ---------------------------------------------------------------------------
# Token verification
# ---------------------------------------------------------------------------

def decode_token(token: str) -> dict:
    """
    Decode and validate a JWT.
    Raises HTTPException 401 on any failure.
    """
    settings = get_settings()
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
        username: Optional[str] = payload.get("sub")
        if not username:
            raise credentials_exception
        return payload
    except JWTError:
        raise credentials_exception


# ---------------------------------------------------------------------------
# FastAPI dependencies
# ---------------------------------------------------------------------------

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> UserInfo:
    """
    Decode the Bearer token from Authorization header.
    Returns a UserInfo with username, role and allowed_pages.
    """
    payload = decode_token(credentials.credentials)
    username: str = payload["sub"]
    role: str = payload.get("role", "")
    allowed_pages = list(get_allowed_pages_from_role(role))

    return UserInfo(
        username=username,
        role=role,
        allowed_pages=allowed_pages,
    )


def require_role(*page_keys: str):
    """
    Dependency factory that enforces RBAC.

    Usage:
        @router.get("/s1/work-orders")
        async def list_work_orders(user: UserInfo = Depends(require_role("s1"))):
            ...
    """
    async def _check(user: UserInfo = Depends(get_current_user)) -> UserInfo:
        allowed = set(user.allowed_pages)
        if not any(k in allowed for k in page_keys):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {list(page_keys)}",
            )
        return user

    return _check
