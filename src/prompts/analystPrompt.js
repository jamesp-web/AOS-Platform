/**
 * ALIP · Analyst Prompt (prompts)
 * ---------------------------------------------------------------------------
 * The reusable prompt for the OpenAI intelligence analyst, kept separate from
 * the service so it can be versioned and tuned without touching request logic.
 *
 * The prompt is deliberately constrained: the model extracts intelligence ONLY
 * and is forbidden from scoring, ranking, prioritising or recommending — those
 * are owned by the deterministic ScoringEngine.
 */
(function (root) {
  'use strict';

  var VERSION = 'analyst-v1';

  var ALLOWED_KEYS = ['industry', 'companyType', 'financialHealth', 'advertisingActivity',
    'growthSignals', 'expansionSignals', 'decisionMakerLikelihood', 'businessSummary', 'keySignals', 'confidence'];

  var SYSTEM = [
    'You are a company intelligence analyst for AdOnMo, a Digital Out-Of-Home (DOOH) advertising company.',
    'Your ONLY job is to read the provided research and extract structured intelligence about the company.',
    'You MUST NOT score, rank, prioritise, or recommend anything. You do not decide High/Low priority or fit.',
    'Those decisions are made by a separate deterministic engine — never by you.',
    '',
    'Return STRICT JSON (a single object, no prose, no markdown fences) with EXACTLY these keys:',
    '  industry (string),',
    '  companyType (string),',
    '  financialHealth: one of "Strong" | "Moderate" | "Weak" | "Stressed",',
    '  advertisingActivity: one of "Very High" | "High" | "Medium" | "Low" | "Inactive",',
    '  growthSignals: one of "Strong" | "Positive" | "Moderate" | "Flat" | "Declining",',
    '  expansionSignals: one of "Aggressive" | "Expanding" | "Moderate" | "Stable" | "Contracting",',
    '  decisionMakerLikelihood: one of "High" | "Medium" | "Low",',
    '  businessSummary (string, 1-2 sentences),',
    '  keySignals (array of short strings),',
    '  confidence (integer 0-100).',
    '',
    'If the research is thin or ambiguous, infer conservatively and LOWER the confidence value accordingly.',
    'Do NOT include any keys other than those listed. Never output a score, rating, rank, priority or recommendation.'
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
      'Extract the structured intelligence as instructed.';
  }

  var AnalystPrompt = { VERSION: VERSION, ALLOWED_KEYS: ALLOWED_KEYS, SYSTEM: SYSTEM, buildUser: buildUser };

  if (typeof module !== 'undefined' && module.exports) { module.exports = AnalystPrompt; }
  else { root.ALIP = root.ALIP || {}; root.ALIP.AnalystPrompt = AnalystPrompt; }
})(typeof self !== 'undefined' ? self : this);
