"""GET /companies · GET /company/{id} · POST /company/{id}/enrich — company data."""
from fastapi import APIRouter, HTTPException, Query

from ..database import repository
from ..logging_config import get_logger
from ..models.schemas import CompaniesResponse, SessionRequest
from ..services import intelligence_pipeline, research_queue, selectors, tavily_service
from .deps import require_session

router = APIRouter(tags=["companies"])
log = get_logger("api.companies")


@router.get("/sessions")
async def list_sessions() -> dict:
    """Summary of every stored upload — powers the header session switcher."""
    return {"sessions": repository.list_sessions()}


@router.get("/session/{session_id}")
async def get_session_state(session_id: str) -> dict:
    """Full pipeline state for the frontend to hydrate its store (UI stays unchanged)."""
    s = require_session(session_id)
    return {
        "session_id": session_id, "file_name": s.get("file_name"), "sheet_name": s.get("sheet_name"),
        "mapping": s.get("mapping"), "skipped": s.get("skipped", 0),
        "companies": s.get("companies", []), "validation": s.get("validation"), "research": s.get("research"),
    }


@router.delete("/session/{session_id}")
async def delete_session(session_id: str) -> dict:
    """Delete one stored upload (used by the switcher to clean up redundant sessions)."""
    if not repository.delete_session(session_id):
        raise HTTPException(status_code=404, detail=f"Session '{session_id}' not found.")
    log.info("Deleted session %s", session_id)
    return {"ok": True, "session_id": session_id}


@router.get("/companies", response_model=CompaniesResponse)
async def list_companies(session_id: str = Query(...)) -> CompaniesResponse:
    session = require_session(session_id)
    companies, validation, research = session["companies"], session["validation"], session["research"]
    views = [selectors.company_view(c, validation, research) for c in companies]
    views.sort(key=lambda v: (v["score"] if v["score"] is not None else -1), reverse=True)
    return CompaniesResponse(session_id=session_id, total=len(companies), companies=views)


@router.get("/company/{company_id}")
async def get_company(company_id: str, session_id: str = Query(...)) -> dict:
    session = require_session(session_id)
    for c in session["companies"]:
        if c["id"] == company_id:
            return {"session_id": session_id, "company": c,
                    "view": selectors.company_view(c, session["validation"], session["research"])}
    raise HTTPException(status_code=404, detail=f"Company '{company_id}' not found in session.")


@router.post("/company/{company_id}/enrich")
async def enrich_company(company_id: str, req: SessionRequest) -> dict:
    """Research (Tavily) + analyse (LLM) + score just ONE company, on demand."""
    session = require_session(req.session_id)
    companies, research = session["companies"], session["research"]
    company = next((c for c in companies if c["id"] == company_id), None)
    if not company:
        raise HTTPException(status_code=404, detail=f"Company '{company_id}' not found in session.")

    job = next((j for j in research["jobs"] if j["companyId"] == company_id), None)
    if job and job["status"] == "skipped":
        raise HTTPException(status_code=409, detail=f"'{company['crm']['brandName']}' is a duplicate — nothing to research.")

    # 1) research this one. Normally only if still pending/queued; with force, re-fetch
    #    even a cached/completed job and overwrite the (possibly wrong-entity) cache.
    if job and (req.force or job["status"] in ("pending", "queued")):
        await research_queue.run_research([company], [job], tavily_service.research,
                                          cache_get=repository.cache_get, cache_set=repository.cache_set,
                                          force=req.force)
    # 2) analyse + score just this one (LLM analyst → deterministic scoring)
    result = await intelligence_pipeline.run([company], rescore=True)
    repository.save_session(req.session_id, session)

    view = selectors.company_view(company, session["validation"], research)
    log.info("Enriched %s (%s): score=%s", company_id, company["crm"]["brandName"], view.get("score"))
    return {"ok": result["failed"] == 0, "session_id": req.session_id, "company": company, "view": view,
            "error": (company["ai"].get("analysisError") if result["failed"] else None)}
