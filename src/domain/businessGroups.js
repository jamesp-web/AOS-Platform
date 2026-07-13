/**
 * ALIP · BusinessGroups (domain — dedup building block #3)
 * ---------------------------------------------------------------------------
 * Detects when two distinct brands belong to the same parent business group
 * (e.g. "Reliance Retail", "Reliance Smart Bazaar", "Reliance Digital" → the
 * Reliance group) so the engine can create a parent relationship instead of
 * wrongly merging them.
 *
 * Two signals, both CONFIG-driven (no per-company logic baked into code):
 *   1. A registry of known conglomerates (high confidence).
 *   2. A generic heuristic: a shared, distinctive leading token (medium
 *      confidence) — so unknown groups are still caught.
 *
 * Mirrors future backend util: backend/services/dedup/business_groups.py
 */
(function (root) {
  'use strict';

  var Normalize = (typeof module !== 'undefined' && module.exports)
    ? require('./normalize.js')
    : (root.ALIP && root.ALIP.Normalize);

  /** Known parent groups → matching keyword(s). Extend freely; it is data. */
  var KNOWN_GROUPS = {
    'Reliance':      ['reliance', 'jio', 'jiomart'],
    'Tata':          ['tata', 'croma', 'titan', 'tanishq', 'westside'],
    'Aditya Birla':  ['aditya birla', 'pantaloons', 'ubl'],
    'Mahindra':      ['mahindra'],
    'Adani':         ['adani'],
    'Godrej':        ['godrej'],
    'Bharti':        ['bharti', 'airtel'],
    'Future Group':  ['future', 'big bazaar'],
    'Aza':           ['aza', 'araiya']
  };

  /** Generic first-token words that must NOT be treated as a group anchor. */
  var GENERIC = {
    'the': 1, 'new': 1, 'sri': 1, 'shree': 1, 'shri': 1, 'royal': 1, 'global': 1,
    'india': 1, 'national': 1, 'city': 1, 'star': 1, 'super': 1, 'smart': 1,
    'digital': 1, 'retail': 1, 'store': 1, 'stores': 1, 'group': 1
  };

  /** @returns {?{ parent:string, confidence:number, via:string }} */
  function detect(brandName) {
    var norm = Normalize.name(brandName);
    var clean = norm.clean;
    if (!clean) { return null; }

    for (var parent in KNOWN_GROUPS) {
      var keys = KNOWN_GROUPS[parent];
      for (var i = 0; i < keys.length; i++) {
        var kw = keys[i];
        if (clean === kw || clean.indexOf(kw + ' ') === 0 || clean.indexOf(' ' + kw) !== -1 || clean === kw) {
          return { parent: parent, confidence: 0.9, via: 'registry' };
        }
      }
    }

    var first = norm.tokens[0];
    if (first && first.length >= 4 && !GENERIC[first] && norm.tokens.length > 1) {
      var label = first.charAt(0).toUpperCase() + first.slice(1);
      return { parent: label, confidence: 0.6, via: 'heuristic' };
    }
    return null;
  }

  /** Do two brands resolve to the same parent group? */
  function sameGroup(nameA, nameB) {
    var ga = detect(nameA);
    var gb = detect(nameB);
    if (!ga || !gb) { return null; }
    if (ga.parent !== gb.parent) { return null; }
    return { parent: ga.parent, confidence: Math.min(ga.confidence, gb.confidence), via: ga.via };
  }

  var BusinessGroups = {
    KNOWN_GROUPS: KNOWN_GROUPS,
    detect: detect,
    sameGroup: sameGroup
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = BusinessGroups;
  } else {
    root.ALIP = root.ALIP || {};
    root.ALIP.BusinessGroups = BusinessGroups;
  }
})(typeof self !== 'undefined' ? self : this);
