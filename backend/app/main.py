"""ALIP backend — FastAPI application.

The browser talks ONLY to this API. OpenAI, Tavily and Supabase are called
exclusively server-side; their keys never leave the backend.
"""
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from . import __version__
from .config import get_settings
from .logging_config import configure_logging, get_logger

settings = get_settings()
configure_logging(settings.log_level)
log = get_logger("app")

app = FastAPI(
    title="AdOnMo Lead Intelligence Platform — API",
    version=__version__,
    description="AI intelligence layer on the CRM. Excel → Validation → Research → Analysis → Scoring → Dashboard → Export.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started = time.time()
    response = await call_next(request)
    log.info("%s %s → %s (%.0f ms)", request.method, request.url.path, response.status_code, (time.time() - started) * 1000)
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    log.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"ok": False, "error": "Internal server error"})


from .database import repository  # noqa: E402


@app.on_event("startup")
async def _startup():
    backend = repository.init()          # creates tables when a DB is configured
    log.info("Persistence backend: %s", backend)


@app.get("/health", tags=["meta"])
async def health():
    return {
        "ok": True, "version": __version__, "env": settings.env,
        "llm": {"active": settings.use_llm, "provider": settings.llm_host, "model": settings.openai_model},
        "tavily": settings.has_tavily,
        "persistence": repository.persistence_backend(),
    }


# ── routers ──
from .api import (  # noqa: E402
    routes_analyze, routes_companies, routes_dashboard, routes_export, routes_research, routes_upload,
)

for r in (routes_upload, routes_research, routes_companies, routes_analyze, routes_dashboard, routes_export):
    app.include_router(r.router, prefix="/api")

log.info("ALIP API v%s ready (env=%s, openai=%s, tavily=%s)", __version__, settings.env, settings.has_openai, settings.has_tavily)
