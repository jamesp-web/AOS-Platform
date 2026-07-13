"""Tavily research service (server-side only). Real API when a key is set;
deterministic offline stub otherwise so the pipeline runs without credentials."""
import asyncio
import hashlib
from datetime import datetime, timezone
from typing import Any, Dict, Optional

import httpx

from ..config import get_settings
from ..logging_config import get_logger
from ..utils.retry import backoff_seconds
from . import normalize as N

log = get_logger("tavily")
TAVILY_URL = "https://api.tavily.com/search"

# Reference / dictionary / social domains that pollute entity resolution for
# ambiguous Indian brand names (e.g. "Apsara" = a mythological term, a pencil
# brand and a restaurant — none of which is the ice-cream company we mean).
NOISE_DOMAINS = [
    "wikipedia.org", "britannica.com", "yelp.com", "tripadvisor.com", "reddit.com",
    "quora.com", "facebook.com", "instagram.com", "youtube.com", "pinterest.com",
    "twitter.com", "x.com",
]

# Process-wide gate on concurrent research calls (see openai_service for rationale).
_tavily_sem: Optional[asyncio.Semaphore] = None


def _semaphore() -> asyncio.Semaphore:
    global _tavily_sem
    if _tavily_sem is None:
        _tavily_sem = asyncio.Semaphore(max(1, get_settings().tavily_concurrency))
    return _tavily_sem


def _query(name: str) -> str:
    # Quote the exact brand name to anchor the entity and reduce same-name collisions.
    return (f'"{name}" India company — official website, industry and products/services, '
            "advertising activity, financial health, hiring and expansion news")


def _stub(company: Dict[str, Any]) -> Dict[str, Any]:
    name = company["crm"]["brandName"]
    slug = N.name(name)[0].replace(" ", "-") or "company"
    return {
        "provider": "stub", "query": _query(name),
        "answer": f"{name} is an active brand in the Indian market with commercial activity relevant to DOOH advertising.",
        "sources": [
            {"title": f"{name} — Official", "url": f"https://example.com/{slug}", "snippet": f"Overview of {name}."},
            {"title": f"{name} — News", "url": f"https://news.example.com/{slug}", "snippet": "Hiring and expansion signals."},
        ],
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
    }


async def research(company: Dict[str, Any]) -> Dict[str, Any]:
    """Return normalised research for a company. Raises on hard failure (queue isolates it)."""
    settings = get_settings()
    if not settings.has_tavily:
        return _stub(company)

    name = company["crm"]["brandName"]
    # Depth is configurable: 'basic' is fast (~1 credit); 'advanced' is thorough (~2).
    # Noise-domain exclusion keeps entity resolution clean at either depth.
    payload = {"api_key": settings.tavily_api_key, "query": _query(name),
               "search_depth": settings.tavily_search_depth, "max_results": 6, "include_answer": True,
               "exclude_domains": NOISE_DOMAINS}

    async with httpx.AsyncClient(timeout=settings.tavily_timeout) as client:
        last_exc: Exception = RuntimeError("Tavily request failed")
        for attempt in range(settings.tavily_max_retries + 1):
            try:
                async with _semaphore():   # serialize in-flight research calls (rate-limit guard)
                    resp = await client.post(TAVILY_URL, json=payload)
                if resp.status_code == 429 or resp.status_code >= 500:
                    raise httpx.HTTPStatusError("retryable", request=resp.request, response=resp)
                resp.raise_for_status()
                data = resp.json()
                return {
                    "provider": "tavily", "query": payload["query"], "answer": data.get("answer", ""),
                    "sources": [{"title": r.get("title"), "url": r.get("url"), "snippet": (r.get("content") or "")[:400]}
                                for r in data.get("results", [])],
                    "fetchedAt": datetime.now(timezone.utc).isoformat(),
                }
            except Exception as exc:  # noqa: BLE001
                last_exc = exc
                if attempt >= settings.tavily_max_retries:
                    break
                import asyncio
                await asyncio.sleep(backoff_seconds(attempt))
        log.warning("Tavily failed for %s: %s", name, last_exc)
        raise last_exc
