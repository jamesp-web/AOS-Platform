"""Store backends.

Two implementations share one interface (session_get/put, cache_get/set):
  • MemoryBackedStore — zero-infra default (sessions in-process, cache on disk).
  • SqlStore          — Postgres/Supabase (see sql_store.py).

The repository chooses between them; nothing else in the app knows the difference.
"""
from typing import Any, Dict, Optional

from ..config import get_settings
from ..logging_config import get_logger
from ..utils.cache import TTLCache

log = get_logger("db")


class MemoryBackedStore:
    """In-process sessions + on-disk TTL research cache (survives within a run)."""

    def __init__(self) -> None:
        self._sessions: Dict[str, Dict[str, Any]] = {}
        s = get_settings()
        self._cache = TTLCache(s.cache_dir / "research.json", s.research_cache_ttl_days * 86400)

    def session_get(self, sid: str) -> Optional[Dict[str, Any]]:
        return self._sessions.get(sid)

    def session_put(self, sid: str, data: Dict[str, Any]) -> None:
        self._sessions[sid] = data

    def session_list(self):
        return list(self._sessions.items())

    def session_delete(self, sid: str) -> bool:
        return self._sessions.pop(sid, None) is not None

    def cache_get(self, key: str):
        return self._cache.get(key)

    def cache_set(self, key: str, value) -> None:
        self._cache.set(key, value)


def get_supabase():  # pragma: no cover — optional supabase-py client (auth/storage/etc.)
    settings = get_settings()
    if not (settings.supabase_url and settings.supabase_key):
        return None
    try:
        from supabase import create_client
        return create_client(settings.supabase_url, settings.supabase_key)
    except Exception as exc:  # noqa: BLE001
        log.warning("supabase-py unavailable: %s", exc)
        return None
