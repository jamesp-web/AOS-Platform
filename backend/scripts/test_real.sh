#!/usr/bin/env bash
# Test the REAL OpenAI + Tavily integration on only a FEW companies (cost control).
# Usage:  bash backend/scripts/test_real.sh [N]      (default N=3)
set -euo pipefail
cd "$(dirname "$0")/.."                 # → backend/
N="${1:-3}"
PY=./.venv/bin/python

echo "▶ Restarting backend (loads .env keys + limit support) …"
pkill -f "uvicorn app.main" 2>/dev/null || true
sleep 1
nohup ./.venv/bin/uvicorn app.main:app --port 8000 --log-level warning > /tmp/alip_uvicorn.log 2>&1 &
sleep 2

echo "▶ Health (expect openai:true, tavily:true):"
curl -s http://127.0.0.1:8000/health; echo

echo "▶ Uploading sample CRM …"
SID=$(curl -s -F "file=@../sample_data/srihari_mumbai_crm.xlsx" http://127.0.0.1:8000/api/upload | "$PY" -c "import sys,json;print(json.load(sys.stdin)['session_id'])")
echo "  session = $SID"

echo "▶ Researching $N companies via REAL Tavily …"
curl -s -X POST http://127.0.0.1:8000/api/research/start -H 'Content-Type: application/json' \
     -d "{\"session_id\":\"$SID\",\"limit\":$N}" | "$PY" -m json.tool

echo "▶ Analyzing $N companies via REAL OpenAI …"
curl -s -X POST http://127.0.0.1:8000/api/analyze -H 'Content-Type: application/json' \
     -d "{\"session_id\":\"$SID\",\"limit\":$N}" | "$PY" -m json.tool

echo "▶ Results (only scored companies):"
curl -s "http://127.0.0.1:8000/api/companies?session_id=$SID" | "$PY" -c "
import sys, json
for c in json.load(sys.stdin)['companies']:
    if c.get('score') is not None:
        intel = c['ai'].get('intelligence', {}) or {}
        print(f\"  • {c['crm']['brandName']}: {intel.get('industry')} | fin {intel.get('financialHealth')} | ads {intel.get('advertisingActivity')} | conf {intel.get('confidence')}% → score {c['score']} ({c['recommendation']})\")
        print(f\"      summary: {intel.get('businessSummary')}\")
"
echo "▶ Done. Provider used shows in each research 'provider' field: 'tavily' = real, 'stub' = offline."
