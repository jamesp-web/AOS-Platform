"""OpenAI intelligence analyst (server-side only). Resilient: retries, timeouts,
model fallback, invalid-JSON salvage. Returns structured intelligence ONLY —
never a score or recommendation. Never raises to the caller (returns a result dict).
Port of the frontend openaiService.js, hardened for the backend."""
import asyncio
import json
import re
from typing import Any, Dict, Optional

import httpx

from ..config import get_settings
from ..logging_config import get_logger
from ..prompts import analyst_prompt as prompt
from ..utils.retry import backoff_seconds
from . import ai_stub

log = get_logger("openai")
OPENAI_URL = "https://api.openai.com/v1/chat/completions"
ALLOWED = set(prompt.ALLOWED_KEYS)
FORBIDDEN = {"opportunityScore", "score", "recommendation", "priority", "rating", "rank"}

# Process-wide gate: caps how many LLM calls hit the provider at once, so a scoring
# batch and an on-demand re-research can't saturate a shared (free-tier) rate limit.
# Created lazily inside the running event loop.
_llm_sem: Optional["asyncio.Semaphore"] = None


def _semaphore() -> "asyncio.Semaphore":
    global _llm_sem
    if _llm_sem is None:
        _llm_sem = asyncio.Semaphore(max(1, get_settings().llm_concurrency))
    return _llm_sem


def whitelist(obj: Dict[str, Any]) -> Dict[str, Any]:
    """Keep only allowed analyst keys — a score/recommendation from the model is discarded."""
    out = {k: obj[k] for k in ALLOWED if k in obj}
    for arr_key in ("keySignals", "offlineAdvertisingChannels"):
        val = out.get(arr_key)
        if not isinstance(val, list):
            out[arr_key] = [str(val)] if val else []
    # Normalise OOH channels to the known vocabulary (exact strings), dropping anything unrecognised.
    known = {c.lower(): c for c in prompt.OOH_CHANNELS}
    out["offlineAdvertisingChannels"] = [
        known[k] for x in out["offlineAdvertisingChannels"]
        if (k := str(x).strip().lower()) in known
    ]
    try:
        out["confidence"] = max(0, min(100, int(out.get("confidence", 0))))
    except (TypeError, ValueError):
        out["confidence"] = 0
    return out


def _extract_json(content: Optional[str]) -> Dict[str, Any]:
    if not content:
        raise ValueError("empty content")
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", content)
        if m:
            return json.loads(m.group(0))
        raise


def _is_model_error(text: str) -> bool:
    t = (text or "").lower()
    return "model" in t and any(w in t for w in ("does not exist", "not found", "invalid", "unknown", "unsupported"))


async def analyze(company_name: str, research: Dict[str, Any]) -> Dict[str, Any]:
    """Return {ok, data} or {ok:false, code, error}. Never raises."""
    settings = get_settings()
    if not settings.use_llm:
        # offline deterministic stub so the pipeline runs without any LLM configured
        return {"ok": True, "data": ai_stub.analyze(company_name, research), "model": "stub"}

    messages = [{"role": "system", "content": prompt.SYSTEM},
                {"role": "user", "content": prompt.build_user(company_name, research)}]

    async def call(model: str) -> Dict[str, Any]:
        body = {"model": model, "temperature": 0, "response_format": {"type": "json_object"}, "messages": messages}
        headers = {"Authorization": f"Bearer {settings.openai_api_key}"}
        async with httpx.AsyncClient(timeout=settings.openai_timeout) as client:
            for attempt in range(settings.openai_max_retries + 1):
                try:
                    async with _semaphore():   # serialize in-flight LLM calls (rate-limit guard)
                        resp = await client.post(settings.openai_base_url, json=body, headers=headers)
                    if resp.status_code == 429 or resp.status_code >= 500:
                        if attempt < settings.openai_max_retries:
                            ra = float(resp.headers.get("retry-after", 0) or 0)
                            await asyncio.sleep(backoff_seconds(attempt, ra))
                            continue
                        return {"ok": False, "code": f"http_{resp.status_code}", "error": f"OpenAI HTTP {resp.status_code}: {resp.text[:300]}"}
                    if resp.status_code in (400, 404) and _is_model_error(resp.text) and model != settings.openai_fallback_model:
                        return await call(settings.openai_fallback_model)
                    if resp.status_code >= 400:
                        return {"ok": False, "code": f"http_{resp.status_code}", "error": resp.text[:300]}
                    content = resp.json()["choices"][0]["message"]["content"]
                    return {"ok": True, "data": _extract_json(content), "model": model}
                except (json.JSONDecodeError, ValueError):
                    return {"ok": False, "code": "invalid_json", "error": "Model returned invalid JSON"}
                except httpx.TimeoutException:
                    if attempt < settings.openai_max_retries:
                        await asyncio.sleep(backoff_seconds(attempt))
                        continue
                    return {"ok": False, "code": "timeout", "error": "OpenAI request timed out"}
                except Exception as exc:  # noqa: BLE001
                    if attempt < settings.openai_max_retries:
                        await asyncio.sleep(backoff_seconds(attempt))
                        continue
                    return {"ok": False, "code": "network", "error": f"OpenAI request failed: {exc}"}
        return {"ok": False, "code": "unknown", "error": "unreachable"}

    try:
        return await call(settings.openai_model)
    except Exception as exc:  # noqa: BLE001 — belt & suspenders: never raise
        log.exception("OpenAI analyze crashed")
        return {"ok": False, "code": "fatal", "error": str(exc)}
