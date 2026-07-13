/**
 * Phase 5.5 tests — Executive Brief, Sales Action Center, Founder Insights.
 * Pure selectors over a fully-run pipeline. Run: node tests/phase5_5.test.cjs
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
  var wb = XLSX.readFile(path.join(__dirname, '..', 'sample_data', 'srihari_mumbai_crm.xlsx'));
  var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: '' });
  var companies = CompanyModel.buildCompanies(ExcelService.extractCompanies(rows).companies);
  var validation = DuplicateService.analyze(companies);
  var queue = ResearchQueue.build(companies, validation);
  await ResearchRunner.processJobs(companies, queue.jobs, { research: function () { return Promise.resolve({ provider: 'test', sources: [] }); } });
  var research = { jobs: queue.jobs };
  await IntelligencePipeline.run(companies, { ai: AIIntelligenceService, scoring: ScoringEngine });

  console.log('computeExecutiveBrief');
  var brief = S.computeExecutiveBrief(companies, validation, research);
  await test('produces plain-English brief lines with the upload count', function () {
    assert.ok(brief.lines.length >= 4);
    assert.ok(/23 companies uploaded from the CRM\./.test(brief.lines[0]));
    assert.ok(brief.lines.some(function (l) { return /Research completion is \d+%/.test(l); }));
  });
  await test('recommends the top-scored companies as focus', function () {
    assert.strictEqual(brief.focus.length, 3);
    assert.strictEqual(brief.focusCompanies[0].ai.opportunityScore >= brief.focusCompanies[1].ai.opportunityScore, true);
  });

  console.log('computeActions (Sales Action Center)');
  var actions = S.computeActions(companies, validation, research);
  await test('generates action cards with all required fields', function () {
    assert.ok(actions.length > 0);
    actions.forEach(function (a) {
      ['id', 'company', 'reason', 'action', 'priority', 'owner'].forEach(function (k) { assert.ok(a[k] != null && a[k] !== '', 'missing ' + k); });
      assert.ok(['High', 'Medium', 'Low'].indexOf(a.priority) !== -1);
    });
  });
  await test('surfaces the action types the founder needs', function () {
    var types = actions.map(function (a) { return a.type; });
    assert.ok(types.indexOf('contact') !== -1, 'contact immediately');
    assert.ok(types.indexOf('duplicate') !== -1 || types.indexOf('owner') !== -1, 'duplicate/owner');
  });
  await test('actions are ordered by priority (High first)', function () {
    var rank = { High: 0, Medium: 1, Low: 2 };
    for (var i = 1; i < actions.length; i++) { assert.ok(rank[actions[i - 1].priority] <= rank[actions[i].priority]); }
  });

  console.log('computeFounderInsights');
  var insights = S.computeFounderInsights(companies, validation, research);
  await test('generates between 5 and 8 data-driven insights', function () {
    assert.ok(insights.length >= 5 && insights.length <= 8, 'got ' + insights.length);
    insights.forEach(function (i) { assert.ok(i.text && i.text.length > 10); assert.ok(i.metric != null); });
    assert.ok(insights.some(function (i) { return /Opportunity Score/.test(i.text); }));
  });

  console.log('\n' + passed + ' checks passed.');
})();
