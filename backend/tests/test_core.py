"""Backend core tests — pure Python (no fastapi/httpx/openpyxl needed).

Verifies the ported logic matches the frontend: deterministic scoring (=93),
duplicate detection, research-queue clustering, and dashboard selectors.

Run:  python3 backend/tests/test_core.py
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))  # backend/

from app.models import company as company_model          # noqa: E402
from app.services import duplicate_service, research_queue, scoring_engine, selectors  # noqa: E402
from app.services import ai_stub  # noqa: E402

passed = 0


def check(name, cond):
    global passed
    if cond:
        passed += 1
        print("  ✓", name)
    else:
        print("  ✗", name)
        sys.exit(1)


RELIANCE = {
    "id": "ALIP-1",
    "crm": {"brandName": "Reliance Retail", "brandId": "BR-1", "owner": "Suraj", "agency": "GroupM", "duplicateStatus": "Unique"},
    "ai": {"intelligence": {"industry": "Retail", "financialHealth": "Strong", "advertisingActivity": "Very High",
                            "growthSignals": "Positive", "expansionSignals": "Expanding",
                            "decisionMakerLikelihood": "High", "confidence": 88}},
}

print("ScoringEngine")
s = scoring_engine.score(RELIANCE)
by = {f["key"]: f["earned"] for f in s["breakdown"]}
check("Reliance Retail scores exactly 93", s["total"] == 93)
check("breakdown matches the worked example",
      by == {"businessHealth": 18, "advertising": 20, "industryFit": 15, "growth": 13,
             "expansion": 8, "decisionMaker": 9, "leadQuality": 10})
check("recommendation is High Priority", s["recommendation"] == "High Priority")
check("weights sum to 100", sum(f["max"] for f in s["breakdown"]) == 100)
check("thresholds map correctly", (scoring_engine.recommendation_for(90) == "High Priority"
      and scoring_engine.recommendation_for(74) == "Review" and scoring_engine.recommendation_for(59) == "Deprioritize"))

print("DuplicateService")
raw = [
    {"brandName": "Kalyan Jewellers", "brandId": "K1", "owner": "Sagar", "agency": "Wavemaker", "duplicateStatus": "Unique"},
    {"brandName": "Kalyan Jewellers", "brandId": "K1", "owner": "Sagar", "agency": "Wavemaker", "duplicateStatus": "Duplicate"},
    {"brandName": "Reliance Retail", "brandId": "R1", "owner": "Suraj", "agency": "GroupM", "duplicateStatus": "Unique"},
    {"brandName": "Reliance Retail", "brandId": "R2", "owner": "Srihari", "agency": "GroupM", "duplicateStatus": "Duplicate"},
    {"brandName": "Reliance Digital", "brandId": "R3", "owner": "Suraj", "agency": "Madison", "duplicateStatus": "Unique"},
]
companies = company_model.build_companies(raw)
check("unique internal ids assigned", len({c["id"] for c in companies}) == 5)
validation = duplicate_service.analyze(companies)
vs = validation["summary"]
check("detects an exact duplicate (Kalyan)", vs["exact"] >= 1)
check("detects a fuzzy duplicate (Reliance Retail)", vs["fuzzy"] >= 1)
check("detects a business group (Reliance)", vs["business"] >= 1)
check("detects an owner conflict (Reliance Retail)", vs["ownerConflicts"] >= 1)

print("ResearchQueue")
queue = research_queue.build(companies, validation)
qs = research_queue.stats(queue["jobs"])
check("one job per company", len(queue["jobs"]) == 5)
check("exact/fuzzy duplicates are skipped", qs["skipped"] == 2)
check("unique companies remain pending", qs["pending"] == 3)

print("AI stub + IntelligenceSelectors")
intel = ai_stub.analyze("Kalyan Jewellers", {})
check("analyst stub returns industry, no score", intel.get("industry") == "Jewellery" and "opportunityScore" not in intel)
# enrich two companies with a score for KPI checks
for c in companies[:2]:
    c["ai"]["intelligence"] = RELIANCE["ai"]["intelligence"]
    c["ai"]["researchStatus"] = "done"
    sc = scoring_engine.score(c)
    c["ai"]["score"] = sc
    c["ai"]["opportunityScore"] = sc["total"]
    c["ai"]["recommendation"] = sc["recommendation"]
kpis = selectors.compute_kpis(companies, validation, queue)
check("KPIs count total companies", kpis["totalCompanies"] == 5)
check("KPIs surface high-priority scored companies", kpis["highPriority"] >= 1)
brief = selectors.compute_executive_brief(companies, validation, queue)
check("executive brief leads with the upload count", brief["lines"][0].startswith("5 companies uploaded"))
actions = selectors.compute_actions(companies, validation, queue)
check("action center produces cards with required fields",
      all({"company", "reason", "action", "priority", "owner"} <= set(a) for a in actions))

print("\n%d checks passed." % passed)
