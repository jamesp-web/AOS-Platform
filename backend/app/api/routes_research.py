"""POST /research/start · GET /research/status — run Tavily research on the queue."""
from fastapi import APIRouter, Query

from ..database import repository
from ..logging_config import get_logger
from ..models.schemas import MessageResponse, ResearchStatusResponse, SessionRequest
from ..services import research_queue, tavily_service
from .deps import require_session

router = APIRouter(tags=["research"])
log = get_logger("api.research")


@router.post("/research/start", response_model=MessageResponse)
async def start_research(req: SessionRequest) -> MessageResponse:
    session = require_session(req.session_id)
    companies, research = session["companies"], session["research"]
    await research_queue.run_research(
        companies, research["jobs"], tavily_service.research,
        cache_get=repository.cache_get, cache_set=repository.cache_set, limit=req.limit,
    )
    repository.save_session(req.session_id, session)
    stats = research_queue.stats(research["jobs"])
    log.info("Research %s done (limit=%s): %s", req.session_id, req.limit, stats)
    return MessageResponse(ok=True, message="Research complete", detail=stats)


@router.post("/research/retry", response_model=MessageResponse)
async def retry_failed(req: SessionRequest) -> MessageResponse:
    session = require_session(req.session_id)
    research_queue.reset_failed(session["research"]["jobs"])
    await research_queue.run_research(
        session["companies"], session["research"]["jobs"], tavily_service.research,
        cache_get=repository.cache_get, cache_set=repository.cache_set,
    )
    repository.save_session(req.session_id, session)
    return MessageResponse(ok=True, message="Retried failed jobs", detail=research_queue.stats(session["research"]["jobs"]))


@router.get("/research/status", response_model=ResearchStatusResponse)
async def research_status(session_id: str = Query(...)) -> ResearchStatusResponse:
    session = require_session(session_id)
    jobs = session["research"]["jobs"]
    return ResearchStatusResponse(session_id=session_id, stats=research_queue.stats(jobs), jobs=jobs)
