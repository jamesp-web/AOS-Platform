"""Deterministic-ish id helpers."""
import uuid


def company_id(index: int) -> str:
    """Stable, unique internal company id (mirrors the frontend `ALIP-00001`)."""
    return f"ALIP-{index + 1:05d}"


def session_id() -> str:
    return "sess_" + uuid.uuid4().hex[:12]


def job_id(n: int) -> str:
    return f"JOB-{n:05d}"
