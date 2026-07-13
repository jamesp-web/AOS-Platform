"""API request/response schemas (pydantic v2) — used for validation + docs."""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class SessionRequest(BaseModel):
    session_id: str = Field(..., min_length=4, description="Session returned by /upload")
    limit: Optional[int] = Field(None, ge=1, description="Optional: only process the first N companies (cost control / testing)")
    force: bool = Field(False, description="Optional: ignore any cached research and re-fetch (used to fix wrong-entity results)")


class AnalyzeRequest(SessionRequest):
    rescore: bool = True


class ExportRequest(SessionRequest):
    pass


class UploadResponse(BaseModel):
    session_id: str
    file_name: str
    extracted: int
    skipped: int
    mapping: Dict[str, Any]
    validation_summary: Dict[str, Any]
    research_summary: Dict[str, Any]


class ResearchStatusResponse(BaseModel):
    session_id: str
    stats: Dict[str, Any]
    jobs: List[Dict[str, Any]]


class MessageResponse(BaseModel):
    ok: bool = True
    message: str = ""
    detail: Optional[Dict[str, Any]] = None


class CompaniesResponse(BaseModel):
    session_id: str
    total: int
    companies: List[Dict[str, Any]]


class DashboardResponse(BaseModel):
    session_id: str
    kpis: Dict[str, Any]
    executive_brief: Dict[str, Any]
    actions: List[Dict[str, Any]]
    insights: List[str]
    charts: Dict[str, Any]
