/**
 * Phase 4 tests — AI Intelligence Service + deterministic Scoring Engine.
 * Run:  node tests/phase4.test.cjs
 */
const assert = require('assert');

const ScoringEngine = require('../src/domain/scoringEngine.js');
const AIIntelligenceService = require('../src/services/aiIntelligenceService.js');
const IntelligencePipeline = require('../src/services/intelligencePipeline.js');
const CompanyModel = require('../src/domain/companyModel.js');

let passed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(function () { passed++; console.log('  ✓ ' + name); },
    function (e) { console.error('  ✗ ' + name + '\n      ' + (e && e.message)); process.exitCode = 1; });
}
function byKey(breakdown, key) { return breakdown.filter(function (f) { return f.key === key; })[0]; }

(async function () {
  console.log('ScoringEngine — reproduces the worked example');
  const relianceRetail = {
    id: 'ALIP-1',
    crm: { brandName: 'Reliance Retail', brandId: 'BR-1', owner: 'Suraj', agency: 'GroupM', duplicateStatus: 'Unique' },
    ai: { intelligence: { industry: 'Retail', financialHealth: 'Strong', advertisingActivity: 'Very High', growthSignals: 'Positive', expansionSignals: 'Expanding', decisionMakerLikelihood: 'High', confidence: 88 } }
  };

  await test('Reliance Retail scores exactly 93 with the documented breakdown', function () {
    var s = ScoringEngine.score(relianceRetail);
    assert.strictEqual(byKey(s.breakdown, 'businessHealth').earned, 18);
    assert.strictEqual(byKey(s.breakdown, 'advertising').earned, 20);
    assert.strictEqual(byKey(s.breakdown, 'industryFit').earned, 15);
    assert.strictEqual(byKey(s.breakdown, 'growth').earned, 13);
    assert.strictEqual(byKey(s.breakdown, 'expansion').earned, 8);
    assert.strictEqual(byKey(s.breakdown, 'decisionMaker').earned, 9);
    assert.strictEqual(byKey(s.breakdown, 'leadQuality').earned, 10);
    assert.strictEqual(s.total, 93);
    assert.strictEqual(s.recommendation, 'High Priority');
  });
  await test('factor maxes sum to 100 (weights are fixed)', function () {
    var s = ScoringEngine.score(relianceRetail);
    assert.strictEqual(s.breakdown.reduce(function (a, f) { return a + f.max; }, 0), 100);
  });
  await test('scoring is deterministic — identical inputs, identical score', function () {
    var a = ScoringEngine.score(relianceRetail);
    var b = ScoringEngine.score(relianceRetail);
    assert.strictEqual(a.total, b.total);
    assert.deepStrictEqual(a.breakdown.map(function (f) { return f.earned; }), b.breakdown.map(function (f) { return f.earned; }));
  });

  console.log('ScoringEngine — recommendation thresholds');
  await test('90+/75-89/60-74/<60 map to the correct recommendation', function () {
    assert.strictEqual(ScoringEngine.recommendationFor(93), 'High Priority');
    assert.strictEqual(ScoringEngine.recommendationFor(90), 'High Priority');
    assert.strictEqual(ScoringEngine.recommendationFor(89), 'Priority');
    assert.strictEqual(ScoringEngine.recommendationFor(75), 'Priority');
    assert.strictEqual(ScoringEngine.recommendationFor(74), 'Review');
    assert.strictEqual(ScoringEngine.recommendationFor(60), 'Review');
    assert.strictEqual(ScoringEngine.recommendationFor(59), 'Deprioritize');
  });

  console.log('AIIntelligenceService — analyst only');
  await test('stub returns exactly the analyst schema', async function () {
    var c = CompanyModel.buildCompanies([{ brandName: 'Kalyan Jewellers', brandId: 'K1' }])[0];
    var intel = await AIIntelligenceService.analyze(c);
    ['industry', 'companyType', 'financialHealth', 'advertisingActivity', 'growthSignals',
     'expansionSignals', 'decisionMakerLikelihood', 'businessSummary', 'keySignals', 'confidence']
      .forEach(function (k) { assert.ok(k in intel, 'missing ' + k); });
    assert.ok(Array.isArray(intel.keySignals));
    assert.ok(intel.confidence >= 0 && intel.confidence <= 100);
    assert.strictEqual(intel.industry, 'Jewellery');
  });
  await test('the analyst NEVER emits a score/recommendation (whitelist enforced)', function () {
    var dirty = AIIntelligenceService.whitelist({
      industry: 'Retail', businessSummary: 'x', keySignals: ['a'], confidence: 80,
      opportunityScore: 99, score: 88, recommendation: 'High Priority', priority: 'High', rank: 1
    });
    assert.strictEqual(dirty.opportunityScore, undefined);
    assert.strictEqual(dirty.score, undefined);
    assert.strictEqual(dirty.recommendation, undefined);
    assert.strictEqual(dirty.priority, undefined);
    assert.strictEqual(dirty.rank, undefined);
    assert.strictEqual(dirty.industry, 'Retail');
  });

  console.log('IntelligencePipeline — analyse then score, separately');
  await test('scores only researched companies; skips the rest', async function () {
    var cs = CompanyModel.buildCompanies([{ brandName: 'Alpha', brandId: 'A1' }, { brandName: 'Bravo', brandId: 'B1' }]);
    cs[0].ai.researchStatus = 'done';        // researched
    // cs[1] stays 'pending'
    await IntelligencePipeline.run(cs, { ai: AIIntelligenceService, scoring: ScoringEngine });
    assert.ok(cs[0].ai.score && typeof cs[0].ai.opportunityScore === 'number');
    assert.strictEqual(cs[1].ai.score, null);
  });
  await test('stores intelligence (no score inside) and app-owned score/recommendation', async function () {
    var cs = CompanyModel.buildCompanies([{ brandName: 'Reliance Digital', brandId: 'D1', owner: 'Suraj', agency: 'GroupM' }]);
    cs[0].ai.researchStatus = 'done';
    await IntelligencePipeline.run(cs, { ai: AIIntelligenceService, scoring: ScoringEngine });
    var ai = cs[0].ai;
    assert.ok(ai.intelligence && ai.intelligence.industry);
    assert.strictEqual(ai.intelligence.opportunityScore, undefined, 'intelligence must not contain a score');
    assert.strictEqual(ai.intelligence.recommendation, undefined, 'intelligence must not contain a recommendation');
    assert.ok(ai.score && typeof ai.opportunityScore === 'number');
    assert.ok(['High Priority', 'Priority', 'Review', 'Deprioritize'].indexOf(ai.recommendation) !== -1);
    assert.ok(ai.reason && ai.reason.length > 10);
  });
  await test('end-to-end scoring is deterministic across runs', async function () {
    function one() {
      var c = CompanyModel.buildCompanies([{ brandName: 'PUMA India', brandId: 'P1', owner: 'Suruchi', agency: 'GroupM' }]);
      c[0].ai.researchStatus = 'done';
      return IntelligencePipeline.run(c, { ai: AIIntelligenceService, scoring: ScoringEngine }).then(function () { return c[0].ai.opportunityScore; });
    }
    var a = await one(), b = await one();
    assert.strictEqual(a, b, 'same company must always score the same (' + a + ' vs ' + b + ')');
  });

  console.log('\n' + passed + ' checks passed.');
})();
