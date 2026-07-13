"""SQLAlchemy tables for ALIP persistence.

Session state (companies + validation + research) is stored as a JSON payload —
it round-trips the exact canonical shape the frontend hydrates, so no lossy
mapping. Research results are cached in their own table with a fetch timestamp.
"""
from sqlalchemy import Float, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


class SessionRow(Base):
    __tablename__ = "alip_sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON, nullable=False)


class ResearchCacheRow(Base):
    __tablename__ = "alip_research_cache"

    cache_key: Mapped[str] = mapped_column(String, primary_key=True)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)
    fetched_at: Mapped[float] = mapped_column(Float, nullable=False)
