#!/usr/bin/env python3
"""Migrate ALIP persistence (sessions + research cache) from local SQLite to a
target Postgres / Supabase database. Idempotent — rows are upserted by primary
key, so it is safe to re-run.

Run from the backend/ directory with the venv:

    # preview what would move (no target needed):
    .venv/bin/python scripts/migrate_to_supabase.py --dry-run

    # migrate into Supabase (URI from Project Settings -> Database -> Connection string):
    .venv/bin/python scripts/migrate_to_supabase.py "postgresql://postgres:PW@db.REF.supabase.co:5432/postgres"

    # or rely on DATABASE_URL already being set:
    DATABASE_URL="postgresql://..." .venv/bin/python scripts/migrate_to_supabase.py
"""
import argparse
import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from sqlalchemy import create_engine, select                      # noqa: E402
from sqlalchemy.orm import sessionmaker                           # noqa: E402

from app.database.db import Base                                  # noqa: E402
from app.database.models_sql import ResearchCacheRow, SessionRow  # noqa: E402

MODELS = (SessionRow, ResearchCacheRow)


def normalize(url: str) -> str:
    # SQLAlchemy needs the 'postgresql' scheme; Supabase sometimes shows 'postgres://'.
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    return url


def main() -> int:
    ap = argparse.ArgumentParser(description="Migrate ALIP SQLite -> Postgres/Supabase.")
    ap.add_argument("target", nargs="?", default=os.environ.get("DATABASE_URL"),
                    help="Target Postgres/Supabase URL (or set DATABASE_URL).")
    ap.add_argument("--source", default=f"sqlite:///{BACKEND / 'alip.db'}",
                    help="Source SQLAlchemy URL (default: backend/alip.db).")
    ap.add_argument("--dry-run", action="store_true", help="Count source rows; do not write.")
    args = ap.parse_args()

    if not args.target:   # fall back to DATABASE_URL configured in .env
        try:
            from app.config import get_settings
            args.target = get_settings().database_url or None
        except Exception:  # noqa: BLE001
            pass

    src_engine = create_engine(args.source, future=True)
    Src = sessionmaker(bind=src_engine, future=True)

    counts = {}
    with Src() as s:
        for Model in MODELS:
            counts[Model.__tablename__] = len(s.execute(select(Model)).scalars().all())

    if args.dry_run or not args.target:
        for tbl, n in counts.items():
            print(f"  source has {n:>4} rows in {tbl}")
        print("\nNo target given — pass a Postgres/Supabase URL (or set DATABASE_URL) to migrate."
              if not args.target else "\nDry run: no writes performed.")
        return 0

    target = normalize(args.target)
    tgt_engine = create_engine(target, pool_pre_ping=True, future=True)
    try:
        with tgt_engine.connect() as c:
            c.exec_driver_sql("SELECT 1")
    except Exception as exc:  # noqa: BLE001
        print(f"ERROR: cannot connect to target ({target.split('://', 1)[0]}): {exc}")
        return 1

    Base.metadata.create_all(tgt_engine)   # create alip_sessions + alip_research_cache if absent
    Tgt = sessionmaker(bind=tgt_engine, future=True, expire_on_commit=False)
    with Src() as s, Tgt() as t:
        for Model in MODELS:
            for r in s.execute(select(Model)).scalars().all():
                data = {col.name: getattr(r, col.name) for col in Model.__table__.columns}
                t.merge(Model(**data))     # upsert by primary key
        t.commit()

    for tbl, n in counts.items():
        print(f"  migrated {n:>4} rows -> {tbl}")
    print("Done.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
