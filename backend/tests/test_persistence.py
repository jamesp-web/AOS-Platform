"""Persistence tests — SqlStore against SQLite (same code path as Supabase Postgres).

Proves session state + research cache survive a fresh engine (i.e. a restart).
Run:  backend/.venv/bin/python backend/tests/test_persistence.py
"""
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/
from app.database import db as dbmod              # noqa: E402
from app.database.sql_store import SqlStore       # noqa: E402

passed = 0


def check(name, cond):
    global passed
    if not cond:
        print("  ✗", name)
        sys.exit(1)
    passed += 1
    print("  ✓", name)


tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False).name
url = "sqlite:///" + tmp

store = SqlStore(url, ttl_seconds=100)
store.session_put("sess_x", {
    "companies": [{"id": "ALIP-1", "crm": {"brandName": "Reliance Retail", "owner": "Suraj"},
                   "ai": {"opportunityScore": 93, "recommendation": "High Priority"}}],
    "validation": {"summary": {"exact": 1, "fuzzy": 3}},
    "research": {"jobs": [{"companyId": "ALIP-1", "status": "completed"}]},
})

got = store.session_get("sess_x")
check("session payload round-trips (nested companies/validation/research)",
      got["companies"][0]["crm"]["brandName"] == "Reliance Retail"
      and got["companies"][0]["ai"]["opportunityScore"] == 93
      and got["validation"]["summary"]["fuzzy"] == 3
      and got["research"]["jobs"][0]["status"] == "completed")
check("missing session returns None", store.session_get("nope") is None)

store.session_put("sess_x", {"companies": [], "updated": True})
check("session update overwrites payload", store.session_get("sess_x").get("updated") is True)

store.cache_set("reliance retail", {"provider": "tavily", "answer": "big retailer"})
check("research cache round-trips", store.cache_get("reliance retail")["provider"] == "tavily")
check("expired cache (ttl=0) returns None", SqlStore(url, ttl_seconds=0).cache_get("reliance retail") is None)

# Simulate a process restart: drop the engine and reconnect to the same file.
dbmod._engine = None
dbmod._SessionLocal = None
reopened = SqlStore(url, ttl_seconds=100)
check("session SURVIVES a fresh engine (persisted to disk)", reopened.session_get("sess_x") is not None)
check("cache survives a fresh engine", reopened.cache_get("reliance retail")["answer"] == "big retailer")

print("\n%d persistence checks passed." % passed)
