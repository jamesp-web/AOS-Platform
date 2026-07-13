"""Canonical company model (port of companyModel.js).

CRM fields are read-only; every record gets a unique internal id and a
pre-allocated (empty) AI enrichment block filled by later services.
"""
from typing import Any, Dict, List

from ..utils.ids import company_id


def empty_enrichment() -> Dict[str, Any]:
    return {
        "industry": None, "financialHealth": None, "advertisingActivity": None,
        "growthSignals": None, "expansionSignals": None, "aiSummary": None,
        "opportunityScore": None, "recommendation": None, "reason": None,
        "research": None, "researchStatus": "pending",
        "intelligence": None, "score": None,
    }


def create_company(raw: Dict[str, Any], index: int) -> Dict[str, Any]:
    return {
        "id": company_id(index),
        "crm": {
            "brandName": raw.get("brandName", "") or "",
            "brandId": raw.get("brandId", "") or "",
            "owner": raw.get("owner", "") or "",
            "agency": raw.get("agency", "") or "",
            "duplicateStatus": raw.get("duplicateStatus", "") or "",
            "sourceRow": raw.get("rowIndex", index + 2),
        },
        "ai": empty_enrichment(),
        "validation": None,
    }


def build_companies(raw_rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return [create_company(r, i) for i, r in enumerate(raw_rows or [])]
