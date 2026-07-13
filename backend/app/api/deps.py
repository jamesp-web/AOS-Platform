"""Shared API dependencies."""
from typing import Any, Dict

from fastapi import HTTPException

from ..database import repository


def require_session(session_id: str) -> Dict[str, Any]:
    session = repository.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Unknown session_id '{session_id}'. Upload a CRM first.")
    return session
