"""
database.py — DuckDB and Supabase helpers.

This version BYPASSES DuckDB completely so that the application
can start even if master.duckdb does not exist.

Useful for deployment on Render when DB is not required.
"""

from __future__ import annotations

from typing import Optional

import duckdb
import pandas as pd
from supabase import Client, create_client

from app.config import get_settings


# ---------------------------------------------------------------------------
# DuckDB null-object stub — prevents 500 errors when DuckDB is bypassed
# ---------------------------------------------------------------------------


class _NullDuckDBResult:
    """Mimics DuckDB cursor result — returns empty data for all fetch methods."""
    def fetchall(self) -> list:
        return []
    def fetchone(self):
        return None
    def fetchdf(self) -> "pd.DataFrame":
        return pd.DataFrame()


class _NullDuckDBConnection:
    """
    Null-object that replaces a real DuckDB connection when DB is bypassed.
    All query/fetch methods return empty results instead of raising AttributeError.
    Supports the context-manager and .close() protocol used by service functions.
    """
    def execute(self, *_args, **_kwargs) -> _NullDuckDBResult:
        return _NullDuckDBResult()

    def close(self) -> None:
        pass

    def __enter__(self):
        return self

    def __exit__(self, *_):
        pass


def _ensure_db_local(db_local: Optional[str] = None) -> Optional[str]:
    return None


# ---------------------------------------------------------------------------
# DuckDB connection
# ---------------------------------------------------------------------------

def get_duckdb_connection(db_local: Optional[str] = None) -> _NullDuckDBConnection:
    """
    DuckDB is disabled. Returns a null-object stub so callers never crash.
    """
    return _NullDuckDBConnection()


# ---------------------------------------------------------------------------
# Supabase client — module-level singletons (one per key type)
# ---------------------------------------------------------------------------

_supabase_anon: Optional[Client] = None
_supabase_service: Optional[Client] = None


def _build_supabase_client(key: str) -> Client:
    settings = get_settings()
    # Normalize to a slashless base URL so SDK path joins don't produce
    # double slashes (e.g. //storage/v1/...), which can break Storage APIs.
    url_str = settings.SUPABASE_URL.strip().rstrip("/")
    if not url_str.startswith(("http://", "https://")):
        raise ValueError(
            f"Invalid SUPABASE_URL format: '{url_str}'. "
            "URL must start with http:// or https://"
        )
    return create_client(url_str, key)


def get_supabase_client(*, prefer_service_role: bool = True) -> Client:
    """
    Return a cached Supabase client singleton.
    Two instances are kept: one for the service-role key, one for the anon key.
    Creating a client is expensive (HTTP session setup), so reusing the same
    object across requests significantly reduces per-request overhead.
    """
    global _supabase_anon, _supabase_service

    settings = get_settings()

    if prefer_service_role and settings.SUPABASE_SERVICE_ROLE_KEY:
        if _supabase_service is None:
            _supabase_service = _build_supabase_client(
                settings.SUPABASE_SERVICE_ROLE_KEY
            )
        return _supabase_service

    if not settings.SUPABASE_ANON_KEY:
        raise ValueError(
            "Missing Supabase key. "
            "Set SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY."
        )
    if _supabase_anon is None:
        _supabase_anon = _build_supabase_client(settings.SUPABASE_ANON_KEY)
    return _supabase_anon


# ---------------------------------------------------------------------------
# FastAPI lifespan helpers
# ---------------------------------------------------------------------------

_duckdb_path: Optional[str] = None


def init_duckdb() -> None:
    """
    DuckDB initialization skipped.
    """

    global _duckdb_path

    print("[DuckDB] Initialization skipped.", flush=True)

    _duckdb_path = None


def get_cached_duckdb_path() -> Optional[str]:
    """
    Always return None since DB is bypassed.
    """

    return None