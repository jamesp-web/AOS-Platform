"""Data-access layer. Delegates to a SQL store (Postgres/Supabase) when
DATABASE_URL is configured, otherwise the in-memory store — same signatures."""
import time
from typing import Any, Dict, List, Optional

from ..config import get_settings
from ..logging_config import get_logger
from ..utils.ids import session_id as new_session_id
from .session import MemoryBackedStore

log = get_logger("db.repo")

_store = None


def _get_store():
    global _store
    if _store is not None:
        return _store
    settings = get_settings()
    if settings.database_url:
        try:
            from .sql_store import SqlStore
            _store = SqlStore(settings.database_url, settings.research_cache_ttl_days * 86400)
            log.info("Persistence: SQL (%s)", settings.database_url.split("://", 1)[0])
            return _store
        except Exception as exc:  # noqa: BLE001
            log.warning("SQL persistence unavailable (%s) — using in-memory store", exc)
    _store = MemoryBackedStore()
    log.info("Persistence: in-memory")
    return _store


def init() -> str:
    """Force store creation at startup and return the persistence backend name."""
    _get_store()
    return persistence_backend()


def persistence_backend() -> str:
    url = get_settings().database_url
    if url:
        return url.split("://", 1)[0] or "sql"
    return "memory"


# ── sessions ──
def create_session(data: Dict[str, Any]) -> str:
    sid = new_session_id()
    data["session_id"] = sid
    data["updated_at"] = time.time()
    _get_store().session_put(sid, data)
    return sid


def get_session(session_id: str) -> Optional[Dict[str, Any]]:
    return _get_store().session_get(session_id)


def save_session(session_id: str, data: Dict[str, Any]) -> None:
    data["updated_at"] = time.time()
    _get_store().session_put(session_id, data)


def _researched(c: Dict[str, Any]) -> bool:
    return (c.get("ai") or {}).get("researchStatus") in ("done", "completed", "cached")


def list_sessions() -> List[Dict[str, Any]]:
    """Lightweight summary of every stored upload — powers the header switcher."""
    out: List[Dict[str, Any]] = []
    for sid, payload in _get_store().session_list():
        comps = payload.get("companies") or []
        out.append({
            "session_id": sid,
            "file_name": payload.get("file_name"),
            "companies": len(comps),
            "researched": sum(1 for c in comps if _researched(c)),
            "scored": sum(1 for c in comps if (c.get("ai") or {}).get("score")),
            "updated_at": payload.get("updated_at") or 0,
        })
    out.sort(key=lambda s: (s["updated_at"], s["companies"]), reverse=True)
    return out


def delete_session(session_id: str) -> bool:
    return _get_store().session_delete(session_id)


def get_companies(session_id: str) -> List[Dict[str, Any]]:
    return (get_session(session_id) or {}).get("companies", [])


# ── research cache ──
def cache_get(key: str):
    return _get_store().cache_get(key)


def cache_set(key: str, value) -> None:
    _get_store().cache_set(key, value)
