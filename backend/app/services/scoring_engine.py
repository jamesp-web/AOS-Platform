"""AdOnMo Opportunity Score — deterministic, app-owned (port of scoringEngine.js).

OpenAI never influences a number here. Same intelligence + CRM inputs always
produce the same score, breakdown and recommendation.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List

WEIGHTS = {
    "businessHealth": 20, "advertising": 20, "industryFit": 15,
    "growth": 15, "expansion": 10, "decisionMaker": 10, "leadQuality": 10,
}

FINANCIAL = {"very strong": 20, "strong": 18, "healthy": 17, "stable": 14, "moderate": 12, "weak": 7, "stressed": 3}
ADVERTISING = {"very high": 20, "high": 17, "medium": 13, "moderate": 13, "low": 8, "inactive": 4, "none": 4}
GROWTH = {"strong": 15, "high": 15, "positive": 13, "moderate": 10, "flat": 7, "stable": 7, "declining": 4, "negative": 4}
EXPANSION = {"aggressive": 10, "expanding": 8, "active": 8, "moderate": 6, "stable": 5, "contracting": 2}
DECISION = {"very high": 10, "high": 9, "medium": 6, "moderate": 6, "low": 3}
INDUSTRY_FIT = {
    "retail": 15, "real estate": 15, "jewellery": 14, "jewelry": 14,
    "consumer goods & durables": 13, "consumer goods and durables": 13, "fmcg": 13,
    "healthcare": 12, "automobiles": 12, "hospitality": 12, "education": 11,
    "bfsi": 10, "banking": 10, "entertainment & media": 10, "entertainment and media": 10,
    "government": 4,
}

RECOMMENDATIONS = [(90, "High Priority"), (75, "Priority"), (60, "Review"), (0, "Deprioritize")]


def _look(table: Dict[str, int], value, fallback: int) -> int:
    if value is None:
        return fallback
    return table.get(str(value).strip().lower(), fallback)


def lead_quality(company: Dict[str, Any], intel: Dict[str, Any]) -> int:
    crm = company.get("crm", {})
    q = 0.0
    if crm.get("brandId"):
        q += 2.5
    if crm.get("owner"):
        q += 2.5
    if crm.get("agency"):
        q += 2.5
    if "dup" not in str(crm.get("duplicateStatus", "")).lower():
        q += 1.5
    conf = (intel or {}).get("confidence", 0) or 0
    if conf >= 80:
        q += 1
    elif conf >= 60:
        q += 0.5
    return min(10, round(q))


def recommendation_for(total: int) -> str:
    for threshold, label in RECOMMENDATIONS:
        if total >= threshold:
            return label
    return "Deprioritize"


def _business_reason(factors: List[dict], total: int, rec: str) -> str:
    ordered = sorted(factors, key=lambda f: f["earned"] / f["max"], reverse=True)
    strong = " and ".join(f'{f["label"]} ({f["earned"]}/{f["max"]})' for f in ordered[:2])
    weakest = ordered[-1]
    return (
        f"Strongest signals: {strong}. Main upside: "
        f'{weakest["label"]} ({weakest["earned"]}/{weakest["max"]}). Total {total}/100 → {rec}.'
    )


def score(company: Dict[str, Any]) -> Dict[str, Any]:
    intel = (company.get("ai") or {}).get("intelligence") or {}
    factors = [
        {"key": "businessHealth", "label": "Business Health", "max": WEIGHTS["businessHealth"], "earned": _look(FINANCIAL, intel.get("financialHealth"), 10)},
        {"key": "advertising", "label": "Advertising Activity", "max": WEIGHTS["advertising"], "earned": _look(ADVERTISING, intel.get("advertisingActivity"), 8)},
        {"key": "industryFit", "label": "Industry Fit", "max": WEIGHTS["industryFit"], "earned": _look(INDUSTRY_FIT, intel.get("industry"), 9)},
        {"key": "growth", "label": "Growth Signals", "max": WEIGHTS["growth"], "earned": _look(GROWTH, intel.get("growthSignals"), 8)},
        {"key": "expansion", "label": "Expansion Signals", "max": WEIGHTS["expansion"], "earned": _look(EXPANSION, intel.get("expansionSignals"), 5)},
        {"key": "decisionMaker", "label": "Decision Maker", "max": WEIGHTS["decisionMaker"], "earned": _look(DECISION, intel.get("decisionMakerLikelihood"), 5)},
        {"key": "leadQuality", "label": "Lead Quality", "max": WEIGHTS["leadQuality"], "earned": lead_quality(company, intel)},
    ]
    for f in factors:
        f["earned"] = max(0, min(f["max"], round(f["earned"])))
        f["contribution"] = f["earned"]
    total = sum(f["earned"] for f in factors)
    rec = recommendation_for(total)
    return {
        "total": total,
        "breakdown": factors,
        "recommendation": rec,
        "businessReason": _business_reason(factors, total, rec),
        "weights": WEIGHTS,
        "scoredAt": datetime.now(timezone.utc).isoformat(),
    }
