"""
services/auth_service.py — Credential verification and token issuance.

Mirrors auth.py's check_password() logic:
  SELECT id, username, is_admin, role
  FROM dashboard_users
  WHERE username = ? AND password = ?

No Streamlit session_state — returns a dict on success, None on failure.
"""
from __future__ import annotations

from typing import Optional

from app.database import get_supabase_client
from app.models.auth import TokenResponse, UserInfo
from app.services.access_control import get_allowed_pages_from_role
from app.utils.security import create_access_token


# ---------------------------------------------------------------------------
# Supabase credential check (identical query to auth.py)
# ---------------------------------------------------------------------------

def verify_credentials(username: str, password: str) -> Optional[dict]:
    """
    Query Supabase dashboard_users.
    Returns the user row dict on success, None on failure.
    Uses the same query as the Streamlit auth.py.
    """
    sb = get_supabase_client(prefer_service_role=True)
    res = (
        sb.table("dashboard_users")
        .select("id,username,is_admin,role")
        .eq("username", username.strip())
        .eq("password", password.strip())
        .limit(1)
        .execute()
    )

    data = getattr(res, "data", None) or []
    if not data:
        return None

    return data[0]


# ---------------------------------------------------------------------------
# Login: verify → issue JWT
# ---------------------------------------------------------------------------

def login(username: str, password: str) -> Optional[TokenResponse]:
    """
    Full login flow:
      1. Verify credentials against Supabase
      2. Create JWT with sub=username, role=<csv page keys>
      3. Return TokenResponse

    Returns None if credentials are invalid.
    """
    row = verify_credentials(username, password)
    if row is None:
        return None

    db_username: str = str(row.get("username") or username).strip().lower()
    role: str = str(row.get("role") or "").strip()

    token, _expires = create_access_token(username=db_username, role=role)

    allowed_pages = list(get_allowed_pages_from_role(role))

    user_info = UserInfo(
        username=db_username,
        role=role,
        allowed_pages=allowed_pages,
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=user_info,
    )
