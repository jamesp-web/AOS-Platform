"""POST /analyze — OpenAI analyst + deterministic scoring over researched companies."""
from fastapi import APIRouter

from ..database import repository
from ..logging_config import get_logger
from ..models.schemas import AnalyzeRequest, MessageResponse
from ..services import intelligence_pipeline
from .deps import require_session

router = APIRouter(tags=["intelligence"])
log = get_logger("api.analyze")

# Seconds between LLM calls — paces requests under Groq/OpenAI free-tier rate limits.
# Kept small so a batch fits serverless timeouts; the 429 backoff + LLM concurrency
# guard handle rate limits regardless.
_PACE = 0.3


@router.post("/analyze", response_model=MessageResponse)
async def analyze(req: AnalyzeRequest) -> MessageResponse:
    session = require_session(req.session_id)

    def _save() -> None:
        repository.save_session(req.session_id, session)

    result = await intelligence_pipeline.run(
        session["companies"], rescore=req.rescore, limit=req.limit, pace=_PACE, save_cb=_save,
    )
    _save()
    return MessageResponse(ok=True, message="Analysis & scoring complete", detail=result)
