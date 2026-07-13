/**
 * ALIP · CompanyModel (domain)
 * ---------------------------------------------------------------------------
 * The canonical shape for a company inside ALIP. Raw CRM columns are wrapped
 * under `crm` (read-only, untouched), every record gets a guaranteed-unique
 * internal `id`, and an `ai` block is pre-allocated with EMPTY placeholders so
 * later phases (research, scoring) can fill it without reshaping the model.
 *
 * `crm.brandId` is intentionally NOT used as the internal id: it can be blank
 * or duplicated across rows. `id` is always unique within an upload.
 *
 * Pure module. Mirrors future backend model: backend/models/company.py
 */
(function (root) {
  'use strict';

  /** Empty AI-enrichment schema. Populated by later phases — never here. */
  function emptyEnrichment() {
    return {
      industry: null,
      financialHealth: null,
      advertisingActivity: null,
      growthSignals: null,
      expansionSignals: null,
      aiSummary: null,
      opportunityScore: null,   // AdOnMo Opportunity Score (0–100) — set by ScoringEngine
      recommendation: null,     // set by ScoringEngine (never OpenAI)
      reason: null,             // set by ScoringEngine
      research: null,           // raw Tavily research payload (Phase 3)
      researchStatus: 'pending',// lifecycle: pending → researching → done | cached | failed
      intelligence: null,       // structured analyst output (Phase 4, OpenAI) — no scores inside
      score: null               // full deterministic score breakdown (Phase 4, ScoringEngine)
    };
  }

  function pad(n, width) {
    var s = String(n);
    while (s.length < width) { s = '0' + s; }
    return s;
  }

  /**
   * Wrap one raw extracted CRM row into a canonical company.
   * @param {Object} raw   { brandName, brandId, owner, agency, duplicateStatus, rowIndex }
   * @param {number} index zero-based position within the upload
   */
  function createCompany(raw, index) {
    return {
      id: 'ALIP-' + pad(index + 1, 5),            // always-unique internal id
      crm: {
        brandName: raw.brandName || '',
        brandId: raw.brandId || '',
        owner: raw.owner || '',
        agency: raw.agency || '',
        duplicateStatus: raw.duplicateStatus || '',
        sourceRow: raw.rowIndex || (index + 2)
      },
      ai: emptyEnrichment(),
      validation: null                             // filled by DuplicateService (Phase 2)
    };
  }

  /** Wrap a list of raw extracted rows into canonical companies. */
  function buildCompanies(rawCompanies) {
    return (rawCompanies || []).map(function (raw, i) { return createCompany(raw, i); });
  }

  var CompanyModel = {
    emptyEnrichment: emptyEnrichment,
    createCompany: createCompany,
    buildCompanies: buildCompanies
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CompanyModel;
  } else {
    root.ALIP = root.ALIP || {};
    root.ALIP.CompanyModel = CompanyModel;
  }
})(typeof self !== 'undefined' ? self : this);
