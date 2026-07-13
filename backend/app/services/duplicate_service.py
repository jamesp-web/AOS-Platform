"""Lead Validation Engine — exact/fuzzy/business/owner/agency detection (port of duplicateService.js)."""
from datetime import datetime, timezone
from typing import Any, Dict, List

from . import business_groups as bg
from . import normalize as N
from . import similarity as sim
from . import validation_rules as R


def _member(m: Dict[str, Any]) -> Dict[str, Any]:
    return {"id": m["id"], "name": m["name"], "owner": m["owner"], "agency": m["agency"], "brandId": m["brandId"]}


def _detection(seq: int, dtype: str, confidence: float, a: dict, b: dict, ctx: dict) -> Dict[str, Any]:
    confidence = round(confidence, 2)
    return {
        "id": f"DUP-{seq}",
        "type": dtype,
        "typeLabel": R.LABELS[dtype],
        "confidence": confidence,
        "reason": R.reason(dtype, {
            "a": a["name"], "b": b["name"], "confidence": confidence,
            "parent": ctx.get("parent"), "brand_id": ctx.get("brand_id"),
            "owner_a": a["owner"] or "—", "owner_b": b["owner"] or "—",
            "agency_a": a["agency"] or "—", "agency_b": b["agency"] or "—",
        }),
        "recommendedAction": R.recommended_action(dtype, confidence),
        "members": [_member(a), _member(b)],
        "meta": {"parent": ctx.get("parent"), "similarity": ctx.get("similarity")},
    }


def analyze(companies: List[Dict[str, Any]]) -> Dict[str, Any]:
    companies = companies or []
    meta = []
    for c in companies:
        crm = c.get("crm", {})
        clean, _ = N.name(crm.get("brandName"))
        meta.append({
            "id": c["id"], "name": crm.get("brandName", ""), "brandId": crm.get("brandId", ""),
            "owner": crm.get("owner", ""), "agency": crm.get("agency", ""),
            "exactName": N.exact(crm.get("brandName")), "clean": clean,
            "group": bg.detect(crm.get("brandName")),
        })

    detections: List[Dict[str, Any]] = []
    counts = {"exact": 0, "fuzzy": 0, "business": 0, "owner-conflict": 0, "agency-conflict": 0}
    flagged = set()
    groups_map: Dict[str, Dict[str, Any]] = {}
    seq = 0

    for m in meta:
        g = m["group"]
        if g and g["confidence"] >= R.THRESHOLDS["group"]:
            grp = groups_map.setdefault(g["parent"], {"via": g["via"], "ids": [], "names": [], "cleans": set()})
            grp["ids"].append(m["id"])
            grp["names"].append(m["name"])
            grp["cleans"].add(m["clean"])

    for i in range(len(meta)):
        for j in range(i + 1, len(meta)):
            a, b = meta[i], meta[j]
            if not a["name"] or not b["name"]:
                continue
            name_exact = a["exactName"] != "" and a["exactName"] == b["exactName"]
            id_equal = bool(a["brandId"]) and bool(b["brandId"]) and N.exact(a["brandId"]) == N.exact(b["brandId"])
            norm_equal = a["clean"] != "" and a["clean"] == b["clean"]
            s = 1.0 if (name_exact or norm_equal) else sim.score(a["name"], b["name"])
            grp = bg.same_group(a["name"], b["name"])

            dtype, conf, entity = None, 0.0, False
            if name_exact and id_equal:
                dtype, conf, entity = "exact", 1.0, True
            elif norm_equal or s >= R.THRESHOLDS["fuzzy_high"]:
                dtype, conf, entity = "fuzzy", (0.96 if norm_equal else s), True
            elif s >= R.THRESHOLDS["fuzzy"]:
                dtype, conf, entity = "fuzzy", s, True
            elif grp and grp["confidence"] >= R.THRESHOLDS["group"]:
                dtype, conf, entity = "business", grp["confidence"], False

            if dtype:
                seq += 1
                detections.append(_detection(seq, dtype, conf, a, b, {
                    "parent": grp["parent"] if grp else None, "brand_id": a["brandId"] if id_equal else "", "similarity": s,
                }))
                counts[dtype] += 1
                flagged.update((a["id"], b["id"]))

            if entity:
                if N.person(a["owner"]) and N.person(b["owner"]) and N.person(a["owner"]) != N.person(b["owner"]):
                    seq += 1
                    detections.append(_detection(seq, "owner-conflict", conf, a, b, {"similarity": s}))
                    counts["owner-conflict"] += 1
                    flagged.update((a["id"], b["id"]))
                if N.agency(a["agency"]) and N.agency(b["agency"]) and N.agency(a["agency"]) != N.agency(b["agency"]):
                    seq += 1
                    detections.append(_detection(seq, "agency-conflict", conf, a, b, {"similarity": s}))
                    counts["agency-conflict"] += 1
                    flagged.update((a["id"], b["id"]))

    groups = []
    grouped_ids = set()
    for parent, grp in groups_map.items():
        if len(grp["cleans"]) >= 2:
            ids = list(dict.fromkeys(grp["ids"]))
            groups.append({"parent": parent, "via": grp["via"], "memberIds": ids,
                           "memberNames": list(dict.fromkeys(grp["names"])), "distinctNames": len(grp["cleans"])})
            grouped_ids.update(ids)

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "totalCompanies": len(companies), "exact": counts["exact"], "fuzzy": counts["fuzzy"],
            "business": counts["business"], "businessGroups": len(groups), "businessGroupedCompanies": len(grouped_ids),
            "ownerConflicts": counts["owner-conflict"], "agencyConflicts": counts["agency-conflict"],
            "flaggedCompanies": len(flagged), "cleanCompanies": len(companies) - len(flagged),
        },
        "duplicates": detections,
        "groups": groups,
    }
