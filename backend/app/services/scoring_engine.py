"""AdOnMo Opportunity Score — deterministic, app-owned (port of scoringEngine.js).

OpenAI never influences a number here. Same intelligence + CRM inputs always
produce the same score, breakdown and recommendation.
"""
from datetime import datetime, timezone
from typing import Any, Dict, List

from ..prompts.analyst_prompt import OOH_CHANNELS

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

# --- analyst-v2 richer signals ---------------------------------------------------
# These refine the advertising and expansion factors. Every table returns 0 for an
# absent, "Unknown" or unrecognised value, so v1-era intelligence (which lacks these
# keys) scores identically to before — the boosts only add signal, never subtract it
# from a company that already scored well.
MARKETING_INVEST = {"high": 3, "moderate": 1, "low": 0, "minimal": -1}
CAMPAIGN_FREQ = {"frequent": 2, "periodic": 1, "occasional": 0, "rare": 0, "none": -1}
DIGITAL_MKTG = {"very high": 2, "high": 1, "medium": 0, "low": 0, "inactive": 0}
CAMPAIGN_YES_NO = {"active": 1, "occasional": 0, "none": 0}          # seasonal / brand-awareness
STORE_OPENINGS = {"rapid": 3, "active": 2, "occasional": 1, "none": 0}
RETAIL_PRESENCE = {"extensive": 2, "moderate": 1, "limited": 0, "online-only": 0, "online only": 0}
_OOH_PER_CHANNEL = 2   # proven use of an OOH format is the strongest DOOH-buyer signal
_OOH_CHANNEL_CAP = 8


def _look(table: Dict[str, int], value, fallback: int) -> int:
    if value is None:
        return fallback
    return table.get(str(value).strip().lower(), fallback)


def _ooh_channel_boost(intel: Dict[str, Any]) -> int:
    """Points for OOH formats the company already buys — capped so a long list can't dominate."""
    channels = intel.get("offlineAdvertisingChannels")
    if isinstance(channels, str):
        channels = [channels]
    if not isinstance(channels, list):
        return 0
    known = {c.lower() for c in OOH_CHANNELS}
    n = sum(1 for c in channels if str(c).strip().lower() in known)
    return min(_OOH_CHANNEL_CAP, n * _OOH_PER_CHANNEL)


def _advertising_boost(intel: Dict[str, Any]) -> int:
    """DOOH-propensity signals layered on top of the headline advertisingActivity level."""
    return (
        _ooh_channel_boost(intel)
        + _look(MARKETING_INVEST, intel.get("marketingInvestment"), 0)
        + _look(CAMPAIGN_FREQ, intel.get("campaignFrequency"), 0)
        + _look(DIGITAL_MKTG, intel.get("digitalMarketingActivity"), 0)
        + _look(CAMPAIGN_YES_NO, intel.get("seasonalCampaigns"), 0)
        + _look(CAMPAIGN_YES_NO, intel.get("brandAwarenessCampaigns"), 0)
    )


def _expansion_boost(intel: Dict[str, Any]) -> int:
    """Physical-footprint growth = more real-world surfaces AdOnMo can sell against."""
    return (
        _look(STORE_OPENINGS, intel.get("storeOpenings"), 0)
        + _look(RETAIL_PRESENCE, intel.get("retailPresence"), 0)
    )


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
        {"key": "advertising", "label": "Advertising Activity", "max": WEIGHTS["advertising"], "earned": _look(ADVERTISING, intel.get("advertisingActivity"), 8) + _advertising_boost(intel)},
        {"key": "industryFit", "label": "Industry Fit", "max": WEIGHTS["industryFit"], "earned": _look(INDUSTRY_FIT, intel.get("industry"), 9)},
        {"key": "growth", "label": "Growth Signals", "max": WEIGHTS["growth"], "earned": _look(GROWTH, intel.get("growthSignals"), 8)},
        {"key": "expansion", "label": "Expansion Signals", "max": WEIGHTS["expansion"], "earned": _look(EXPANSION, intel.get("expansionSignals"), 5) + _expansion_boost(intel)},
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
