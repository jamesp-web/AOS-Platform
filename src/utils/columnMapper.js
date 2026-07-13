/**
 * ALIP · ColumnMapper (utility)
 * ---------------------------------------------------------------------------
 * Resolves arbitrary CRM/Excel export headers to ALIP's canonical CRM fields.
 *
 * Real CRM exports never use identical header text ("Brand", "Company Name",
 * "Account"...). Rather than hardcode a single expected layout, we match each
 * canonical field against a configurable list of ALIASES. Adding a new header
 * variant is a config change, not a code change.
 *
 * Pure module. No DOM, no I/O. Safe to unit test in Node.
 * Mirrors future backend util: backend/utils/column_mapper.py
 */
(function (root) {
  'use strict';

  /** Canonical CRM field -> accepted header aliases (all lower-cased, space-normalised). */
  var ALIASES = {
    brandName:       ['brand name', 'brand', 'company', 'company name', 'name', 'account', 'account name', 'organisation', 'organization'],
    brandId:         ['brand id', 'brandid', 'id', 'brand code', 'account id', 'crm id', 'company id'],
    owner:           ['owner', 'poc', 'poc owner', 'sales owner', 'assigned to', 'rep', 'sales rep', 'account owner'],
    agency:          ['agency', 'agency name', 'media agency', 'ad agency'],
    duplicateStatus: ['duplicate status', 'duplicate', 'is duplicate', 'dup', 'dup status', 'duplicate flag']
  };

  /** Normalise a header cell for comparison: trim, lower-case, collapse spaces/underscores. */
  function norm(value) {
    return String(value == null ? '' : value).trim().toLowerCase().replace(/[\s_]+/g, ' ');
  }

  /**
   * Map a header row to canonical field -> column index.
   * @param {Array<*>} headerRow First row of the sheet.
   * @returns {{ map: Object.<string,number>, matched: string[], missing: string[] }}
   *          map[field] = column index (or -1 if not found).
   */
  function mapColumns(headerRow) {
    var normalized = (headerRow || []).map(norm);
    var map = {};
    var matched = [];
    var missing = [];

    Object.keys(ALIASES).forEach(function (field) {
      var idx = -1;
      var aliases = ALIASES[field];
      for (var a = 0; a < aliases.length; a++) {
        var found = normalized.indexOf(aliases[a]);
        if (found !== -1) { idx = found; break; }
      }
      map[field] = idx;
      (idx === -1 ? missing : matched).push(field);
    });

    return { map: map, matched: matched, missing: missing };
  }

  var ColumnMapper = { ALIASES: ALIASES, norm: norm, mapColumns: mapColumns };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ColumnMapper;                 // Node (tests)
  } else {
    root.ALIP = root.ALIP || {};
    root.ALIP.ColumnMapper = ColumnMapper;         // Browser
  }
})(typeof self !== 'undefined' ? self : this);
