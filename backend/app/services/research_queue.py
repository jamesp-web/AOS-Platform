"""Research queue: one job per unique company + async runner (port of researchQueue/Job/Runner.js)."""
import asyncio
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Dict, List, Optional

from . import normalize as N

STATUS = {"PENDING": "pending", "QUEUED": "queued", "RESEARCHING": "researching",
          "COMPLETED": "completed", "FAILED": "failed", "SKIPPED": "skipped", "CACHED": "cached"}
LABELS = {v: v.capitalize() for v in STATUS.values()}
RESEARCH_VERSION = "v1"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _create_job(company: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "companyId": company["id"], "companyName": company["crm"]["brandName"],
        "status": STATUS["PENDING"], "createdAt": _now(), "startedAt": None, "completedAt": None,
        "retryCount": 0, "lastError": None, "researchVersion": RESEARCH_VERSION,
    }


class _UF:
    def __init__(self, ids: List[str]):
        self.p = {i: i for i in ids}

    def find(self, x: str) -> str:
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a: str, b: str) -> None:
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[ra] = rb


def build(companies: List[Dict[str, Any]], validation: Dict[str, Any]) -> Dict[str, Any]:
    companies = companies or []
    uf = _UF([c["id"] for c in companies])
    for d in (validation or {}).get("duplicates", []):
        if d["type"] in ("exact", "fuzzy"):
            uf.union(d["members"][0]["id"], d["members"][1]["id"])
    clusters: Dict[str, List[Dict[str, Any]]] = {}
    for c in companies:
        clusters.setdefault(uf.find(c["id"]), []).append(c)
    jobs = []
    for c in companies:
        rep = clusters[uf.find(c["id"])][0]
        job = _create_job(c)
        if rep["id"] != c["id"]:
            job.update(status=STATUS["SKIPPED"], completedAt=_now(),
                       lastError=f'Duplicate of {rep["crm"]["brandName"]}')
        jobs.append(job)
    return {"jobs": jobs, "version": RESEARCH_VERSION, "builtAt": _now()}


def stats(jobs: List[Dict[str, Any]]) -> Dict[str, Any]:
    jobs = jobs or []
    s = {k: 0 for k in ("pending", "queued", "researching", "completed", "failed", "skipped", "cached")}
    for j in jobs:
        if j["status"] in s:
            s[j["status"]] += 1
    s["total"] = len(jobs)
    processable = s["total"] - s["skipped"]
    done = s["completed"] + s["cached"]
    s["progress"] = round(done / processable * 100) if processable else 100
    s["remaining"] = s["pending"] + s["queued"] + s["researching"]
    return s


def reset_failed(jobs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    for j in jobs:
        if j["status"] == STATUS["FAILED"]:
            j.update(status=STATUS["PENDING"], startedAt=None, completedAt=None)
    return jobs


async def run_research(
    companies: List[Dict[str, Any]],
    jobs: List[Dict[str, Any]],
    research_fn: Callable[[Dict[str, Any]], Awaitable[Dict[str, Any]]],
    cache_get: Callable[[str], Optional[Dict[str, Any]]] = lambda k: None,
    cache_set: Callable[[str, Dict[str, Any]], None] = lambda k, v: None,
    limit: Optional[int] = None,
    force: bool = False,
) -> None:
    """Process pending jobs CONCURRENTLY — the tavily_service semaphore caps how many
    hit the API at once (TAVILY_CONCURRENCY), so this is fast without blowing rate limits.
    Cache hit → Cached; success → Completed; failure isolated → Failed.
    ``force`` re-fetches even already-researched jobs and ignores/overwrites the cache."""
    by_id = {c["id"]: c for c in companies}
    if force:
        pending = [j for j in jobs if j["status"] != STATUS["SKIPPED"]]
    else:
        pending = [j for j in jobs if j["status"] in (STATUS["PENDING"], STATUS["QUEUED"])]
    if limit is not None:
        pending = pending[:limit]

    async def _one(job: Dict[str, Any]) -> None:
        company = by_id.get(job["companyId"])
        if not company:
            return
        key = N.name(company["crm"]["brandName"])[0] or company["crm"]["brandName"]
        cached = None if force else cache_get(key)
        if cached:
            company["ai"]["research"] = cached
            company["ai"]["researchStatus"] = "cached"
            job.update(status=STATUS["CACHED"], completedAt=_now(), lastError=None)
            return
        job.update(status=STATUS["RESEARCHING"], startedAt=_now(), lastError=None)
        try:
            result = await research_fn(company)   # gated by the tavily_service semaphore
            company["ai"]["research"] = result
            company["ai"]["researchStatus"] = "done"
            cache_set(key, result)
            job.update(status=STATUS["COMPLETED"], completedAt=_now(), lastError=None)
        except Exception as exc:  # noqa: BLE001 — isolate per-company failure
            company["ai"]["researchStatus"] = "failed"
            job.update(status=STATUS["FAILED"], completedAt=_now(),
                       retryCount=job["retryCount"] + 1, lastError=str(exc))

    await asyncio.gather(*[_one(job) for job in pending])
