/**
 * ALIP · AIIntelligenceService (service — Phase 4)
 * ---------------------------------------------------------------------------
 * OpenAI acts ONLY as an intelligence analyst: it reads the Tavily research and
 * returns structured intelligence. It NEVER scores, ranks, or recommends — the
 * Scoring Engine owns those. To guarantee that even a misbehaving model can't
 * leak a decision, the output is whitelisted to the allowed analyst keys.
 *
 *   analyze(company) → Promise<{ industry, companyType, financialHealth,
 *     advertisingActivity, growthSignals, expansionSignals,
 *     decisionMakerLikelihood, businessSummary, keySignals[], confidence }>
 *
 * live = OpenAI (temperature 0, JSON) when a key is set; stub = deterministic
 * offline analysis otherwise. Live calls belong in the FastAPI backend for prod
 * (key + CORS) — the request shape here is identical to ease that move.
 */
(function (root) {
  'use strict';

  var KEY_STORAGE = 'alip.openai.apiKey';

  // analyst-v2 schema (superset of v1). Mirrors backend/app/prompts/analyst_prompt.py.
  var ALLOWED_KEYS = ['industry', 'companyType', 'financialHealth',
    'advertisingActivity', 'offlineAdvertisingChannels', 'digitalMarketingActivity',
    'growthSignals', 'expansionSignals', 'retailPresence', 'storeOpenings',
    'campaignFrequency', 'seasonalCampaigns', 'brandAwarenessCampaigns',
    'marketingInvestment', 'decisionMakerLikelihood',
    'businessSummary', 'keySignals', 'confidence'];
  // keys the analyst must never emit (decisions belong to the app)
  var FORBIDDEN = { opportunityScore: 1, score: 1, recommendation: 1, priority: 1, rating: 1, rank: 1 };
  var OOH_CHANNELS = ['Billboards', 'Hoardings', 'Metro Branding', 'Airport Branding',
    'Mall Branding', 'Transit Advertising', 'Digital Screens', 'LED Screens'];

  function getApiKey() { try { return (root.localStorage && root.localStorage.getItem(KEY_STORAGE)) || ''; } catch (e) { return ''; } }
  function hasApiKey() { return !!getApiKey(); }

  /** Keep only allowed analyst keys; drop any decision fields the model added. */
  function whitelist(obj) {
    var out = {};
    ALLOWED_KEYS.forEach(function (k) { if (obj[k] !== undefined) { out[k] = obj[k]; } });
    for (var k in obj) { if (FORBIDDEN[k]) { /* explicitly discarded */ } }
    if (!Array.isArray(out.keySignals)) { out.keySignals = out.keySignals ? [String(out.keySignals)] : []; }
    // Normalise OOH channels to the known vocabulary (exact strings), dropping anything unrecognised.
    var known = {};
    OOH_CHANNELS.forEach(function (c) { known[c.toLowerCase()] = c; });
    var raw = Array.isArray(out.offlineAdvertisingChannels) ? out.offlineAdvertisingChannels
      : (out.offlineAdvertisingChannels ? [out.offlineAdvertisingChannels] : []);
    out.offlineAdvertisingChannels = raw
      .map(function (x) { return known[String(x).trim().toLowerCase()]; })
      .filter(function (x) { return !!x; });
    out.confidence = Math.max(0, Math.min(100, parseInt(out.confidence, 10) || 0));
    return out;
  }

  // ── deterministic stub helpers ──
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function pick(arr, seed) { return arr[hash(seed) % arr.length]; }

  function detectIndustry(name) {
    var n = String(name).toLowerCase();
    if (/jewel|gold|diamond|tanishq|kalyan/.test(n)) { return 'Jewellery'; }
    if (/hospital|clinic|\beye\b|health|pharma|\bcare\b|dental/.test(n)) { return 'Healthcare'; }
    if (/insur|\bbank\b|loan|\baxa\b|\bsbi\b|finance|mutual|capital/.test(n)) { return 'BFSI'; }
    if (/preschool|school|kidz|educat|academy|college/.test(n)) { return 'Education'; }
    if (/propert|builder|realty|smartspace|estate|infra/.test(n)) { return 'Real Estate'; }
    if (/hotel|marriott|resort|hospitality/.test(n)) { return 'Hospitality'; }
    if (/media|\bstar\b|outdoor|broadcast|jiostar/.test(n)) { return 'Entertainment & Media'; }
    if (/incense|\bpet\b|hing|fmcg|foods|beverage/.test(n)) { return 'FMCG'; }
    if (/mall|marketcity|phoenix|retail|bazaar|mart|store|fashion|clothing|puma|aza/.test(n)) { return 'Retail'; }
    if (/auto|motor|\bcar\b|vehicle/.test(n)) { return 'Automobiles'; }
    return 'Consumer Goods & Durables';
  }
  var TYPE_BY_INDUSTRY = {
    'Retail': 'Retail Chain', 'BFSI': 'Financial Services', 'Healthcare': 'Healthcare Provider',
    'Real Estate': 'Real Estate Developer', 'Jewellery': 'Jewellery Retailer',
    'Entertainment & Media': 'Media Company', 'Education': 'Education Provider',
    'Hospitality': 'Hospitality Group', 'FMCG': 'FMCG Brand', 'Automobiles': 'Automotive'
  };

  function stubAnalyze(company) {
    var crm = company.crm || company;
    var name = crm.brandName;
    var industry = detectIndustry(name);
    var fin = pick(['Strong', 'Strong', 'Moderate', 'Stable', 'Weak'], name + '|fin');
    var adv = pick(['Very High', 'High', 'Medium', 'Low', 'Inactive'], name + '|adv');
    var growth = pick(['Strong', 'Positive', 'Moderate', 'Flat', 'Declining'], name + '|grw');
    var expansion = pick(['Aggressive', 'Expanding', 'Moderate', 'Stable', 'Contracting'], name + '|exp');
    var dm = pick(['High', 'High', 'Medium', 'Low'], name + '|dm');
    var confidence = 70 + (hash(name + '|conf') % 26);
    var researched = company.ai && company.ai.research;
    var channels = OOH_CHANNELS.slice(0, hash(name + '|ch') % (OOH_CHANNELS.length + 1)); // 0..8 formats
    return {
      industry: industry,
      companyType: TYPE_BY_INDUSTRY[industry] || 'Consumer Brand',
      financialHealth: fin,
      advertisingActivity: adv,
      offlineAdvertisingChannels: channels,
      digitalMarketingActivity: pick(['Very High', 'High', 'Medium', 'Low', 'Inactive'], name + '|dig'),
      growthSignals: growth,
      expansionSignals: expansion,
      retailPresence: pick(['Extensive', 'Moderate', 'Limited', 'Online-only', 'Unknown'], name + '|ret'),
      storeOpenings: pick(['Rapid', 'Active', 'Occasional', 'None', 'Unknown'], name + '|so'),
      campaignFrequency: pick(['Frequent', 'Periodic', 'Occasional', 'Rare', 'None'], name + '|cf'),
      seasonalCampaigns: pick(['Active', 'Occasional', 'None', 'Unknown'], name + '|sea'),
      brandAwarenessCampaigns: pick(['Active', 'Occasional', 'None', 'Unknown'], name + '|baw'),
      marketingInvestment: pick(['High', 'Moderate', 'Low', 'Minimal', 'Unknown'], name + '|mi'),
      decisionMakerLikelihood: dm,
      businessSummary: name + ' operates in the ' + industry + ' sector as a ' + (TYPE_BY_INDUSTRY[industry] || 'consumer brand') +
        '. Research indicates ' + fin.toLowerCase() + ' financial health, ' + adv.toLowerCase() +
        ' advertising activity and ' + growth.toLowerCase() + ' growth signals.',
      keySignals: [
        'Advertising activity: ' + adv,
        'Growth: ' + growth + ' · Expansion: ' + expansion,
        researched ? 'Sourced from ' + (company.ai.research.sources || []).length + ' research references' : 'Limited public research'
      ],
      confidence: confidence
    };
  }

  // ── live OpenAI (delegated to the dedicated, resilient OpenAIService) ──
  function openaiSvc() {
    return (typeof module !== 'undefined' && module.exports) ? require('./openaiService.js') : (root.ALIP && root.ALIP.OpenAIService);
  }
  /**
   * Live analysis via OpenAI. Resolves to raw structured intelligence, or
   * rejects with a graceful error (the pipeline catches per-company and
   * continues — one failure never crashes the run).
   */
  function liveAnalyze(company) {
    var svc = openaiSvc();
    if (!svc) { return Promise.reject(new Error('OpenAIService not loaded')); }
    var crm = company.crm || company;
    return svc.analyze({ companyName: crm.brandName, research: (company.ai && company.ai.research) || {} })
      .then(function (r) {
        if (r.ok) { return r.data; }
        throw new Error(r.error || 'OpenAI analysis failed');
      });
  }

  /**
   * Public: analyse one company's research into structured intelligence.
   * Uses the real OpenAI API when a key is configured; otherwise the
   * deterministic offline stub so the pipeline still runs for local dev.
   */
  function analyze(company) {
    if (hasApiKey()) { return liveAnalyze(company).then(whitelist); }
    return Promise.resolve(whitelist(stubAnalyze(company)));
  }

  var AIIntelligenceService = {
    KEY_STORAGE: KEY_STORAGE, ALLOWED_KEYS: ALLOWED_KEYS,
    getApiKey: getApiKey, hasApiKey: hasApiKey,
    whitelist: whitelist, stubAnalyze: stubAnalyze, liveAnalyze: liveAnalyze, analyze: analyze
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = AIIntelligenceService; }
  else { root.ALIP = root.ALIP || {}; root.ALIP.AIIntelligenceService = AIIntelligenceService; }
})(typeof self !== 'undefined' ? self : this);
