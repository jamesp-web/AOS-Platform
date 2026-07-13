/**
 * ALIP · Normalize (domain — dedup building block #1)
 * ---------------------------------------------------------------------------
 * Canonicalises brand names, owners and agencies so comparisons ignore noise
 * (legal suffixes, punctuation, casing, spacing). Kept separate from the
 * similarity math and the validation rules so each can evolve independently.
 *
 * Pure module. Mirrors future backend util: backend/services/dedup/normalize.py
 */
(function (root) {
  'use strict';

  /** Legal / generic tokens removed from brand names before comparison. */
  var LEGAL_TOKENS = {
    'pvt': 1, 'private': 1, 'ltd': 1, 'limited': 1, 'llp': 1, 'inc': 1,
    'incorporated': 1, 'corp': 1, 'corporation': 1, 'co': 1, 'company': 1,
    'group': 1, 'enterprises': 1, 'enterprise': 1, 'industries': 1,
    'the': 1, 'and': 1, '&': 1
  };

  function stripAccents(s) {
    return s.normalize ? s.normalize('NFD').replace(/[̀-ͯ]/g, '') : s;
  }

  /** Lower-case, trim, collapse whitespace — used for EXACT comparisons. */
  function exact(value) {
    return stripAccents(String(value == null ? '' : value))
      .toLowerCase().trim().replace(/\s+/g, ' ');
  }

  /**
   * Full name normalisation for FUZZY / group comparisons.
   * @returns {{ clean: string, tokens: string[] }}
   *          clean  = suffix-stripped, punctuation-free canonical string
   *          tokens = significant word tokens
   */
  function name(value) {
    var base = stripAccents(String(value == null ? '' : value)).toLowerCase();
    base = base.replace(/[^a-z0-9\s&]/g, ' ').replace(/\s+/g, ' ').trim();
    var tokens = base.split(' ').filter(function (t) {
      return t && !LEGAL_TOKENS[t];
    });
    return { clean: tokens.join(' '), tokens: tokens };
  }

  /** Normalise a person / owner name for conflict comparison. */
  function person(value) {
    return exact(value);
  }

  /** Normalise an agency name (treat common "in-house" variants alike). */
  function agency(value) {
    var v = exact(value).replace(/[^a-z0-9 ]/g, '');
    if (v === 'inhouse' || v === 'in house' || v === 'internal') { return 'in-house'; }
    return v;
  }

  var Normalize = {
    LEGAL_TOKENS: LEGAL_TOKENS,
    exact: exact,
    name: name,
    person: person,
    agency: agency
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Normalize;
  } else {
    root.ALIP = root.ALIP || {};
    root.ALIP.Normalize = Normalize;
  }
})(typeof self !== 'undefined' ? self : this);
