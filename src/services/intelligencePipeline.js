/**
 * ALIP · IntelligencePipeline (service — Phase 4 orchestration)
 * ---------------------------------------------------------------------------
 * Runs the two SEPARATE modules for every researched company, in order:
 *   1. AIIntelligenceService.analyze()  → structured intelligence (no scores)
 *   2. ScoringEngine.score()            → deterministic Opportunity Score
 *
 * The AI output is stored at company.ai.intelligence and mirrored into the flat
 * placeholder fields; the score (owned by the app) is stored at company.ai.score
 * plus opportunityScore / recommendation / reason. Only companies whose research
 * is done/cached are processed; skipped duplicates are ignored.
 *
 * `run` is provider-injectable and store-agnostic for testability.
 * Mirrors future backend: backend/services/intelligence_pipeline.py
 */
(function (root) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);
  function dep(name, path) { return isNode ? require(path) : (root.ALIP && root.ALIP[name]); }

  function isResearched(c) {
    return c.ai && (c.ai.researchStatus === 'done' || c.ai.researchStatus === 'cached');
  }

  /**
   * @param {Object[]} companies canonical companies (mutated: ai.intelligence, ai.score …)
   * @param {Object} opts { ai, scoring, onUpdate(companies), reScore }
   */
  function run(companies, opts) {
    opts = opts || {};
    var ai = opts.ai || dep('AIIntelligenceService', '../services/aiIntelligenceService.js');
    var scoring = opts.scoring || dep('ScoringEngine', '../domain/scoringEngine.js');
    var onUpdate = opts.onUpdate || function () {};

    var targets = companies.filter(function (c) {
      if (!isResearched(c)) { return false; }
      return opts.reScore ? true : !(c.ai.intelligence);   // skip already-analysed unless re-scoring
    });

    var chain = Promise.resolve();
    targets.forEach(function (company) {
      chain = chain
        .then(function () { return ai.analyze(company); })
        .then(function (intelligence) {
          // 1) store analyst intelligence (whitelisted — no decisions inside)
          company.ai.intelligence = intelligence;
          company.ai.industry = intelligence.industry;
          company.ai.financialHealth = intelligence.financialHealth;
          company.ai.advertisingActivity = intelligence.advertisingActivity;
          company.ai.growthSignals = intelligence.growthSignals;
          company.ai.expansionSignals = intelligence.expansionSignals;
          company.ai.aiSummary = intelligence.businessSummary;
          company.ai.analysisError = null;

          // 2) SEPARATE deterministic scoring (the app owns the number)
          var result = scoring.score(company);
          company.ai.score = result;
          company.ai.opportunityScore = result.total;
          company.ai.recommendation = result.recommendation;
          company.ai.reason = result.businessReason;

          onUpdate(companies);
        })
        .catch(function (err) {
          company.ai.analysisError = String(err && err.message ? err.message : err);
          onUpdate(companies);
        });
    });

    return chain.then(function () { return companies; });
  }

  /** Progress stats for the UI. */
  function stats(companies) {
    var researched = 0, scored = 0, failed = 0;
    (companies || []).forEach(function (c) {
      if (isResearched(c)) { researched++; }
      if (c.ai && c.ai.score) { scored++; }
      if (c.ai && c.ai.analysisError) { failed++; }
    });
    return { researched: researched, scored: scored, failed: failed, remaining: researched - scored - failed };
  }

  var IntelligencePipeline = { run: run, stats: stats, isResearched: isResearched };

  if (isNode) { module.exports = IntelligencePipeline; }
  else { root.ALIP = root.ALIP || {}; root.ALIP.IntelligencePipeline = IntelligencePipeline; }
})(typeof self !== 'undefined' ? self : this);
