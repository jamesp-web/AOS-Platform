/**
 * Phase 6 tests — real OpenAI service resilience (mocked fetch, no network).
 * Run: node tests/phase6.test.cjs
 */
const assert = require('assert');
const OpenAIService = require('../src/services/openaiService.js');
const AnalystPrompt = require('../src/prompts/analystPrompt.js');
const AIIntelligenceService = require('../src/services/aiIntelligenceService.js');

let passed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(function () { passed++; console.log('  ✓ ' + name); },
    function (e) { console.error('  ✗ ' + name + '\n      ' + (e && e.message)); process.exitCode = 1; });
}

// Minimal Response mock.
function res(status, body, headers) {
  return Promise.resolve({
    ok: status >= 200 && status < 300, status: status,
    headers: { get: function (h) { return (headers || {})[h.toLowerCase()]; } },
    json: function () { return Promise.resolve(body); },
    text: function () { return Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)); }
  });
}
function okBody(obj) { return { choices: [{ message: { content: JSON.stringify(obj) } }] }; }
var INTEL = { industry: 'Retail', companyType: 'Retail Chain', financialHealth: 'Strong', advertisingActivity: 'Very High', growthSignals: 'Positive', expansionSignals: 'Expanding', decisionMakerLikelihood: 'High', businessSummary: 'A retailer.', keySignals: ['ads'], confidence: 82 };
var OPTS = { apiKey: 'sk-test', maxRetries: 0 };

(async function () {
  console.log('AnalystPrompt');
  await test('prompt forbids scoring and lists only analyst keys', function () {
    assert.ok(/MUST NOT score/i.test(AnalystPrompt.SYSTEM));
    assert.ok(AnalystPrompt.ALLOWED_KEYS.indexOf('opportunityScore') === -1);
    var u = AnalystPrompt.buildUser({ companyName: 'Reliance Retail', research: { answer: 'big retailer', sources: [{ title: 'Site', snippet: 'shops' }] } });
    assert.ok(/Reliance Retail/.test(u) && /big retailer/.test(u));
  });

  console.log('OpenAIService — success & analyst-only');
  await test('returns structured JSON on success', async function () {
    var r = await OpenAIService.analyze({ companyName: 'X', research: {} }, { apiKey: 'sk', maxRetries: 0, fetch: function () { return res(200, okBody(INTEL)); } });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.data.industry, 'Retail');
  });
  await test('a score from the model is stripped by the whitelist (analyst-only, end to end)', async function () {
    var dirty = Object.assign({}, INTEL, { opportunityScore: 99, recommendation: 'High Priority', priority: 'High' });
    var r = await OpenAIService.analyze({ companyName: 'X', research: {} }, { apiKey: 'sk', maxRetries: 0, fetch: function () { return res(200, okBody(dirty)); } });
    var clean = AIIntelligenceService.whitelist(r.data);
    assert.strictEqual(clean.opportunityScore, undefined);
    assert.strictEqual(clean.recommendation, undefined);
    assert.strictEqual(clean.priority, undefined);
    assert.strictEqual(clean.industry, 'Retail');
  });

  console.log('OpenAIService — resilience');
  await test('retries on 429 (rate limit) then succeeds', async function () {
    var n = 0;
    var r = await OpenAIService.analyze({ companyName: 'X', research: {} }, {
      apiKey: 'sk', maxRetries: 5,
      fetch: function () { n++; return n < 3 ? res(429, { error: 'rate' }, { 'retry-after': '0.001' }) : res(200, okBody(INTEL)); }
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(n, 3);
  });
  await test('returns a graceful error on 500 (never throws)', async function () {
    var r = await OpenAIService.analyze({ companyName: 'X', research: {} }, Object.assign({}, OPTS, { fetch: function () { return res(500, { error: 'boom' }); } }));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'http_500');
  });
  await test('invalid JSON from the model → graceful error', async function () {
    var r = await OpenAIService.analyze({ companyName: 'X', research: {} }, Object.assign({}, OPTS, { fetch: function () { return res(200, { choices: [{ message: { content: 'not json at all' } }] }); } }));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'invalid_json');
  });
  await test('salvages a JSON object embedded in prose', async function () {
    var r = await OpenAIService.analyze({ companyName: 'X', research: {} }, { apiKey: 'sk', maxRetries: 0, fetch: function () { return res(200, { choices: [{ message: { content: 'Here you go:\n' + JSON.stringify(INTEL) + '\nThanks' } }] }); } });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.data.confidence, 82);
  });
  await test('timeout / abort → graceful timeout error', async function () {
    var r = await OpenAIService.analyze({ companyName: 'X', research: {} }, Object.assign({}, OPTS, { fetch: function () { var e = new Error('aborted'); e.name = 'AbortError'; return Promise.reject(e); } }));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'timeout');
  });
  await test('network failure → graceful network error', async function () {
    var r = await OpenAIService.analyze({ companyName: 'X', research: {} }, Object.assign({}, OPTS, { fetch: function () { return Promise.reject(new Error('ECONNRESET')); } }));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'network');
  });
  await test('a fetch that throws synchronously never crashes the pipeline', async function () {
    var r = await OpenAIService.analyze({ companyName: 'X', research: {} }, Object.assign({}, OPTS, { fetch: function () { throw new Error('sync boom'); } }));
    assert.strictEqual(r.ok, false);
  });
  await test('unknown model → one-time fallback to a known model', async function () {
    var models = [];
    var r = await OpenAIService.analyze({ companyName: 'X', research: {} }, {
      apiKey: 'sk', maxRetries: 0, model: 'gpt-5.5',
      fetch: function (url, req) { var m = JSON.parse(req.body).model; models.push(m); return m === 'gpt-5.5' ? res(404, { error: { message: "The model 'gpt-5.5' does not exist" } }) : res(200, okBody(INTEL)); }
    });
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.model, OpenAIService.FALLBACK_MODEL);
    assert.ok(models.indexOf('gpt-5.5') !== -1 && models.indexOf(OpenAIService.FALLBACK_MODEL) !== -1);
  });
  await test('no API key → graceful no_key error (offline)', async function () {
    var r = await OpenAIService.analyze({ companyName: 'X', research: {} }, { apiKey: '', fetch: function () { return res(200, okBody(INTEL)); } });
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.code, 'no_key');
  });

  console.log('\n' + passed + ' checks passed.');
})();
