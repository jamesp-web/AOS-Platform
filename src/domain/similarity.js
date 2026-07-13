/**
 * ALIP · Similarity (domain — dedup building block #2)
 * ---------------------------------------------------------------------------
 * Pure string-similarity math. Combines a character-level Levenshtein ratio
 * with a token-set (Jaccard) ratio so it is robust to word re-ordering and
 * extra words ("Reliance Retail" vs "Reliance Retail Ltd" vs "Retail Reliance").
 *
 * Knows nothing about companies or business rules — just strings & tokens.
 * Mirrors future backend util: backend/services/dedup/similarity.py
 */
(function (root) {
  'use strict';

  var Normalize = (typeof module !== 'undefined' && module.exports)
    ? require('./normalize.js')
    : (root.ALIP && root.ALIP.Normalize);

  /** Levenshtein edit distance between two strings. */
  function levenshtein(a, b) {
    a = a || ''; b = b || '';
    if (a === b) { return 0; }
    if (!a.length) { return b.length; }
    if (!b.length) { return a.length; }
    var prev = new Array(b.length + 1);
    for (var j = 0; j <= b.length; j++) { prev[j] = j; }
    for (var i = 1; i <= a.length; i++) {
      var cur = [i];
      for (var k = 1; k <= b.length; k++) {
        var cost = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1;
        cur[k] = Math.min(cur[k - 1] + 1, prev[k] + 1, prev[k - 1] + cost);
      }
      prev = cur;
    }
    return prev[b.length];
  }

  /** Character-level similarity ratio in [0,1]. */
  function charRatio(a, b) {
    a = a || ''; b = b || '';
    var max = Math.max(a.length, b.length);
    if (max === 0) { return 1; }
    return 1 - (levenshtein(a, b) / max);
  }

  /** Token-set (Jaccard) similarity in [0,1]. */
  function tokenRatio(tokensA, tokensB) {
    var a = tokensA || [], b = tokensB || [];
    if (!a.length && !b.length) { return 1; }
    if (!a.length || !b.length) { return 0; }
    var setB = {}, i;
    for (i = 0; i < b.length; i++) { setB[b[i]] = 1; }
    var inter = 0, seen = {};
    for (i = 0; i < a.length; i++) {
      if (setB[a[i]] && !seen[a[i]]) { inter++; seen[a[i]] = 1; }
    }
    var union = {};
    for (i = 0; i < a.length; i++) { union[a[i]] = 1; }
    for (i = 0; i < b.length; i++) { union[b[i]] = 1; }
    return inter / Object.keys(union).length;
  }

  /**
   * Overall similarity between two raw brand names in [0,1].
   * Blends character ratio (typos, suffixes) and token ratio (word overlap).
   */
  function score(nameA, nameB) {
    var a = Normalize.name(nameA);
    var b = Normalize.name(nameB);
    if (!a.clean || !b.clean) { return 0; }
    if (a.clean === b.clean) { return 1; }
    var c = charRatio(a.clean, b.clean);
    var t = tokenRatio(a.tokens, b.tokens);
    return Math.round((0.5 * c + 0.5 * t) * 10000) / 10000;
  }

  var Similarity = {
    levenshtein: levenshtein,
    charRatio: charRatio,
    tokenRatio: tokenRatio,
    score: score
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Similarity;
  } else {
    root.ALIP = root.ALIP || {};
    root.ALIP.Similarity = Similarity;
  }
})(typeof self !== 'undefined' ? self : this);
