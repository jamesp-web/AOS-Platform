"""Read/aggregation layer for dashboard, brief, actions, insights (port of intelligenceSelectors.js)."""
from typing import Any, Dict, List, Optional


def jobs_by_company(research: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    return {j["companyId"]: j for j in (research or {}).get("jobs", [])} if research else {}


def validation_index(validation: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    idx: Dict[str, Any] = {}
    for d in (validation or {}).get("duplicates", []):
        for m in d["members"]:
            v = idx.setdefault(m["id"], {"flagged": False, "duplicate": False, "ownerConflict": False,
                                         "agencyConflict": False, "business": False, "types": []})
            v["flagged"] = True
            if d["type"] not in v["types"]:
                v["types"].append(d["type"])
            if d["type"] in ("exact", "fuzzy"):
                v["duplicate"] = True
            if d["type"] == "owner-conflict":
                v["ownerConflict"] = True
            if d["type"] == "agency-conflict":
                v["agencyConflict"] = True
            if d["type"] == "business":
                v["business"] = True
    return idx


def industry_of(c): return ((c.get("ai") or {}).get("intelligence") or {}).get("industry") or (c.get("ai") or {}).get("industry")
def score_of(c):
    s = (c.get("ai") or {}).get("opportunityScore")
    return s if isinstance(s, (int, float)) else None
def recommendation_of(c): return (c.get("ai") or {}).get("recommendation")
def _plural(n): return f"{n} company" if n == 1 else f"{n} companies"
def _vb(n, s, p): return s if n == 1 else p


def _top(counts: Dict[str, int]) -> Dict[str, Any]:
    if not counts:
        return {"label": "—", "count": 0}
    label = max(counts, key=counts.get)
    return {"label": label, "count": counts[label]}


def _research_status(c, jobs): return (jobs.get(c["id"], {}).get("status")) or (c.get("ai") or {}).get("researchStatus") or "pending"


def compute_kpis(companies, validation, research) -> Dict[str, Any]:
    companies = companies or []
    jobs, vidx = jobs_by_company(research), validation_index(validation)
    vsum = (validation or {}).get("summary", {})
    k = {"totalCompanies": len(companies), "validated": 0, "researchCompleted": 0, "researchPending": 0,
         "researchSkipped": 0, "duplicateLeads": 0, "ownerConflicts": vsum.get("ownerConflicts", 0),
         "agencyConflicts": vsum.get("agencyConflicts", 0), "highPriority": 0, "priority": 0,
         "reviewRequired": 0, "deprioritized": 0, "avgScore": 0, "topIndustry": "—", "topOwner": "—"}
    score_sum = score_n = 0
    industry_counts, owner_counts, dup_ids = {}, {}, set()
    for c in companies:
        v = vidx.get(c["id"])
        if v and v["duplicate"]:
            dup_ids.add(c["id"])
        else:
            k["validated"] += 1
        st = _research_status(c, jobs)
        if st in ("completed", "cached", "done"):
            k["researchCompleted"] += 1
        elif st == "skipped":
            k["researchSkipped"] += 1
        elif st in ("pending", "queued", "researching"):
            k["researchPending"] += 1
        rec = recommendation_of(c)
        for key, label in (("highPriority", "High Priority"), ("priority", "Priority"), ("reviewRequired", "Review"), ("deprioritized", "Deprioritize")):
            if rec == label:
                k[key] += 1
        s = score_of(c)
        if s is not None:
            score_sum += s
            score_n += 1
        ind = industry_of(c)
        if ind:
            industry_counts[ind] = industry_counts.get(ind, 0) + 1
        owner = c["crm"].get("owner")
        if owner:
            owner_counts[owner] = owner_counts.get(owner, 0) + 1
    k["duplicateLeads"] = len(dup_ids)
    k["avgScore"] = round(score_sum / score_n) if score_n else 0
    k["topIndustry"] = _top(industry_counts)["label"]
    k["topOwner"] = _top(owner_counts)["label"]
    return k


def compute_insights(companies, validation, research) -> List[str]:
    k = compute_kpis(companies, validation, research)
    out, total = [], k["totalCompanies"] or 1
    if k["highPriority"]:
        out.append(f'{_plural(k["highPriority"])} {_vb(k["highPriority"], "is", "are")} High Priority — prioritise outreach this week.')
    hi = [c for c in companies if recommendation_of(c) in ("High Priority", "Priority")]
    if hi:
        by = {}
        for c in hi:
            i = industry_of(c) or "Unclassified"
            by[i] = by.get(i, 0) + 1
        t = _top(by)
        out.append(f'{t["label"]} contributes {round(t["count"] / len(hi) * 100)}% of high-opportunity leads.')
    if k["duplicateLeads"]:
        out.append(f'{_plural(k["duplicateLeads"])} {_vb(k["duplicateLeads"], "requires", "require")} duplicate review before outreach.')
    if k["ownerConflicts"]:
        out.append(f'{_plural(k["ownerConflicts"])} {_vb(k["ownerConflicts"], "has", "have")} owner conflicts to resolve.')
    if k["researchCompleted"]:
        out.append(f'Research has completed for {round(k["researchCompleted"] / total * 100)}% of uploaded companies.')
    if k["avgScore"]:
        out.append(f'Average Opportunity Score across scored leads is {k["avgScore"]}/100.')
    return out


def _count_by(companies, fn):
    c = {}
    for x in companies:
        key = fn(x)
        if key:
            c[key] = c.get(key, 0) + 1
    return c


def _sorted_pairs(counts, limit=None):
    arr = sorted(({"label": k, "value": v} for k, v in counts.items()), key=lambda p: p["value"], reverse=True)
    return arr[:limit] if limit else arr


def compute_charts(companies, validation, research) -> Dict[str, Any]:
    companies = companies or []
    jobs, vsum = jobs_by_company(research), (validation or {}).get("summary", {})
    buckets = {"Deprioritize (<60)": 0, "Review (60-74)": 0, "Priority (75-89)": 0, "High (90+)": 0}
    for c in companies:
        s = score_of(c)
        if s is None:
            continue
        buckets["High (90+)" if s >= 90 else "Priority (75-89)" if s >= 75 else "Review (60-74)" if s >= 60 else "Deprioritize (<60)"] += 1
    rstat = {"Completed": 0, "Cached": 0, "Pending": 0, "Researching": 0, "Failed": 0, "Skipped": 0}
    for c in companies:
        st = _research_status(c, jobs)
        rstat[{"completed": "Completed", "done": "Completed", "cached": "Cached", "researching": "Researching",
                "failed": "Failed", "skipped": "Skipped"}.get(st, "Pending")] += 1
    rec = {"High Priority": 0, "Priority": 0, "Review": 0, "Deprioritize": 0}
    for c in companies:
        r = recommendation_of(c)
        if r in rec:
            rec[r] += 1
    return {
        "scoreDistribution": [{"label": k, "value": v} for k, v in buckets.items()],
        "industryDistribution": _sorted_pairs(_count_by(companies, industry_of), 8),
        "researchStatus": [{"label": k, "value": v} for k, v in rstat.items() if v > 0],
        "recommendationDistribution": [{"label": k, "value": v} for k, v in rec.items()],
        "duplicateTypes": [
            {"label": "Exact", "value": vsum.get("exact", 0)}, {"label": "Fuzzy", "value": vsum.get("fuzzy", 0)},
            {"label": "Business", "value": vsum.get("business", 0)}, {"label": "Owner Conflict", "value": vsum.get("ownerConflicts", 0)},
            {"label": "Agency Conflict", "value": vsum.get("agencyConflicts", 0)}],
        "ownerDistribution": _sorted_pairs(_count_by(companies, lambda c: c["crm"].get("owner")), 8),
    }


def _top_scored(companies, n=3):
    return sorted([c for c in companies if score_of(c) is not None], key=score_of, reverse=True)[:n]


def compute_executive_brief(companies, validation, research) -> Dict[str, Any]:
    companies = companies or []
    k = compute_kpis(companies, validation, research)
    vidx = validation_index(validation)
    lines = [f'{_plural(k["totalCompanies"])} uploaded from the CRM.']
    if k["validated"]:
        lines.append(f'{_plural(k["validated"])} successfully validated.')
    if k["duplicateLeads"]:
        lines.append(f'{_plural(k["duplicateLeads"])} {_vb(k["duplicateLeads"], "was", "were")} flagged as duplicates.')
    if k["topIndustry"] != "—":
        lines.append(f'{k["topIndustry"]} contributes the largest share of high-opportunity companies.')
    conflicts = sum(1 for c in companies if (vidx.get(c["id"]) or {}).get("ownerConflict") or (vidx.get(c["id"]) or {}).get("agencyConflict"))
    if conflicts:
        lines.append(f'{_plural(conflicts)} {_vb(conflicts, "requires", "require")} manual review for owner or agency conflicts.')
    researchable = k["totalCompanies"] - k["researchSkipped"]
    if k["researchCompleted"]:
        lines.append(f'Research completion is {round(k["researchCompleted"] / (researchable or 1) * 100)}%.')
    focus = _top_scored(companies, 3)
    return {"lines": lines, "focus": [c["crm"]["brandName"] for c in focus],
            "focusCompanies": [{"id": c["id"], "name": c["crm"]["brandName"], "score": score_of(c)} for c in focus], "kpis": k}


def _prank(p): return {"High": 0, "Medium": 1, "Low": 2}.get(p, 2)


def compute_actions(companies, validation, research) -> List[Dict[str, Any]]:
    companies = companies or []
    vidx, jobs, actions = validation_index(validation), jobs_by_company(research), []

    def add(c, type_, action, reason, priority):
        actions.append({"id": c["id"], "company": c["crm"]["brandName"], "owner": c["crm"].get("owner") or "Unassigned",
                        "reason": reason, "action": action, "priority": priority, "type": type_})
    for c in _top_scored([c for c in companies if recommendation_of(c) == "High Priority"], 5):
        add(c, "contact", "Contact immediately", f"Opportunity Score {score_of(c)} — top-converting profile", "High")
    for c in [c for c in companies if (vidx.get(c["id"]) or {}).get("ownerConflict") or not c["crm"].get("owner")][:4]:
        conflict = (vidx.get(c["id"]) or {}).get("ownerConflict")
        add(c, "owner", "Assign / confirm owner", "Assigned to multiple owners" if conflict else "No owner assigned", "High")
    for c in [c for c in companies if (vidx.get(c["id"]) or {}).get("duplicate")][:4]:
        add(c, "duplicate", "Review duplicate", "Possible duplicate (" + ", ".join((vidx.get(c["id"]) or {}).get("types", [])) + ")", "Medium")
    for c in [c for c in companies if (vidx.get(c["id"]) or {}).get("agencyConflict")][:3]:
        add(c, "validation", "Manual validation required", "Mapped to multiple agencies", "Medium")
    for c in [c for c in companies if _research_status(c, jobs) in ("pending", "queued")][:4]:
        add(c, "research", "Run research", "Awaiting AI enrichment", "Low")
    return sorted(actions, key=lambda a: _prank(a["priority"]))[:12]


def compute_founder_insights(companies, validation, research) -> List[Dict[str, Any]]:
    companies = companies or []
    k = compute_kpis(companies, validation, research)
    out = []
    hi = [c for c in companies if recommendation_of(c) in ("High Priority", "Priority")]
    if hi:
        by = {}
        for c in hi:
            i = industry_of(c) or "Unclassified"
            by[i] = by.get(i, 0) + 1
        t = _top(by)
        out.append({"text": f'{t["label"]} represents {round(t["count"] / len(hi) * 100)}% of all high-priority opportunities.', "metric": f'{round(t["count"] / len(hi) * 100)}%'})
    ind_scores = {}
    for c in companies:
        s = score_of(c)
        if s is not None:
            ind_scores.setdefault(industry_of(c) or "Unclassified", []).append(s)
    if ind_scores:
        best = max(ind_scores, key=lambda i: sum(ind_scores[i]) / len(ind_scores[i]))
        avg = round(sum(ind_scores[best]) / len(ind_scores[best]))
        out.append({"text": f"{best} brands have the highest average Opportunity Score ({avg}).", "metric": avg})
    if k["researchPending"]:
        out.append({"text": f'Research is pending for {_plural(k["researchPending"])}.', "metric": k["researchPending"]})
    if k["duplicateLeads"]:
        out.append({"text": f'{_plural(k["duplicateLeads"])} {_vb(k["duplicateLeads"], "has", "have")} duplicate conflicts to resolve.', "metric": k["duplicateLeads"]})
    if k["avgScore"]:
        out.append({"text": f'Average Opportunity Score across the pipeline is {k["avgScore"]}/100.', "metric": k["avgScore"]})
    by_owner = {}
    for c in companies:
        if recommendation_of(c) == "High Priority":
            o = c["crm"].get("owner") or "Unassigned"
            by_owner[o] = by_owner.get(o, 0) + 1
    to = _top(by_owner)
    if to["count"] > 0:
        out.append({"text": f'{to["label"]} owns the most high-priority accounts ({to["count"]}).', "metric": to["count"]})
    if k["totalCompanies"]:
        out.append({"text": f'{round(k["validated"] / k["totalCompanies"] * 100)}% of uploaded companies passed validation.', "metric": f'{round(k["validated"] / k["totalCompanies"] * 100)}%'})
    return out[:8]


def company_view(c, validation, research) -> Dict[str, Any]:
    v = validation_index(validation).get(c["id"], {"duplicate": False, "ownerConflict": False, "agencyConflict": False, "business": False, "types": []})
    st = _research_status(c, jobs_by_company(research))
    status = "Duplicate" if v["duplicate"] else "Conflict" if (v["ownerConflict"] or v["agencyConflict"]) else "Group" if v["business"] else "Unique"
    return {"id": c["id"], "crm": c["crm"], "ai": c.get("ai", {}), "industry": industry_of(c) or "—",
            "score": score_of(c), "recommendation": recommendation_of(c), "researchStatus": st,
            "validationStatus": status, "validationTypes": v["types"]}
