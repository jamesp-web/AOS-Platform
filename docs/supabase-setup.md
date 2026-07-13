# Switching ALIP persistence to Supabase (Postgres)

ALIP stores everything — uploaded **sessions** and the **research cache** — behind a
small data-access layer (`backend/app/database/repository.py`). It uses **SQLite**
locally and **Postgres/Supabase** the moment `DATABASE_URL` is set. **No code changes
are required** — `db.py` already applies SQLite-only options conditionally and uses
`pool_pre_ping` (ideal for Supabase), and the tables use a portable `JSON` column type.

## 1. Create the Supabase project
1. Sign in at https://supabase.com → **New project**.
2. Set a strong **database password** (you'll need it below) and pick a region close to your server.
3. Wait for provisioning to finish.

## 2. Get the connection string
Supabase dashboard → **Project Settings → Database → Connection string → URI**.
Use the **`postgresql://`** scheme (if it shows `postgres://`, change it to `postgresql://`).

- **Direct connection** — recommended for this always-on FastAPI server:
  ```
  postgresql://postgres:YOUR_DB_PASSWORD@db.YOUR_REF.supabase.co:5432/postgres
  ```
- If your host needs SSL explicitly, append `?sslmode=require`.

## 3. Point ALIP at it
In `backend/.env` (see `backend/.env.example` for the full template):
```
DATABASE_URL=postgresql://postgres:YOUR_DB_PASSWORD@db.YOUR_REF.supabase.co:5432/postgres
```

## 4. Restart — tables auto-create
```
cd backend
.venv/bin/uvicorn app.main:app --port 8000
```
On startup ALIP creates `alip_sessions` and `alip_research_cache` if they don't exist.
Confirm it picked Supabase:
```
curl -s http://127.0.0.1:8000/health     #  "persistence": "postgresql"
```

## 5. (Optional) Move your existing data over
Copy the current SQLite sessions + research cache into Supabase. Idempotent (upserts
by primary key), so it's safe to re-run:
```
cd backend
# preview counts first (no target needed):
.venv/bin/python scripts/migrate_to_supabase.py --dry-run

# then migrate:
.venv/bin/python scripts/migrate_to_supabase.py "postgresql://postgres:YOUR_DB_PASSWORD@db.YOUR_REF.supabase.co:5432/postgres"
```

## Notes & gotchas
- **Which pooler?** For a long-running server use the **direct** connection or the
  **session-mode** pooler (port **5432**). Avoid the **transaction** pooler (port 6543)
  — it disables the prepared statements SQLAlchemy relies on.
- **JSON vs JSONB:** payloads are stored as `JSON`. If you later want to *query inside*
  the payload in Supabase, switch the two columns to `JSONB` (one-line change in
  `models_sql.py` + an `ALTER TABLE`). For ALIP's fetch-by-key access, `JSON` is fine.
- **Secrets stay server-side:** `DATABASE_URL` is read only by the backend and is never
  returned by any API. Keep `.env` out of git (it already is).
- **Auth/Storage (optional):** the `supabase` client is already installed. Set
  `SUPABASE_URL` + `SUPABASE_KEY` if you later add Supabase Auth (real logins) or Storage
  (uploaded-file archive) — neither is required for the DB switch.
