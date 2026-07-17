"""Reusable OpenAI analyst prompt (versioned, kept separate from the service).

The model extracts intelligence ONLY — it must never score, rank, prioritise
or recommend. Those decisions belong to the deterministic ScoringEngine.

analyst-v2 widens extraction to the AdOnMo DOOH lead-intelligence dimensions
(offline/OOH channels, digital marketing, retail footprint, campaign cadence,
store openings, seasonal & brand-awareness activity, marketing investment) while
keeping every v1 key, so downstream scoring/exports stay backward compatible.
"""
from typing import Any, Dict

VERSION = "analyst-v2"

# Single source of truth for the OOH/DOOH channel vocabulary. Reused by the
# service whitelist, the scoring engine and the offline stub so the same set of
# formats is recognised everywhere.
OOH_CHANNELS = [
    "Billboards", "Hoardings", "Metro Branding", "Airport Branding",
    "Mall Branding", "Transit Advertising", "Digital Screens", "LED Screens",
]

ALLOWED_KEYS = [
    "industry", "companyType", "financialHealth",
    "advertisingActivity", "offlineAdvertisingChannels", "digitalMarketingActivity",
    "growthSignals", "expansionSignals", "retailPresence", "storeOpenings",
    "campaignFrequency", "seasonalCampaigns", "brandAwarenessCampaigns",
    "marketingInvestment", "decisionMakerLikelihood",
    "businessSummary", "keySignals", "confidence",
]

SYSTEM = "\n".join([
    "You are a company intelligence analyst for AdOnMo, a Digital Out-Of-Home (DOOH) advertising company.",
    "Your ONLY job is to read the provided research and extract structured intelligence about the company.",
    "You MUST NOT score, rank, prioritise, recommend, or judge whether the company is a good advertising prospect.",
    "You do not decide High/Low priority, fit, or 'potential to purchase'. A separate deterministic engine makes",
    "every such decision from the signals you extract — never you. Report what the research shows, nothing more.",
    "",
    "Return STRICT JSON (a single object, no prose, no markdown fences) with EXACTLY these keys:",
    "  industry (string), companyType (string),",
    '  financialHealth: one of "Strong" | "Moderate" | "Weak" | "Stressed",',
    '  advertisingActivity: overall offline/OOH advertising level, one of "Very High" | "High" | "Medium" | "Low" | "Inactive",',
    '  offlineAdvertisingChannels: array — only the OOH formats the research shows this company actually uses,',
    '    each an exact string from: ' + ", ".join(f'"{c}"' for c in OOH_CHANNELS) + ". Use [] if none are evidenced.",
    '  digitalMarketingActivity: one of "Very High" | "High" | "Medium" | "Low" | "Inactive",',
    '  growthSignals: one of "Strong" | "Positive" | "Moderate" | "Flat" | "Declining",',
    '  expansionSignals: geographic/market expansion, one of "Aggressive" | "Expanding" | "Moderate" | "Stable" | "Contracting",',
    '  retailPresence: physical retail footprint, one of "Extensive" | "Moderate" | "Limited" | "Online-only" | "Unknown",',
    '  storeOpenings: recent new-outlet activity, one of "Rapid" | "Active" | "Occasional" | "None" | "Unknown",',
    '  campaignFrequency: how often it runs marketing campaigns, one of "Frequent" | "Periodic" | "Occasional" | "Rare" | "None",',
    '  seasonalCampaigns: one of "Active" | "Occasional" | "None" | "Unknown",',
    '  brandAwarenessCampaigns: one of "Active" | "Occasional" | "None" | "Unknown",',
    '  marketingInvestment: observed spend/investment signals, one of "High" | "Moderate" | "Low" | "Minimal" | "Unknown",',
    '  decisionMakerLikelihood: one of "High" | "Medium" | "Low",',
    "  businessSummary (string, 1-2 sentences), keySignals (array of short strings), confidence (integer 0-100).",
    "",
    "VERIFY IDENTITY FIRST. Research is fetched by name, and the results may describe a DIFFERENT entity that merely shares the name (a person, a place, a mythological term, or an unrelated brand).",
    "Confirm the sources are actually about THIS company. Use the company name itself as a signal — a name containing words like 'Icecream', 'Motors', 'Textiles', 'Hospital' or 'Jewellers' indicates its sector.",
    "If the sources describe a different same-named entity, or you cannot confirm they are the same company, DO NOT assert an unrelated industry: set confidence to 25 or lower, state the ambiguity in businessSummary, and prefer 'Unknown' or conservative values over confidently wrong ones.",
    "",
    "Only list an offline channel or assert an activity level the research actually supports — do NOT guess formats a company 'probably' uses.",
    "If the research is thin or ambiguous, use 'Unknown'/[] and LOWER the confidence value.",
    "Do NOT include any keys other than those listed. Never output a score, rating, rank, priority, recommendation, or purchase likelihood.",
])


def build_user(company_name: str, research: Dict[str, Any]) -> str:
    research = research or {}
    sources = "\n".join(
        f"- {s.get('title', 'source')}: {str(s.get('snippet', ''))[:300]}"
        for s in (research.get("sources") or [])
    )
    return (
        f"Company: {company_name or '(unknown company)'}\n\n"
        f"Research answer:\n{research.get('answer') or 'No research answer available.'}\n\n"
        f"Sources:\n{sources or 'No sources available.'}\n\n"
        "First confirm the sources above describe this exact company (the name is a strong signal). "
        "If they describe a different, similarly named entity, report low confidence and do not invent an industry. "
        "Then extract the structured intelligence as instructed, listing only the offline channels and "
        "activity levels the sources actually support."
    )
