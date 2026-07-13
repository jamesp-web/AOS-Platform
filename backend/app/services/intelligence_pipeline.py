"""Analyse (OpenAI) then score (deterministic) — port of intelligencePipeline.js.

Runs the two SEPARATE modules per researched company. OpenAI output is
whitelisted (analyst-only); the score is owned by the ScoringEngine.
"""
import asyncio
from typing import Any, Callable, Dict, List, Optional

from ..logging_config import get_logger
from . import openai_service, scoring_engine

log = get_logger("pipeline")


def _researched(c: Dict[str, Any]) -> bool:
    return (c.get("ai") or {}).get("researchStatus") in ("done", "completed", "cached")


def _scored(c: Dict[str, Any]) -> bool:
    return bool((c.get("ai") or {}).get("score"))


async def run(
    companies: List[Dict[str, Any]],
    rescore: bool = True,
    limit: Optional[int] = None,
    pace: float = 0.0,
    save_cb: Optional[Callable[[], None]] = None,
    save_every: int = 5,
) -> Dict[str, Any]:
    """Analyse + score researched companies. Resumable + batch-friendly:
      • rescore=False → only companies not yet scored (so repeated batches advance),
      • ``limit`` → process at most N this call (one batch),
      • ``pace`` → seconds between LLM calls (smooths Groq free-tier rate limits),
      • ``save_cb`` → persist progress every ``save_every`` companies (no work lost).
    Returns scored/failed for this batch plus ``remaining`` researched-but-unscored."""
    targets = [c for c in companies if _researched(c) and (rescore or not _scored(c))]
    if limit is not None:
        targets = targets[:limit]
    scored = failed = 0
    for i, c in enumerate(targets):
        result = await openai_service.analyze(c["crm"]["brandName"], c["ai"].get("research") or {})
        if not result.get("ok"):
            c["ai"]["analysisError"] = result.get("error", "analysis failed")
            failed += 1
        else:
            intel = openai_service.whitelist(result["data"])
            c["ai"]["intelligence"] = intel
            c["ai"]["analysisError"] = None
            c["ai"]["industry"] = intel.get("industry")
            c["ai"]["financialHealth"] = intel.get("financialHealth")
            c["ai"]["advertisingActivity"] = intel.get("advertisingActivity")
            c["ai"]["growthSignals"] = intel.get("growthSignals")
            c["ai"]["expansionSignals"] = intel.get("expansionSignals")
            c["ai"]["aiSummary"] = intel.get("businessSummary")
            # SEPARATE deterministic scoring (app-owned)
            s = scoring_engine.score(c)
            c["ai"]["score"] = s
            c["ai"]["opportunityScore"] = s["total"]
            c["ai"]["recommendation"] = s["recommendation"]
            c["ai"]["reason"] = s["businessReason"]
            scored += 1
        if save_cb and (i + 1) % save_every == 0:
            save_cb()
        if pace and i < len(targets) - 1:
            await asyncio.sleep(pace)
    if save_cb:
        save_cb()
    remaining = sum(1 for c in companies if _researched(c) and not _scored(c))
    log.info("Analysis batch: %s scored, %s failed, %s remaining", scored, failed, remaining)
    return {"scored": scored, "failed": failed, "remaining": remaining, "batch": len(targets)}
