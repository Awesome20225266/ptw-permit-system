"""
services/access_control.py — Role parsing and RBAC helpers.

Ported verbatim from access_control.py.
All sets, logic and constants are unchanged.
The only removal is the Streamlit session_state dependency:
user_allowed_pages() now accepts a role string directly.
"""
from __future__ import annotations

from typing import Optional


# ---------------------------------------------------------------------------
# Role → page allowlist
# ---------------------------------------------------------------------------

_ALL_PAGES = {"s1", "s2", "s3", "admin"}

def get_allowed_pages_from_role(role: Optional[str]) -> set[str]:
    """
    Convert comma-separated role string into allowed page key set.
    Case-insensitive. Admin role grants access to all pages.
    """
    if not role:
        return set()
    parsed = {r.strip().lower() for r in role.split(",") if r.strip()}
    # "admin" role grants full access to all PTW pages
    if "admin" in parsed:
        return _ALL_PAGES
    return parsed


# ---------------------------------------------------------------------------
# Username-based access control (UI/data-filter, not RLS)
# ---------------------------------------------------------------------------

ADMIN_USERNAME = "admin"

RESTRICTED_USERS: set[str] = {
    "aspl",
    "gspl_gum",
    "gspl",
    "tspl",
    "nspl",
    "rspl",
    "gspl_gap",
    "pspl",
    "esepl",
}

# PTW portal routing (UI enforcement only)
S1_ONLY_USERS: set[str] = {"labhchand"}
S2_ONLY_USERS: set[str] = {"durgesh"}
S3_ONLY_USERS: set[str] = {"richpal"}


def is_admin(username: Optional[str]) -> bool:
    return (username or "").strip().lower() == ADMIN_USERNAME


def allowed_modules_for_user(username: Optional[str]) -> list[str]:
    """
    Returns list of allowed PTW modules:
      - admin      → ["S1", "S2", "S3"]
      - labhchand  → ["S1"]
      - durgesh    → ["S2"]
      - richpal    → ["S3"]
      - otherwise  → []
    """
    u = (username or "").strip().lower()
    if is_admin(u):
        return ["S1", "S2", "S3"]
    if u in S1_ONLY_USERS:
        return ["S1"]
    if u in S2_ONLY_USERS:
        return ["S2"]
    if u in S3_ONLY_USERS:
        return ["S3"]
    return []


def is_restricted_user(username: Optional[str]) -> bool:
    return (username or "").strip().lower() in RESTRICTED_USERS


def allowed_sites_for_user(username: Optional[str]) -> list[str]:
    """
    - Admin: [] means ALL sites allowed
    - Restricted: [username] means ONLY that site
    - Unknown: [] (caller decides how to treat)
    """
    u = (username or "").strip().lower()
    if is_admin(u):
        return []
    if is_restricted_user(u):
        return [u]
    return []
