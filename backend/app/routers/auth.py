"""
routers/auth.py — Authentication endpoints.

POST /api/v1/auth/login   → verify credentials → JWT
POST /api/v1/auth/logout  → client-side only (stateless JWT), returns 200
GET  /api/v1/auth/me      → return current user info from token
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status

from app.models.auth import LoginRequest, TokenResponse, UserInfo
from app.services.auth_service import login
from app.utils.security import get_current_user

router = APIRouter()


@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Login and receive a Bearer JWT",
)
async def auth_login(body: LoginRequest) -> TokenResponse:
    """
    Verify username/password against Supabase dashboard_users.
    On success returns an access_token (Bearer JWT) valid for 8 hours.
    The token encodes: {sub: username, role: "<csv page keys>"}.
    """
    result = login(body.username, body.password)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials. Please try again.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return result


@router.post(
    "/logout",
    summary="Logout (client-side token discard)",
    status_code=status.HTTP_200_OK,
)
async def auth_logout(
    _user: UserInfo = Depends(get_current_user),
) -> dict:
    """
    Stateless JWT logout.  The client must discard the token from
    its Zustand store.  This endpoint validates the token is still
    valid before responding, giving the frontend a clean 401 if the
    token has already expired.
    """
    return {"detail": "Logged out successfully"}


@router.get(
    "/me",
    response_model=UserInfo,
    summary="Return current authenticated user info",
)
async def auth_me(user: UserInfo = Depends(get_current_user)) -> UserInfo:
    """
    Decode the Bearer token and return UserInfo.
    Useful for the React app to restore auth state after a page refresh.
    """
    return user
