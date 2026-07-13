"""Postgres/Supabase-backed store (sessions + research cache) via SQLAlchemy.

Implements the same store interface as the in-memory store, so the repository
swaps between them with no other changes.
"""
import time
from typing import Any, Dict, List, Optional, Tuple

from sqlalchemy import select

from ..logging_config import get_logger
from .db import create_all, get_sessionmaker, init_engine
from .models_sql import ResearchCacheRow, SessionRow

log = get_logger("db.sql")


class SqlStore:
    def __init__(self, database_url: str, ttl_seconds: float):
        init_engine(database_url)
        create_all()
        self.ttl = ttl_seconds
        self.Session = get_sessionmaker()

    # ── sessions ──
    def session_get(self, sid: str) -> Optional[Dict[str, Any]]:
        with self.Session() as db:
            row = db.get(SessionRow, sid)
            return dict(row.payload) if row else None

    def session_put(self, sid: str, data: Dict[str, Any]) -> None:
        with self.Session() as db:
            row = db.get(SessionRow, sid)
            if row:
                row.payload = data
            else:
                db.add(SessionRow(id=sid, payload=data))
            db.commit()

    def session_list(self) -> List[Tuple[str, Dict[str, Any]]]:
        with self.Session() as db:
            return [(r.id, dict(r.payload)) for r in db.execute(select(SessionRow)).scalars().all()]

    def session_delete(self, sid: str) -> bool:
        with self.Session() as db:
            row = db.get(SessionRow, sid)
            if not row:
                return False
            db.delete(row)
            db.commit()
            return True

    # ── research cache ──
    def cache_get(self, key: str) -> Optional[Any]:
        with self.Session() as db:
            row = db.get(ResearchCacheRow, key)
            if not row or (time.time() - row.fetched_at) >= self.ttl:
                return None
            return row.value

    def cache_set(self, key: str, value: Any) -> None:
        with self.Session() as db:
            row = db.get(ResearchCacheRow, key)
            if row:
                row.value = value
                row.fetched_at = time.time()
            else:
                db.add(ResearchCacheRow(cache_key=key, value=value, fetched_at=time.time()))
            db.commit()
