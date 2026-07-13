# Deploying ALIP — everything on Vercel

Both the **static frontend** and the **FastAPI backend** (as Python **serverless functions**) run on Vercel.
No second platform.

```
Browser → Vercel
           ├─ static:   index.html + src/**
           └─ /api/*  → api/index.py   (FastAPI, serverless)
                          ├─ Groq (LLM)        — cloud, NOT Ollama
                          ├─ Tavily (research)
                          └─ Supabase (Postgres, transaction pooler)
```

## What's already wired for this
- **`api/index.py`** — serverless entrypoint that serves the FastAPI app.
- **`vercel.json`** — builds the Python function + static files, routes `/api/*` and `/health` to it.
- **`requirements.txt`** (root) — lean deps Vercel installs (no uvicorn/supabase-client).
- **Serverless-safe:** scratch dirs use `/tmp`; the DB uses `NullPool` (no cross-invocation connections).
- **Batched:** research + scoring run **8 at a time**, so each request finishes within Vercel's timeout.

## 1. Push to GitHub (not a git repo yet)
```bash
cd /Users/apple/alip-dashboard
git init && git add -A && git commit -m "ALIP"
gh repo create alip --private --source=. --push      # or create on github.com + push
```
`.gitignore` keeps `.env`, `alip.db`, `.venv`, `node_modules` out.

## 2. Import to Vercel
Vercel → **Add New → Project** → import the repo. `vercel.json` defines the build, so just **Deploy**.
(If asked for a Framework Preset, choose **Other**; leave Build/Output empty.)

## 3. Set Environment Variables  (Vercel → Project → Settings → Environment Variables)
| Key | Value |
|---|---|
| `OPENAI_BASE_URL` | `https://api.groq.com/openai/v1/chat/completions` |
| `OPENAI_MODEL` | `llama-3.1-8b-instant` |
| `OPENAI_API_KEY` | *your Groq key* |
| `TAVILY_API_KEY` | *your Tavily key* |
| `DATABASE_URL` | Supabase **transaction pooler** URI (see below) |
| `ALIP_ENV` | `production` |

**DATABASE_URL for serverless — use the *Transaction* pooler (port `6543`), not the session one:**
```
postgresql://postgres.<ref>:<password>@aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres
```
Same host as your working pooler string, just port **6543** (best for short-lived serverless connections).
Redeploy after setting the vars.

## 4. Verify
- `https://YOUR-APP.vercel.app/health` → `{"ok": true, "persistence": "postgresql", …}`
- Open the app → your migrated data (222 companies) loads → upload / research / score all work.

## Limits & gotchas — read this
- **Free (Hobby) tier caps each request at 10 s.** Batches are sized (8) to fit, but large operations take more
  round-trips. **Vercel Pro raises it to 60 s** — much smoother for research/scoring. Upgrade if it feels tight.
- **Cold starts:** first request after idle spins up the Python function (~1–3 s).
- **No Ollama** in the cloud — production uses Groq (above).
- **First-deploy errors** show in the Vercel **build log** (usually an import path or a missing env var). Send me
  the error and I'll fix it — I can't run Vercel's runtime locally.
- **Transaction pooler + psycopg2** is fine (SQLAlchemy + psycopg2 don't use server-side prepared statements).

## Alternative
If serverless timeouts get annoying, host the backend on **Render** (persistent, no timeout) and keep the frontend
on Vercel — see `docs/deploy.md`. You'd revert `vercel.json` to the rewrite-proxy version.
