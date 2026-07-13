"""String similarity (Levenshtein ratio + token-set Jaccard) — port of similarity.js."""
from typing import List

from . import normalize


def levenshtein(a: str, b: str) -> int:
    a, b = a or "", b or ""
    if a == b:
        return 0
    if not a:
        return len(b)
    if not b:
        return len(a)
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i]
        for k in range(1, len(b) + 1):
            cost = 0 if a[i - 1] == b[k - 1] else 1
            cur.append(min(cur[k - 1] + 1, prev[k] + 1, prev[k - 1] + cost))
        prev = cur
    return prev[len(b)]


def char_ratio(a: str, b: str) -> float:
    mx = max(len(a or ""), len(b or ""))
    if mx == 0:
        return 1.0
    return 1 - (levenshtein(a, b) / mx)


def token_ratio(a: List[str], b: List[str]) -> float:
    a, b = a or [], b or []
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    sa, sb = set(a), set(b)
    return len(sa & sb) / len(sa | sb)


def score(name_a: str, name_b: str) -> float:
    ca, ta = normalize.name(name_a)
    cb, tb = normalize.name(name_b)
    if not ca or not cb:
        return 0.0
    if ca == cb:
        return 1.0
    return round((0.5 * char_ratio(ca, cb) + 0.5 * token_ratio(ta, tb)), 4)
