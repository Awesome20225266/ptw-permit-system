"""
utils/cache.py — Thread-safe, TTL in-memory cache.

Replaces Streamlit's @st.cache_data decorator.  Designed for DuckDB query
results that don't change frequently (TTL 300 s matches the original).

Usage:
    from app.utils.cache import ttl_cache

    @ttl_cache(ttl=300)
    def list_sites(db_path: str) -> list[str]:
        ...

    # Invalidate all entries for a function:
    list_sites.cache_clear()
"""
from __future__ import annotations

import functools
import threading
import time
from typing import Any, Callable, TypeVar

F = TypeVar("F", bound=Callable[..., Any])

_lock = threading.Lock()


class _CacheEntry:
    __slots__ = ("value", "expires_at")

    def __init__(self, value: Any, ttl: float) -> None:
        self.value = value
        self.expires_at = time.monotonic() + ttl


class _TTLCache:
    """Simple dict-backed TTL cache, keyed by (args, sorted_kwargs)."""

    def __init__(self, ttl: float) -> None:
        self._ttl = ttl
        self._store: dict[tuple, _CacheEntry] = {}
        self._lock = threading.Lock()

    def _make_key(self, args: tuple, kwargs: dict) -> tuple:
        return args + tuple(sorted(kwargs.items()))

    def get(self, args: tuple, kwargs: dict) -> tuple[bool, Any]:
        key = self._make_key(args, kwargs)
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                return False, None
            if time.monotonic() > entry.expires_at:
                del self._store[key]
                return False, None
            return True, entry.value

    def set(self, args: tuple, kwargs: dict, value: Any) -> None:
        key = self._make_key(args, kwargs)
        with self._lock:
            self._store[key] = _CacheEntry(value, self._ttl)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()

    def evict_expired(self) -> None:
        now = time.monotonic()
        with self._lock:
            expired = [k for k, v in self._store.items() if now > v.expires_at]
            for k in expired:
                del self._store[k]


def ttl_cache(ttl: float = 300) -> Callable[[F], F]:
    """
    Decorator factory.  Wraps a function with a TTL cache.

    Args:
        ttl: Time-to-live in seconds (default 300, matching @st.cache_data ttl=300).

    The wrapped function gains a `.cache_clear()` method.
    """
    def decorator(func: F) -> F:
        cache = _TTLCache(ttl=ttl)

        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            hit, value = cache.get(args, kwargs)
            if hit:
                return value
            result = func(*args, **kwargs)
            cache.set(args, kwargs, result)
            return result

        wrapper.cache_clear = cache.clear  # type: ignore[attr-defined]
        wrapper._cache = cache              # type: ignore[attr-defined]
        return wrapper  # type: ignore[return-value]

    return decorator
