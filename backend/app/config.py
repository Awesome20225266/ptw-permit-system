"""
config.py — Pydantic Settings for Zel-EYE: OI FastAPI backend.

Reads from (in order of priority):
  1. Real environment variables
  2. secrets.toml at project root (if present)
  3. .env at backend root
  4. Defaults
"""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

import tomllib
from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root = parent of backend/
_BACKEND_DIR = Path(__file__).resolve().parents[1]
_PROJECT_ROOT = _BACKEND_DIR.parent
_SECRETS_TOML = _PROJECT_ROOT / "secrets.toml"


def _load_secrets_toml() -> None:
    """Load secrets.toml into os.environ (only for keys not already set)."""
    if not _SECRETS_TOML.exists():
        return
    with open(_SECRETS_TOML, "rb") as f:
        data = tomllib.load(f)
    for key, val in data.items():
        env_key = key.upper().replace("-", "_")
        if env_key not in os.environ and val is not None:
            os.environ[env_key] = str(val).strip().strip('"')


_load_secrets_toml()


class Settings(BaseSettings):
    """
    All application configuration.

    Values are sourced (in order of priority):
      1. Real environment variables
      2. .env file at the backend project root
      3. Defaults defined below
    """

    model_config = SettingsConfigDict(
        # Look for .env relative to this file's parent (backend/)
        env_file=str(Path(__file__).resolve().parents[1] / ".env"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ------------------------------------------------------------------
    # Supabase
    # ------------------------------------------------------------------
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # ------------------------------------------------------------------
    # AWS / S3 — DuckDB download (read credentials)
    # ------------------------------------------------------------------
    AWS_ACCESS_KEY_ID: str
    AWS_SECRET_ACCESS_KEY: str
    AWS_REGION: str = "eu-north-1"
    S3_BUCKET: str = "zelestra-duckdb"
    S3_KEY: str = "master.duckdb"

    # ------------------------------------------------------------------
    # AWS — Optional separate upload credentials (used by master_run.py)
    # Not needed by the API server; included so .env is self-documenting.
    # ------------------------------------------------------------------
    AWS_ACCESS_KEY_ID_UPLOAD: str = ""
    AWS_SECRET_ACCESS_KEY_UPLOAD: str = ""

    # ------------------------------------------------------------------
    # JWT
    # ------------------------------------------------------------------
    JWT_SECRET_KEY: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_HOURS: int = 8

    # ------------------------------------------------------------------
    # DuckDB local cache
    # ------------------------------------------------------------------
    DUCKDB_LOCAL_PATH: str = "master.duckdb"

    # ------------------------------------------------------------------
    # CORS — comma-separated allowed origins
    # ------------------------------------------------------------------
    CORS_ORIGINS: str = "http://localhost:5173,http://localhost:3000"

    # ------------------------------------------------------------------
    # Secrets debug (mirrors ZELES_SECRETS_DEBUG env var in legacy code)
    # ------------------------------------------------------------------
    ZELES_SECRETS_DEBUG: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Return the cached Settings singleton.
    Call ``get_settings.cache_clear()`` in tests to reload.
    """
    return Settings()
