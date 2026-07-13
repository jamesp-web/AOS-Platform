/**
 * Phase 5 tests — IntelligenceSelectors (dashboard KPIs, insights, charts, views)
 * over a fully-run pipeline. Pure, no browser. Run: node tests/phase5.test.cjs
 */
const assert = require('assert');
const path = require('path');
const XLSX = require('xlsx');

const ExcelService = require('../src/services/excelService.js');
const CompanyModel = require('../src/domain/companyModel.js');
const DuplicateService = require('../src/services/duplicateService.js');
const ResearchQueue = require('../src/services/researchQueue.js');
const ResearchRunner = require('../src/services/researchRunner.js');
const AIIntelligenceService = require('../src/services/aiIntelligenceService.js');
const ScoringEngine = require('../src/domain/scoringEngine.js');
const IntelligencePipeline = require('../src/services/intelligencePipeline.js');
const S = require('../src/services/intelligenceSelectors.js');

let passed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(function () { passed++; console.log('  ✓ ' + name); },
    function (e) { console.error('  ✗ ' + name + '\n      ' + (e && e.message)); process.exitCode = 1; });
}

(async function () {
  // Build the full pipeline state from the sample CRM.
  var wb = XLSX.readFile(path.join(__dirname, '..', 'sample_data', 'srihari_mumbai_crm.xlsx'));
  var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: '' });
  var companies = CompanyModel.buildCompanies(ExcelService.extractCompanies(rows).companies);
  var validation = DuplicateService.analyze(companies);
  var queue = ResearchQueue.build(companies, validation);
  await ResearchRunner.processJobs(companies, queue.jobs, { research: function () { return Promise.resolve({ provider: 'test', sources: [] }); } });
  var research = { jobs: queue.jobs };
  await IntelligencePipeline.run(companies, { ai: AIIntelligenceService, scoring: ScoringEngine });

  console.log('computeKpis');
  var k = S.computeKpis(companies, validation, research);
  await test('totals, validated and duplicate leads are correct', function () {
    assert.strictEqual(k.totalCompanies, 23);
    assert.strictEqual(k.duplicateLeads, 8);          // 4 exact/fuzzy clusters × 2 members
    assert.strictEqual(k.validated, 15);
  });
  await test('research completed reflects the queue (skipped duplicates excluded)', function () {
    assert.strictEqual(k.researchCompleted, 19);
    assert.strictEqual(k.researchPending, 0);
  });
  await test('recommendation KPIs cover every scored company', function () {
    assert.strictEqual(k.highPriority + k.priority + k.reviewRequired + k.deprioritized, 19);
    assert.ok(k.avgScore > 40 && k.avgScore <= 100);
    assert.ok(k.topIndustry && k.topIndustry !== '—');
    assert.ok(k.topOwner && k.topOwner !== '—');
  });

  console.log('computeInsights');
  await test('produces plain-language, data-driven insights', function () {
    var ins = S.computeInsights(companies, validation, research);
    assert.ok(ins.length >= 3);
    assert.ok(ins.some(function (t) { return /Research has completed for \d+%/.test(t); }));
    assert.ok(ins.some(function (t) { return /High Priority|high-opportunity/.test(t); }));
  });

  console.log('computeCharts');
  var ch = S.computeCharts(companies, validation, research);
  await test('all six chart datasets are present and consistent', function () {
    ['scoreDistribution', 'industryDistribution', 'researchStatus', 'recommendationDistribution', 'duplicateTypes', 'ownerDistribution']
      .forEach(function (key) { assert.ok(Array.isArray(ch[key]) && ch[key].length, key + ' should be a non-empty array'); });
    var recSum = ch.recommendationDistribution.reduce(function (a, p) { return a + p.value; }, 0);
    assert.strictEqual(recSum, 19);
    var skipped = ch.researchStatus.filter(function (p) { return p.label === 'Skipped'; })[0];
    var completed = ch.researchStatus.filter(function (p) { return p.label === 'Completed'; })[0];
    assert.strictEqual(skipped.value, 4);
    assert.strictEqual(completed.value, 19);
  });

  console.log('companyView');
  await test('a skipped duplicate shows as Duplicate + Skipped + unscored', function () {
    var skippedJob = queue.jobs.filter(function (j) { return j.status === 'skipped'; })[0];
    var c = companies.filter(function (x) { return x.id === skippedJob.companyId; })[0];
    var v = S.companyView(c, validation, research);
    assert.strictEqual(v.researchStatus, 'skipped');
    assert.strictEqual(v.validationStatus, 'Duplicate');
    assert.strictEqual(v.score, null);
  });
  await test('a researched company shows a real score + recommendation', function () {
    var scored = companies.filter(function (c) { return c.ai && c.ai.score; })[0];
    var v = S.companyView(scored, validation, research);
    assert.ok(typeof v.score === 'number');
    assert.ok(['High Priority', 'Priority', 'Review', 'Deprioritize'].indexOf(v.recommendation) !== -1);
    assert.strictEqual(v.researchStatus, 'completed');
  });

  console.log('\n' + passed + ' checks passed.');
})();
