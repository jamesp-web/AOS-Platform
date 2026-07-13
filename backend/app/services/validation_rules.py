"""Duplicate-validation policy: thresholds, actions, reasons (port of validationRules.js)."""
THRESHOLDS = {"fuzzy": 0.82, "fuzzy_high": 0.92, "group": 0.6}

LABELS = {
    "exact": "Exact Duplicate", "fuzzy": "Fuzzy Duplicate", "business": "Business Duplicate",
    "owner-conflict": "Owner Conflict", "agency-conflict": "Agency Conflict",
}


def recommended_action(dtype: str, confidence: float) -> str:
    if dtype == "exact":
        return "Merge"
    if dtype == "fuzzy":
        return "Merge" if confidence >= THRESHOLDS["fuzzy_high"] else "Review"
    if dtype == "business":
        return "Keep Separate"
    return "Review"  # owner/agency conflict


def reason(dtype: str, ctx: dict) -> str:
    pct = round(ctx.get("confidence", 0) * 100)
    a, b = ctx.get("a"), ctx.get("b")
    if dtype == "exact":
        return f"Identical brand name and Brand ID ({ctx.get('brand_id') or '—'}). Certainly the same record."
    if dtype == "fuzzy":
        return f'Names are {pct}% similar — “{a}” vs “{b}”. Very likely the same company with a naming variation.'
    if dtype == "business":
        return f'Both “{a}” and “{b}” belong to the {ctx.get("parent")} group. Distinct sub-brands — keep separate but link to the parent.'
    if dtype == "owner-conflict":
        return f"The same company is assigned to different owners: {ctx.get('owner_a')} and {ctx.get('owner_b')}. One should own the account."
    if dtype == "agency-conflict":
        return f"The same company is mapped to different agencies: {ctx.get('agency_a')} and {ctx.get('agency_b')}. Confirm the correct agency."
    return "Flagged for review."
