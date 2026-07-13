"""Central configuration via environment variables (pydantic-settings).

Secrets (OpenAI / Tavily / Supabase keys) are read here and used only inside
backend services — they are never returned in any API response.
"""
import os
import tempfile
from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent          # backend/app
# On read-only serverless filesystems (Vercel), scratch dirs must live under /tmp.
IS_SERVERLESS = bool(os.environ.get("VERCEL") or os.environ.get("AWS_LAMBDA_FUNCTION_NAME"))
DATA_ROOT = (Path(tempfile.gettempdir()) / "alip") if IS_SERVERLESS else BASE_DIR


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # App
    env: str = Field("development", alias="ALIP_ENV")
    log_level: str = Field("INFO", alias="ALIP_LOG_LEVEL")
    cors_origins: str = Field("http://127.0.0.1:5173,http://localhost:5173", alias="ALIP_CORS_ORIGINS")

    # LLM analyst (OpenAI-compatible — works with OpenAI, Groq, Gemini, Ollama, OpenRouter…)
    openai_api_key: str = Field("", alias="OPENAI_API_KEY")
    openai_base_url: str = Field("https://api.openai.com/v1/chat/completions", alias="OPENAI_BASE_URL")
    openai_model: str = Field("gpt-5.5", alias="OPENAI_MODEL")
    openai_fallback_model: str = Field("gpt-4o-mini", alias="OPENAI_FALLBACK_MODEL")
    openai_timeout: float = Field(30, alias="OPENAI_TIMEOUT")
    openai_max_retries: int = Field(3, alias="OPENAI_MAX_RETRIES")
    llm_concurrency: int = Field(1, alias="LLM_CONCURRENCY")        # max simultaneous LLM calls, process-wide

    # Tavily
    tavily_api_key: str = Field("", alias="TAVILY_API_KEY")
    tavily_timeout: float = Field(20, alias="TAVILY_TIMEOUT")
    tavily_max_retries: int = Field(3, alias="TAVILY_MAX_RETRIES")
    tavily_concurrency: int = Field(5, alias="TAVILY_CONCURRENCY")   # max simultaneous research calls, process-wide
    tavily_search_depth: str = Field("basic", alias="TAVILY_SEARCH_DEPTH")  # 'basic' (fast, 1 credit) or 'advanced' (thorough, 2)

    # Cache
    research_cache_ttl_days: int = Field(7, alias="RESEARCH_CACHE_TTL_DAYS")

    # Supabase / Postgres
    supabase_url: str = Field("", alias="SUPABASE_URL")
    supabase_key: str = Field("", alias="SUPABASE_KEY")
    database_url: str = Field("", alias="DATABASE_URL")

    # Paths (relocated to /tmp on serverless — see DATA_ROOT)
    upload_dir: Path = DATA_ROOT / "uploads"
    export_dir: Path = DATA_ROOT / "exports"
    cache_dir: Path = DATA_ROOT / "cache"

    @property
    def cors_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def has_openai(self) -> bool:
        return bool(self.openai_api_key)

    @property
    def use_llm(self) -> bool:
        # a key, or a local endpoint (Ollama needs no key)
        return bool(self.openai_api_key) or "localhost" in self.openai_base_url or "127.0.0.1" in self.openai_base_url

    @property
    def llm_host(self) -> str:
        try:
            return self.openai_base_url.split("://", 1)[1].split("/", 1)[0]
        except Exception:
            return self.openai_base_url

    @property
    def has_tavily(self) -> bool:
        return bool(self.tavily_api_key)

    @property
    def use_supabase(self) -> bool:
        return bool(self.supabase_url and self.supabase_key) or bool(self.database_url)


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    for d in (s.upload_dir, s.export_dir, s.cache_dir):
        try:
            d.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass   # read-only FS (serverless) — these scratch dirs are optional
    return s
