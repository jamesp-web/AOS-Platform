"""GET /dashboard · GET /founder-insights — executive aggregates."""
from fastapi import APIRouter, Query

from ..models.schemas import DashboardResponse
from ..services import selectors
from .deps import require_session

router = APIRouter(tags=["dashboard"])


@router.get("/dashboard", response_model=DashboardResponse)
async def dashboard(session_id: str = Query(...)) -> DashboardResponse:
    s = require_session(session_id)
    c, v, r = s["companies"], s["validation"], s["research"]
    return DashboardResponse(
        session_id=session_id,
        kpis=selectors.compute_kpis(c, v, r),
        executive_brief=selectors.compute_executive_brief(c, v, r),
        actions=selectors.compute_actions(c, v, r),
        insights=selectors.compute_insights(c, v, r),
        charts=selectors.compute_charts(c, v, r),
    )


@router.get("/founder-insights")
async def founder_insights(session_id: str = Query(...)) -> dict:
    s = require_session(session_id)
    c, v, r = s["companies"], s["validation"], s["research"]
    leaders = [selectors.company_view(x, v, r) for x in
               sorted([x for x in c if selectors.score_of(x) is not None], key=selectors.score_of, reverse=True)[:8]]
    return {"session_id": session_id, "insights": selectors.compute_founder_insights(c, v, r), "scoreLeaders": leaders}
