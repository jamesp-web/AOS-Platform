# Deploying ALIP — Frontend on Vercel + Backend on Render

ALIP is **two pieces**: a **static frontend** (Vercel) and a **FastAPI backend** (Render/Railway/Fly).
The frontend calls `/api/*`, and a Vercel **rewrite proxies that to the backend** — so there's no CORS
and no hard-coded localhost.

```
Browser → Vercel (static frontend)  →  Render (FastAPI)
                                          ├─ Groq/Gemini (LLM — cloud, NOT Ollama)
                                          ├─ Tavily (research)
                                          └─ Supabase (Postgres)
```

## 0. Prerequisites
- **Push to GitHub** (this isn't a git repo yet). The included `.gitignore` keeps `.env`, `alip.db`,
  `.venv`, and `node_modules` out:
  ```bash
  cd /Users/apple/alip-dashboard
  git init && git add -A && git commit -m "ALIP"
  gh repo create alip --private --source=. --push     # or create on github.com and push
  ```
- A **cloud LLM key** — Ollama is on your laptop and can't be reached from the cloud. Use **Groq**
  (`llama-3.1-8b-instant` — free + fast) or **Gemini** (`gemini-2.0-flash`).
- Your **Supabase** `DATABASE_URL` (the **session pooler**, port 5432) — already prepped & migrated.

## 1. Backend → Render
1. Render → **New → Blueprint** → select this repo (it reads `render.yaml`).
   *(Or New → Web Service: Root Directory `backend`, Build `pip install -r requirements.txt`,
   Start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.)*
2. Set **Environment Variables** (dashboard):

   | Key | Example value |
   |---|---|
   | `OPENAI_BASE_URL` | `https://api.groq.com/openai/v1/chat/completions` |
   | `OPENAI_MODEL` | `llama-3.1-8b-instant` |
   | `OPENAI_API_KEY` | *your Groq key* |
   | `TAVILY_API_KEY` | *your Tavily key* |
   | `DATABASE_URL` | *your Supabase pooler URI* |
   | `ALIP_CORS_ORIGINS` | `https://YOUR-APP.vercel.app` |
   | `ALIP_ENV` | `production` |

3. Deploy → note the URL (e.g. `https://alip-api.onrender.com`) → check `/health` returns `{"ok": true …}`.

## 2. Frontend → Vercel
1. Edit **`vercel.json`** → replace `REPLACE-WITH-YOUR-BACKEND-URL` with your Render host
   (e.g. `alip-api.onrender.com`). Commit + push.
2. Vercel → **New Project** → import this repo:
   - **Framework Preset: Other**
   - **Build Command: (leave empty)**
   - **Output Directory: (leave empty)**
3. Deploy. Vercel serves `index.html`; `vercel.json` proxies `/api/*` to your backend.

## 3. Verify
Open the Vercel URL → upload a CRM → run research + scoring. The browser calls `/api/...`
(same-origin), Vercel forwards it to Render, and the backend does the work with its own keys.

## Notes & gotchas
- **Render free tier sleeps** after 15 min idle and takes ~30 s to wake — the first request is slow.
  Keep it warm (a cron ping) or upgrade for production.
- **Long jobs:** scoring is **batched & resumable**, so each request is short — fine for Render and the
  Vercel proxy. Use a **fast cloud LLM** so batches finish quickly (Groq 8B ≈ 1 s/company).
- **No-proxy alternative:** instead of the Vercel rewrite, set `window.ALIP_API_BASE` (or localStorage
  `alip.api.base`) to your backend URL, and set `ALIP_CORS_ORIGINS` to your Vercel domain.
- **Never commit secrets** — set them in the Render/Vercel dashboards, not in the repo. `.env` is gitignored.
- **Database:** production must use Supabase (`DATABASE_URL`); the SQLite file is local-only and won't
  persist on Render. See `docs/supabase-setup.md`.
