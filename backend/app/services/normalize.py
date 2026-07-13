"""Name/owner/agency normalisation for duplicate detection (port of normalize.js)."""
import re
import unicodedata
from typing import List, Tuple

LEGAL_TOKENS = {
    "pvt", "private", "ltd", "limited", "llp", "inc", "incorporated", "corp",
    "corporation", "co", "company", "group", "enterprises", "enterprise",
    "industries", "the", "and", "&",
}


def _strip_accents(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def exact(value) -> str:
    """Lower-cased, trimmed, whitespace-collapsed — for EXACT comparisons."""
    return re.sub(r"\s+", " ", _strip_accents(str(value or "")).lower().strip())


def name(value) -> Tuple[str, List[str]]:
    """Suffix-stripped canonical form for FUZZY / group comparisons.

    Returns (clean, tokens).
    """
    base = _strip_accents(str(value or "")).lower()
    base = re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s&]", " ", base)).strip()
    tokens = [t for t in base.split(" ") if t and t not in LEGAL_TOKENS]
    return " ".join(tokens), tokens


def person(value) -> str:
    return exact(value)


def agency(value) -> str:
    v = re.sub(r"[^a-z0-9 ]", "", exact(value))
    if v in ("inhouse", "in house", "internal"):
        return "in-house"
    return v
