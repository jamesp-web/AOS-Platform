"""End-to-end API smoke test via FastAPI TestClient (needs deps installed).

Run:  backend/.venv/bin/python backend/tests/smoke_api.py
Exercises the whole pipeline over HTTP using the sample CRM (offline stubs).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/
from fastapi.testclient import TestClient  # noqa: E402
from app.main import app  # noqa: E402

SAMPLE = Path(__file__).resolve().parents[2] / "sample_data" / "srihari_mumbai_crm.xlsx"
client = TestClient(app)
ok = 0


def check(name, cond):
    global ok
    print(("  ✓ " if cond else "  ✗ ") + name)
    if not cond:
        sys.exit(1)
    ok += 1


check("GET /health", client.get("/health").json()["ok"] is True)

with open(SAMPLE, "rb") as f:
    up = client.post("/api/upload", files={"file": ("crm.xlsx", f, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")})
check("POST /upload → 200", up.status_code == 200)
body = up.json()
sid = body["session_id"]
check("upload extracted 23 companies", body["extracted"] == 23)
check("upload skipped the blank-name row", body["skipped"] == 1)
check("validation summary present", body["validation_summary"]["totalCompanies"] == 23)

check("POST /research/start", client.post("/api/research/start", json={"session_id": sid}).json()["ok"])
st = client.get("/api/research/status", params={"session_id": sid}).json()
check("research completed 19, skipped 4", st["stats"]["completed"] == 19 and st["stats"]["skipped"] == 4)

check("POST /analyze", client.post("/api/analyze", json={"session_id": sid}).json()["ok"])

comps = client.get("/api/companies", params={"session_id": sid}).json()
check("GET /companies returns 23", comps["total"] == 23)
top = comps["companies"][0]
check("GET /company/{id} returns detail + view", client.get(f"/api/company/{top['id']}", params={"session_id": sid}).json()["company"]["id"] == top["id"])

dash = client.get("/api/dashboard", params={"session_id": sid}).json()
check("GET /dashboard KPIs computed", dash["kpis"]["totalCompanies"] == 23 and dash["kpis"]["avgScore"] > 0)
check("dashboard has executive brief + actions + 6 charts",
      len(dash["executive_brief"]["lines"]) >= 4 and len(dash["actions"]) > 0 and len(dash["charts"]) == 6)

fi = client.get("/api/founder-insights", params={"session_id": sid}).json()
check("GET /founder-insights returns 5–8 insights", 5 <= len(fi["insights"]) <= 8)

exp = client.post("/api/export", json={"session_id": sid})
check("POST /export streams an .xlsx", exp.status_code == 200 and "spreadsheetml" in exp.headers["content-type"])

check("unknown session → 404", client.get("/api/dashboard", params={"session_id": "nope"}).status_code == 404)

print(f"\n{ok} API checks passed.")
print("Sample:", up.json()["validation_summary"], "| avg score:", dash["kpis"]["avgScore"])
