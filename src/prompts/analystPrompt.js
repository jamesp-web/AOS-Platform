/**
 * ALIP · Analyst Prompt (prompts)
 * ---------------------------------------------------------------------------
 * The reusable prompt for the OpenAI intelligence analyst, kept separate from
 * the service so it can be versioned and tuned without touching request logic.
 *
 * The prompt is deliberately constrained: the model extracts intelligence ONLY
 * and is forbidden from scoring, ranking, prioritising or recommending — those
 * are owned by the deterministic ScoringEngine.
 *
 * analyst-v2 widens extraction to the AdOnMo DOOH lead-intelligence dimensions
 * (offline/OOH channels, digital marketing, retail footprint, campaign cadence,
 * store openings, seasonal & brand-awareness activity, marketing investment)
 * while keeping every v1 key, so downstream scoring/exports stay compatible.
 * Mirrors backend/app/prompts/analyst_prompt.py.
 */
(function (root) {
  'use strict';

  var VERSION = 'analyst-v2';

  // Single source of truth for the OOH/DOOH channel vocabulary (matches the
  // whitelist + scoring engine). Only these exact strings are recognised.
  var OOH_CHANNELS = ['Billboards', 'Hoardings', 'Metro Branding', 'Airport Branding',
    'Mall Branding', 'Transit Advertising', 'Digital Screens', 'LED Screens'];

  var ALLOWED_KEYS = ['industry', 'companyType', 'financialHealth',
    'advertisingActivity', 'offlineAdvertisingChannels', 'digitalMarketingActivity',
    'growthSignals', 'expansionSignals', 'retailPresence', 'storeOpenings',
    'campaignFrequency', 'seasonalCampaigns', 'brandAwarenessCampaigns',
    'marketingInvestment', 'decisionMakerLikelihood',
    'businessSummary', 'keySignals', 'confidence'];

  var SYSTEM = [
    'You are a company intelligence analyst for AdOnMo, a Digital Out-Of-Home (DOOH) advertising company.',
    'Your ONLY job is to read the provided research and extract structured intelligence about the company.',
    'You MUST NOT score, rank, prioritise, recommend, or judge whether the company is a good advertising prospect.',
    'You do not decide High/Low priority, fit, or "potential to purchase". A separate deterministic engine makes',
    'every such decision from the signals you extract — never you. Report what the research shows, nothing more.',
    '',
    'Return STRICT JSON (a single object, no prose, no markdown fences) with EXACTLY these keys:',
    '  industry (string), companyType (string),',
    '  financialHealth: one of "Strong" | "Moderate" | "Weak" | "Stressed",',
    '  advertisingActivity: overall offline/OOH advertising level, one of "Very High" | "High" | "Medium" | "Low" | "Inactive",',
    '  offlineAdvertisingChannels: array — only the OOH formats the research shows this company actually uses,',
    '    each an exact string from: ' + OOH_CHANNELS.map(function (c) { return '"' + c + '"'; }).join(', ') + '. Use [] if none are evidenced.',
    '  digitalMarketingActivity: one of "Very High" | "High" | "Medium" | "Low" | "Inactive",',
    '  growthSignals: one of "Strong" | "Positive" | "Moderate" | "Flat" | "Declining",',
    '  expansionSignals: geographic/market expansion, one of "Aggressive" | "Expanding" | "Moderate" | "Stable" | "Contracting",',
    '  retailPresence: physical retail footprint, one of "Extensive" | "Moderate" | "Limited" | "Online-only" | "Unknown",',
    '  storeOpenings: recent new-outlet activity, one of "Rapid" | "Active" | "Occasional" | "None" | "Unknown",',
    '  campaignFrequency: how often it runs marketing campaigns, one of "Frequent" | "Periodic" | "Occasional" | "Rare" | "None",',
    '  seasonalCampaigns: one of "Active" | "Occasional" | "None" | "Unknown",',
    '  brandAwarenessCampaigns: one of "Active" | "Occasional" | "None" | "Unknown",',
    '  marketingInvestment: observed spend/investment signals, one of "High" | "Moderate" | "Low" | "Minimal" | "Unknown",',
    '  decisionMakerLikelihood: one of "High" | "Medium" | "Low",',
    '  businessSummary (string, 1-2 sentences), keySignals (array of short strings), confidence (integer 0-100).',
    '',
    'VERIFY IDENTITY FIRST. Research is fetched by name, and results may describe a DIFFERENT entity that merely shares the name',
    '(a person, place, mythological term, or unrelated brand). Confirm the sources are actually about THIS company — the name',
    'itself is a signal (words like "Motors", "Textiles", "Hospital" or "Jewellers" indicate the sector). If the sources describe',
    'a different same-named entity, or you cannot confirm they are the same company, set confidence to 25 or lower, state the',
    'ambiguity in businessSummary, and prefer "Unknown"/[] over confidently wrong values.',
    '',
    'Only list an offline channel or assert an activity level the research actually supports — do NOT guess formats a company',
    '"probably" uses. If the research is thin or ambiguous, use "Unknown"/[] and LOWER the confidence value accordingly.',
    'Do NOT include any keys other than those listed. Never output a score, rating, rank, priority, recommendation, or purchase likelihood.'
  ].join('\n');

  /** Build the user message from the company name + Tavily research. */
  function buildUser(input) {
    input = input || {};
    var name = input.companyName || '(unknown company)';
    var research = input.research || {};
    var sources = (research.sources || []).map(function (s) {
      return '- ' + (s.title || 'source') + ': ' + String(s.snippet || '').slice(0, 300);
    }).join('\n');
    return 'Company: ' + name + '\n\n' +
      'Research answer:\n' + (research.answer || 'No research answer available.') + '\n\n' +
      'Sources:\n' + (sources || 'No sources available.') + '\n\n' +
      'First confirm the sources above describe this exact company (the name is a strong signal). ' +
      'If they describe a different, similarly named entity, report low confidence and do not invent an industry. ' +
      'Then extract the structured intelligence as instructed, listing only the offline channels and ' +
      'activity levels the sources actually support.';
  }

  var AnalystPrompt = { VERSION: VERSION, OOH_CHANNELS: OOH_CHANNELS, ALLOWED_KEYS: ALLOWED_KEYS, SYSTEM: SYSTEM, buildUser: buildUser };

  if (typeof module !== 'undefined' && module.exports) { module.exports = AnalystPrompt; }
  else { root.ALIP = root.ALIP || {}; root.ALIP.AnalystPrompt = AnalystPrompt; }
})(typeof self !== 'undefined' ? self : this);
