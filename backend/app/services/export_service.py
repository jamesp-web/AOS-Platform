"""Export the enriched CRM to .xlsx (CRM columns untouched + AI columns appended)."""
from pathlib import Path
from typing import Any, Dict, List

from openpyxl import Workbook
from openpyxl.styles import Font

from ..config import get_settings
from . import selectors

HEADERS = [
    ("Brand Name", lambda c, v: c["crm"]["brandName"]),
    ("Brand ID", lambda c, v: c["crm"]["brandId"]),
    ("Owner", lambda c, v: c["crm"]["owner"]),
    ("Agency", lambda c, v: c["crm"]["agency"]),
    ("Duplicate Status (CRM)", lambda c, v: c["crm"]["duplicateStatus"]),
    ("Validation Status", lambda c, v: v["validationStatus"]),
    ("Research Status", lambda c, v: v["researchStatus"]),
    ("Industry", lambda c, v: (c["ai"].get("intelligence") or {}).get("industry")),
    ("Company Type", lambda c, v: (c["ai"].get("intelligence") or {}).get("companyType")),
    ("Financial Health", lambda c, v: (c["ai"].get("intelligence") or {}).get("financialHealth")),
    ("Advertising Activity", lambda c, v: (c["ai"].get("intelligence") or {}).get("advertisingActivity")),
    ("Growth Signals", lambda c, v: (c["ai"].get("intelligence") or {}).get("growthSignals")),
    ("Expansion Signals", lambda c, v: (c["ai"].get("intelligence") or {}).get("expansionSignals")),
    ("AI Summary", lambda c, v: (c["ai"].get("intelligence") or {}).get("businessSummary")),
    ("Opportunity Score", lambda c, v: c["ai"].get("opportunityScore")),
    ("Recommendation", lambda c, v: c["ai"].get("recommendation")),
    ("Reason", lambda c, v: c["ai"].get("reason")),
]


def export_xlsx(session_id: str, companies: List[Dict[str, Any]], validation, research) -> Path:
    wb = Workbook()
    ws = wb.active
    ws.title = "ALIP Enriched"
    ws.append([h for h, _ in HEADERS])
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for c in companies:
        v = selectors.company_view(c, validation, research)
        ws.append([fn(c, v) for _, fn in HEADERS])
    out = get_settings().export_dir / f"alip_enriched_{session_id}.xlsx"
    wb.save(out)
    return out
