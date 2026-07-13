"""Parent business-group detection (port of businessGroups.js)."""
from typing import Optional

from . import normalize

KNOWN_GROUPS = {
    "Reliance": ["reliance", "jio", "jiomart"],
    "Tata": ["tata", "croma", "titan", "tanishq", "westside"],
    "Aditya Birla": ["aditya birla", "pantaloons", "ubl"],
    "Mahindra": ["mahindra"],
    "Adani": ["adani"],
    "Godrej": ["godrej"],
    "Bharti": ["bharti", "airtel"],
    "Future Group": ["future", "big bazaar"],
    "Aza": ["aza", "araiya"],
}

GENERIC = {
    "the", "new", "sri", "shree", "shri", "royal", "global", "india", "national",
    "city", "star", "super", "smart", "digital", "retail", "store", "stores", "group",
}


def detect(brand_name: str) -> Optional[dict]:
    clean, tokens = normalize.name(brand_name)
    if not clean:
        return None
    for parent, keys in KNOWN_GROUPS.items():
        for kw in keys:
            if clean == kw or clean.startswith(kw + " ") or (" " + kw) in clean:
                return {"parent": parent, "confidence": 0.9, "via": "registry"}
    first = tokens[0] if tokens else ""
    if first and len(first) >= 4 and first not in GENERIC and len(tokens) > 1:
        return {"parent": first.capitalize(), "confidence": 0.6, "via": "heuristic"}
    return None


def same_group(name_a: str, name_b: str) -> Optional[dict]:
    ga, gb = detect(name_a), detect(name_b)
    if not ga or not gb or ga["parent"] != gb["parent"]:
        return None
    return {"parent": ga["parent"], "confidence": min(ga["confidence"], gb["confidence"]), "via": ga["via"]}
