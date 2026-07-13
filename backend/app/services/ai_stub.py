"""Deterministic offline analyst (port of aiIntelligenceService stub).

Used when no OpenAI key is configured so the pipeline is fully runnable in dev.
Returns intelligence ONLY — never a score or recommendation.
"""
import re
from typing import Any, Dict

_FNV = 0x811C9DC5


def _hash(s: str) -> int:
    h = _FNV
    for ch in s:
        h ^= ord(ch)
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def _pick(arr, seed: str):
    return arr[_hash(seed) % len(arr)]


def _industry(name: str) -> str:
    n = name.lower()
    rules = [
        (r"jewel|gold|diamond|tanishq|kalyan", "Jewellery"),
        (r"hospital|clinic|\beye\b|health|pharma|\bcare\b|dental", "Healthcare"),
        (r"insur|\bbank\b|loan|\baxa\b|\bsbi\b|finance|mutual|capital", "BFSI"),
        (r"preschool|school|kidz|educat|academy|college", "Education"),
        (r"propert|builder|realty|smartspace|estate|infra", "Real Estate"),
        (r"hotel|marriott|resort|hospitality", "Hospitality"),
        (r"media|\bstar\b|outdoor|broadcast|jiostar", "Entertainment & Media"),
        (r"incense|\bpet\b|hing|fmcg|foods|beverage", "FMCG"),
        (r"mall|marketcity|phoenix|retail|bazaar|mart|store|fashion|clothing|puma|aza", "Retail"),
        (r"auto|motor|\bcar\b|vehicle", "Automobiles"),
    ]
    for pat, ind in rules:
        if re.search(pat, n):
            return ind
    return "Consumer Goods & Durables"


_TYPE = {
    "Retail": "Retail Chain", "BFSI": "Financial Services", "Healthcare": "Healthcare Provider",
    "Real Estate": "Real Estate Developer", "Jewellery": "Jewellery Retailer",
    "Entertainment & Media": "Media Company", "Education": "Education Provider",
    "Hospitality": "Hospitality Group", "FMCG": "FMCG Brand", "Automobiles": "Automotive",
}


def analyze(company_name: str, research: Dict[str, Any]) -> Dict[str, Any]:
    name = company_name or "(unknown)"
    industry = _industry(name)
    fin = _pick(["Strong", "Strong", "Moderate", "Stable", "Weak"], name + "|fin")
    adv = _pick(["Very High", "High", "Medium", "Low", "Inactive"], name + "|adv")
    growth = _pick(["Strong", "Positive", "Moderate", "Flat", "Declining"], name + "|grw")
    expansion = _pick(["Aggressive", "Expanding", "Moderate", "Stable", "Contracting"], name + "|exp")
    dm = _pick(["High", "High", "Medium", "Low"], name + "|dm")
    confidence = 70 + (_hash(name + "|conf") % 26)
    n_sources = len((research or {}).get("sources") or [])
    return {
        "industry": industry, "companyType": _TYPE.get(industry, "Consumer Brand"),
        "financialHealth": fin, "advertisingActivity": adv, "growthSignals": growth,
        "expansionSignals": expansion, "decisionMakerLikelihood": dm,
        "businessSummary": (f"{name} operates in the {industry} sector as a {_TYPE.get(industry, 'consumer brand')}. "
                            f"Research indicates {fin.lower()} financial health, {adv.lower()} advertising activity "
                            f"and {growth.lower()} growth signals."),
        "keySignals": [f"Advertising activity: {adv}", f"Growth: {growth} · Expansion: {expansion}",
                       f"Sourced from {n_sources} research references" if n_sources else "Limited public research"],
        "confidence": confidence,
    }
