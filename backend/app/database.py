"""
database.py — DuckDB and Supabase helpers.

This version BYPASSES DuckDB completely so that the application
can start even if master.duckdb does not exist.

Useful for deployment on Render when DB is not required.
"""

from __future__ import annotations

from typing import Optional

import duckdb
from supabase import Client, create_client

from app.config import get_settings


# ---------------------------------------------------------------------------
# DuckDB (BYPASSED)
# ---------------------------------------------------------------------------

def _ensure_db_local(db_local: Optional[str] = None) -> Optional[str]:
    """
    DuckDB is intentionally bypassed.
    """

    print("⚠️ DuckDB feature is bypassed. No database will be loaded.", flush=True)

    return None


# ---------------------------------------------------------------------------
# DuckDB connection
# ---------------------------------------------------------------------------

def get_duckdb_connection(db_local: Optional[str] = None) -> Optional[duckdb.DuckDBPyConnection]:
    """
    Return None since DuckDB is disabled.
    """

    print("⚠️ DuckDB connection requested but DB is bypassed.", flush=True)

    return None


# ---------------------------------------------------------------------------
# Supabase client
# ---------------------------------------------------------------------------

def get_supabase_client(*, prefer_service_role: bool = True) -> Client:
    """
    Create Supabase client using environment settings.
    """

    settings = get_settings()

    url_str = settings.SUPABASE_URL.strip()

    if not url_str.startswith(("http://", "https://")):
        raise ValueError(
            f"Invalid SUPABASE_URL format: '{url_str}'. "
            "URL must start with http:// or https://"
        )

    if not url_str.endswith("/"):
        url_str = url_str + "/"

    key = (
        settings.SUPABASE_SERVICE_ROLE_KEY
        if (prefer_service_role and settings.SUPABASE_SERVICE_ROLE_KEY)
        else settings.SUPABASE_ANON_KEY
    )

    if not key:
        raise ValueError(
            "Missing Supabase key. "
            "Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY."
        )

    return create_client(url_str, key)


# ---------------------------------------------------------------------------
# FastAPI lifespan helpers
# ---------------------------------------------------------------------------

_duckdb_path: Optional[str] = None


def init_duckdb() -> None:
    """
    DuckDB initialization skipped.
    """

    global _duckdb_path

    print("⚠️ DuckDB initialization skipped.", flush=True)

    _duckdb_path = None


def get_cached_duckdb_path() -> Optional[str]:
    """
    Always return None since DB is bypassed.
    """

    return None