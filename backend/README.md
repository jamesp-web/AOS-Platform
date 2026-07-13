# ALIP Backend (FastAPI)

Production backend for the AdOnMo Lead Intelligence Platform. The browser talks
**only** to this API — OpenAI, Tavily and Supabase are called exclusively
server-side and their keys never leave the backend.

## Architecture

```
backend/app/
  main.py            FastAPI app (CORS, logging, error handling, routers)
  config.py          env-driven settings (pydantic-settings)
  logging_config.py  structured logging
  api/               REST routes (upload, research, companies, analyze, dashboard, export)
  services/          Excel · Duplicate · ResearchQueue · Tavily · OpenAI · Scoring · Pipeline · Selectors · Export
  models/            canonical company + request/response schemas
  database/          store (in-memory now; Supabase/Postgres seam) + research cache
  prompts/           versioned analyst prompt
  utils/             ids · TTL cache · retry
  cache/ uploads/ exports/   runtime artifacts
```

**Separation preserved:** OpenAI is an analyst only (whitelisted output); the
**ScoringEngine** is deterministic and owns the Opportunity Score, recommendations
and insights.

## REST API (prefix `/api`)

| Method | Path | Purpose |
|---|---|---|
| POST | `/upload` | parse `.xlsx` → validate → build queue → open session |
| POST | `/research/start` | run Tavily research on pending jobs (cached, isolated) |
| POST | `/research/retry` | re-queue + run failed jobs |
| GET  | `/research/status` | queue stats + jobs |
| GET  | `/companies` | enriched company list |
| GET  | `/company/{id}` | one company (full + view) |
| POST | `/analyze` | OpenAI analyst + deterministic scoring |
| GET  | `/dashboard` | KPIs, executive brief, actions, insights, charts |
| GET  | `/founder-insights` | auto insights + score leaders |
| POST | `/export` | enriched `.xlsx` download |
| GET  | `/health` | status + which integrations are configured |

All write endpoints take a `session_id` (returned by `/upload`).

## Run

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # add OPENAI_API_KEY / TAVILY_API_KEY (optional in dev)
uvicorn app.main:app --reload --port 8000
# docs: http://127.0.0.1:8000/docs
```

Without keys the pipeline still runs end-to-end using deterministic offline
stubs; without a database it uses an in-memory store. Add credentials in `.env`
to go live — **never commit `.env`**.

### Persistence (Supabase / Postgres)

Set `DATABASE_URL` to your Supabase Postgres connection string
(Supabase → Project Settings → Database → Connection string → URI):

```
DATABASE_URL=postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres
```

On startup the app creates two tables — `alip_sessions` (session state as JSON)
and `alip_research_cache` — via SQLAlchemy `create_all`, so **no manual
migration is needed**. `GET /health` shows the active backend
(`"persistence": "postgresql" | "sqlite" | "memory"`). Local dev/tests can use
`DATABASE_URL=sqlite:///./alip.db`. Postgres needs `psycopg2-binary` (in
requirements); SQLite needs nothing extra.

## Tests

```bash
python3 backend/tests/test_core.py     # pure-Python: scoring=93, dedup, queue, selectors
```

## Next

- Wire the frontend's local services to these endpoints (an `apiClient` swap;
  the UI stays unchanged).
- Back the repository with Supabase/Postgres (single seam in `database/`).
