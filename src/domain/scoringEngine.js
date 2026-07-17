/**
 * ALIP · ScoringEngine (domain)
 * ---------------------------------------------------------------------------
 * The AdOnMo Opportunity Score. DETERMINISTIC and owned entirely by the
 * application — OpenAI never produces or influences a number here. Given the
 * same intelligence + CRM inputs, it always returns the same score, breakdown
 * and recommendation, so every decision is reproducible and auditable.
 *
 * Fixed weights (max points per factor, summing to 100):
 *   Business Health 20 · Advertising 20 · Industry Fit 15 · Growth 15 ·
 *   Expansion 10 · Decision Maker 10 · Lead Quality 10
 *
 * Pure module. Mirrors future backend: backend/services/scoring_engine.py
 */
(function (root) {
  'use strict';

  var WEIGHTS = {
    businessHealth: 20, advertising: 20, industryFit: 15,
    growth: 15, expansion: 10, decisionMaker: 10, leadQuality: 10
  };

  // Fixed qualitative → points lookups (keys lower-cased at read time).
  var FINANCIAL = { 'very strong': 20, 'strong': 18, 'healthy': 17, 'stable': 14, 'moderate': 12, 'weak': 7, 'stressed': 3 };
  var ADVERTISING = { 'very high': 20, 'high': 17, 'medium': 13, 'moderate': 13, 'low': 8, 'inactive': 4, 'none': 4 };
  var GROWTH = { 'strong': 15, 'high': 15, 'positive': 13, 'moderate': 10, 'flat': 7, 'stable': 7, 'declining': 4, 'negative': 4 };
  var EXPANSION = { 'aggressive': 10, 'expanding': 8, 'active': 8, 'moderate': 6, 'stable': 5, 'contracting': 2 };
  var DECISION = { 'very high': 10, 'high': 9, 'medium': 6, 'moderate': 6, 'low': 3 };
  // DOOH industry fit (out of 15).
  var INDUSTRY_FIT = {
    'retail': 15, 'real estate': 15, 'jewellery': 14, 'jewelry': 14,
    'consumer goods & durables': 13, 'consumer goods and durables': 13, 'fmcg': 13,
    'healthcare': 12, 'automobiles': 12, 'hospitality': 12, 'education': 11,
    'bfsi': 10, 'banking': 10, 'entertainment & media': 10, 'entertainment and media': 10,
    'government': 4
  };

  // ── analyst-v2 richer signals ──────────────────────────────────────────────
  // Refine the advertising & expansion factors. Every table returns 0 for an
  // absent, "Unknown" or unrecognised value, so v1-era intelligence (which lacks
  // these keys) scores identically to before — the boosts only add signal.
  var OOH_CHANNELS = ['billboards', 'hoardings', 'metro branding', 'airport branding',
    'mall branding', 'transit advertising', 'digital screens', 'led screens'];
  var MARKETING_INVEST = { 'high': 3, 'moderate': 1, 'low': 0, 'minimal': -1 };
  var CAMPAIGN_FREQ = { 'frequent': 2, 'periodic': 1, 'occasional': 0, 'rare': 0, 'none': -1 };
  var DIGITAL_MKTG = { 'very high': 2, 'high': 1, 'medium': 0, 'low': 0, 'inactive': 0 };
  var CAMPAIGN_YES_NO = { 'active': 1, 'occasional': 0, 'none': 0 };   // seasonal / brand-awareness
  var STORE_OPENINGS = { 'rapid': 3, 'active': 2, 'occasional': 1, 'none': 0 };
  var RETAIL_PRESENCE = { 'extensive': 2, 'moderate': 1, 'limited': 0, 'online-only': 0, 'online only': 0 };
  var OOH_PER_CHANNEL = 2;   // proven use of an OOH format is the strongest DOOH-buyer signal
  var OOH_CHANNEL_CAP = 8;

  function look(map, value, fallback) {
    if (value == null) { return fallback; }
    var v = map[String(value).trim().toLowerCase()];
    return v == null ? fallback : v;
  }

  /** Points for OOH formats the company already buys — capped so a long list can't dominate. */
  function oohChannelBoost(intel) {
    var channels = intel.offlineAdvertisingChannels;
    if (typeof channels === 'string') { channels = [channels]; }
    if (!Array.isArray(channels)) { return 0; }
    var n = channels.filter(function (c) { return OOH_CHANNELS.indexOf(String(c).trim().toLowerCase()) !== -1; }).length;
    return Math.min(OOH_CHANNEL_CAP, n * OOH_PER_CHANNEL);
  }

  /** DOOH-propensity signals layered on top of the headline advertisingActivity level. */
  function advertisingBoost(intel) {
    return oohChannelBoost(intel) +
      look(MARKETING_INVEST, intel.marketingInvestment, 0) +
      look(CAMPAIGN_FREQ, intel.campaignFrequency, 0) +
      look(DIGITAL_MKTG, intel.digitalMarketingActivity, 0) +
      look(CAMPAIGN_YES_NO, intel.seasonalCampaigns, 0) +
      look(CAMPAIGN_YES_NO, intel.brandAwarenessCampaigns, 0);
  }

  /** Physical-footprint growth = more real-world surfaces AdOnMo can sell against. */
  function expansionBoost(intel) {
    return look(STORE_OPENINGS, intel.storeOpenings, 0) + look(RETAIL_PRESENCE, intel.retailPresence, 0);
  }

  /** Lead Quality (0–10): CRM completeness + non-duplicate + analyst confidence. */
  function leadQuality(company, intel) {
    var crm = company.crm || {};
    var q = 0;
    if (crm.brandId) { q += 2.5; }
    if (crm.owner) { q += 2.5; }
    if (crm.agency) { q += 2.5; }
    var dup = String(crm.duplicateStatus || '').toLowerCase();
    if (dup.indexOf('dup') === -1) { q += 1.5; }              // clean / unique record
    var conf = (intel && intel.confidence) || 0;
    if (conf >= 80) { q += 1; } else if (conf >= 60) { q += 0.5; }
    return Math.min(10, Math.round(q));
  }

  var RECOMMENDATIONS = [
    { min: 90, label: 'High Priority' },
    { min: 75, label: 'Priority' },
    { min: 60, label: 'Review' },
    { min: 0,  label: 'Deprioritize' }
  ];
  function recommendationFor(total) {
    for (var i = 0; i < RECOMMENDATIONS.length; i++) {
      if (total >= RECOMMENDATIONS[i].min) { return RECOMMENDATIONS[i].label; }
    }
    return 'Deprioritize';
  }

  function businessReason(factors, total, recommendation) {
    var sorted = factors.slice().sort(function (a, b) { return (b.earned / b.max) - (a.earned / a.max); });
    var strong = sorted.slice(0, 2).map(function (f) { return f.label + ' (' + f.earned + '/' + f.max + ')'; });
    var weakest = sorted[sorted.length - 1];
    return 'Strongest signals: ' + strong.join(' and ') + '. ' +
           'Main upside: ' + weakest.label + ' (' + weakest.earned + '/' + weakest.max + '). ' +
           'Total ' + total + '/100 → ' + recommendation + '.';
  }

  /**
   * Compute the Opportunity Score from a company's AI intelligence + CRM data.
   * @returns {{ total, breakdown, recommendation, businessReason, weights }}
   */
  function score(company) {
    var intel = (company.ai && company.ai.intelligence) || {};
    var factors = [
      { key: 'businessHealth', label: 'Business Health', max: WEIGHTS.businessHealth, earned: look(FINANCIAL, intel.financialHealth, 10) },
      { key: 'advertising', label: 'Advertising Activity', max: WEIGHTS.advertising, earned: look(ADVERTISING, intel.advertisingActivity, 8) + advertisingBoost(intel) },
      { key: 'industryFit', label: 'Industry Fit', max: WEIGHTS.industryFit, earned: look(INDUSTRY_FIT, intel.industry, 9) },
      { key: 'growth', label: 'Growth Signals', max: WEIGHTS.growth, earned: look(GROWTH, intel.growthSignals, 8) },
      { key: 'expansion', label: 'Expansion Signals', max: WEIGHTS.expansion, earned: look(EXPANSION, intel.expansionSignals, 5) + expansionBoost(intel) },
      { key: 'decisionMaker', label: 'Decision Maker', max: WEIGHTS.decisionMaker, earned: look(DECISION, intel.decisionMakerLikelihood, 5) },
      { key: 'leadQuality', label: 'Lead Quality', max: WEIGHTS.leadQuality, earned: leadQuality(company, intel) }
    ];
    factors.forEach(function (f) {
      f.earned = Math.max(0, Math.min(f.max, Math.round(f.earned)));
      f.contribution = f.earned;                 // each factor's max is already its weight → contribution = points
    });
    var total = factors.reduce(function (sum, f) { return sum + f.earned; }, 0);
    var recommendation = recommendationFor(total);
    return {
      total: total,
      breakdown: factors,
      recommendation: recommendation,
      businessReason: businessReason(factors, total, recommendation),
      weights: WEIGHTS,
      scoredAt: new Date().toISOString()
    };
  }

  var ScoringEngine = {
    WEIGHTS: WEIGHTS, RECOMMENDATIONS: RECOMMENDATIONS,
    recommendationFor: recommendationFor, leadQuality: leadQuality, score: score
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = ScoringEngine; }
  else { root.ALIP = root.ALIP || {}; root.ALIP.ScoringEngine = ScoringEngine; }
})(typeof self !== 'undefined' ? self : this);
