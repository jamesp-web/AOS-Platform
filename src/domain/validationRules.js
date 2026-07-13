/**
 * ALIP · ValidationRules (domain — dedup building block #4)
 * ---------------------------------------------------------------------------
 * The tunable policy layer: similarity thresholds, the mapping from a detected
 * duplicate TYPE to a Recommended Action (Merge / Review / Keep Separate), and
 * human-readable reason templates. Isolated so business policy can change
 * without touching detection math or UI.
 *
 * Mirrors future backend config: backend/services/dedup/rules.py
 */
(function (root) {
  'use strict';

  var THRESHOLDS = {
    fuzzy: 0.82,      // ≥ this similarity ⇒ likely same company
    fuzzyHigh: 0.92,  // ≥ this ⇒ confident enough to recommend Merge
    group: 0.6        // ≥ this group confidence ⇒ business-group link
  };

  var TYPES = {
    EXACT: 'exact',
    FUZZY: 'fuzzy',
    BUSINESS: 'business',
    OWNER_CONFLICT: 'owner-conflict',
    AGENCY_CONFLICT: 'agency-conflict'
  };

  var LABELS = {
    'exact': 'Exact Duplicate',
    'fuzzy': 'Fuzzy Duplicate',
    'business': 'Business Duplicate',
    'owner-conflict': 'Owner Conflict',
    'agency-conflict': 'Agency Conflict'
  };

  /** Map a detection to a recommended action. */
  function recommendedAction(type, confidence) {
    switch (type) {
      case TYPES.EXACT: return 'Merge';
      case TYPES.FUZZY: return confidence >= THRESHOLDS.fuzzyHigh ? 'Merge' : 'Review';
      case TYPES.BUSINESS: return 'Keep Separate';
      case TYPES.OWNER_CONFLICT: return 'Review';
      case TYPES.AGENCY_CONFLICT: return 'Review';
      default: return 'Review';
    }
  }

  function pct(conf) { return Math.round(conf * 100) + '%'; }

  /** Human explanation the founder can read at a glance. */
  function reason(type, ctx) {
    var A = ctx.a, B = ctx.b;
    switch (type) {
      case TYPES.EXACT:
        return 'Identical brand name and Brand ID (' + (ctx.brandId || '—') + '). Certainly the same record.';
      case TYPES.FUZZY:
        return 'Names are ' + pct(ctx.confidence) + ' similar — “' + A + '” vs “' + B +
               '”. Very likely the same company with a naming variation.';
      case TYPES.BUSINESS:
        return 'Both “' + A + '” and “' + B + '” belong to the ' + ctx.parent +
               ' group. Distinct sub-brands — keep separate but link to the parent.';
      case TYPES.OWNER_CONFLICT:
        return 'The same company is assigned to different owners: ' + ctx.ownerA +
               ' and ' + ctx.ownerB + '. One should own the account.';
      case TYPES.AGENCY_CONFLICT:
        return 'The same company is mapped to different agencies: ' + ctx.agencyA +
               ' and ' + ctx.agencyB + '. Confirm the correct agency.';
      default:
        return 'Flagged for review.';
    }
  }

  var ValidationRules = {
    THRESHOLDS: THRESHOLDS,
    TYPES: TYPES,
    LABELS: LABELS,
    recommendedAction: recommendedAction,
    reason: reason,
    pct: pct
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ValidationRules;
  } else {
    root.ALIP = root.ALIP || {};
    root.ALIP.ValidationRules = ValidationRules;
  }
})(typeof self !== 'undefined' ? self : this);
