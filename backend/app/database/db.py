"""SQLAlchemy engine/session factory.

`DATABASE_URL` is a standard Postgres URL — use the Supabase project's
connection string (Project Settings → Database → Connection string / URI).
SQLite is supported too, which is what the persistence tests run against.
"""
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from ..logging_config import get_logger

log = get_logger("db")


class Base(DeclarativeBase):
    pass


_engine: Optional[Engine] = None
_SessionLocal: Optional[sessionmaker] = None


def init_engine(database_url: str) -> None:
    global _engine, _SessionLocal
    if _engine is not None:
        return
    import os
    connect_args = {"check_same_thread": False} if database_url.startswith("sqlite") else {}
    kwargs = {"connect_args": connect_args, "pool_pre_ping": True, "future": True}
    # Serverless (Vercel): don't pool connections across invocations — pair with
    # Supabase's TRANSACTION pooler (port 6543), which recycles connections per query.
    if os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"):
        from sqlalchemy.pool import NullPool
        kwargs["poolclass"] = NullPool
    _engine = create_engine(database_url, **kwargs)
    _SessionLocal = sessionmaker(bind=_engine, future=True, expire_on_commit=False)
    log.info("SQL engine initialised (%s)", database_url.split("://", 1)[0])


def get_sessionmaker() -> sessionmaker:
    if _SessionLocal is None:
        raise RuntimeError("SQL engine not initialised")
    return _SessionLocal


def create_all() -> None:
    from . import models_sql  # noqa: F401 — register models on Base
    Base.metadata.create_all(_engine)
