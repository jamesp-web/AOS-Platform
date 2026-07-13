/**
 * Phase 2 tests — Lead Validation Engine (pure, no browser).
 * Run:  node tests/phase2.test.cjs
 */
const assert = require('assert');
const path = require('path');
const XLSX = require('xlsx');

const ExcelService = require('../src/services/excelService.js');
const CompanyModel = require('../src/domain/companyModel.js');
const Normalize = require('../src/domain/normalize.js');
const Similarity = require('../src/domain/similarity.js');
const BusinessGroups = require('../src/domain/businessGroups.js');
const DuplicateService = require('../src/services/duplicateService.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n      ' + e.message); process.exitCode = 1; }
}

console.log('CompanyModel (Phase 1 improvements)');
test('assigns a unique internal id to every company (even duplicate brandIds)', function () {
  var companies = CompanyModel.buildCompanies([
    { brandName: 'A', brandId: 'X' }, { brandName: 'B', brandId: 'X' }, { brandName: 'C' }
  ]);
  var ids = companies.map(function (c) { return c.id; });
  assert.strictEqual(new Set(ids).size, 3, 'ids must be unique');
  assert.ok(companies[0].id !== companies[1].id);
});
test('pre-allocates empty AI enrichment schema (unpopulated)', function () {
  var c = CompanyModel.createCompany({ brandName: 'A' }, 0);
  var ai = c.ai;
  ['industry', 'financialHealth', 'advertisingActivity', 'growthSignals', 'expansionSignals',
   'aiSummary', 'opportunityScore', 'recommendation', 'reason'].forEach(function (k) {
    assert.strictEqual(ai[k], null, k + ' should be null');
  });
  assert.strictEqual(ai.researchStatus, 'pending');
  assert.strictEqual(c.crm.brandName, 'A');
});

console.log('Normalize');
test('strips legal suffixes for fuzzy comparison', function () {
  assert.strictEqual(Normalize.name('Reliance Retail Ltd').clean, 'reliance retail');
  assert.strictEqual(Normalize.name('Reliance Retail Limited').clean, 'reliance retail');
});
test('treats in-house agency variants alike', function () {
  assert.strictEqual(Normalize.agency('In-House'), Normalize.agency('in house'));
});

console.log('Similarity');
test('scores Ltd/Limited variants as near-identical', function () {
  assert.ok(Similarity.score('Reliance Retail', 'Reliance Retail Ltd') >= 0.99);
});
test('scores unrelated names low', function () {
  assert.ok(Similarity.score('Reliance Retail', 'Kalyan Jewellers') < 0.4);
});

console.log('BusinessGroups');
test('maps Reliance sub-brands to one parent', function () {
  var g = BusinessGroups.sameGroup('Reliance Retail', 'Reliance Digital');
  assert.ok(g && g.parent === 'Reliance');
});

console.log('DuplicateService.analyze (end-to-end on sample workbook)');
var report = (function () {
  var wb = XLSX.readFile(path.join(__dirname, '..', 'sample_data', 'srihari_mumbai_crm.xlsx'));
  var sheet = wb.Sheets[wb.SheetNames[0]];
  var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  var extracted = ExcelService.extractCompanies(rows);
  var companies = CompanyModel.buildCompanies(extracted.companies);
  return DuplicateService.analyze(companies);
})();

test('detects at least one of every duplicate type', function () {
  var s = report.summary;
  assert.ok(s.exact >= 1, 'exact');
  assert.ok(s.fuzzy >= 1, 'fuzzy');
  assert.ok(s.business >= 1, 'business');
  assert.ok(s.ownerConflicts >= 1, 'owner conflicts');
  assert.ok(s.agencyConflicts >= 1, 'agency conflicts');
});
test('summary total matches company count', function () {
  assert.strictEqual(report.summary.totalCompanies, 23);
});
test('every detection has type, confidence, reason and a recommended action', function () {
  assert.ok(report.duplicates.length > 0);
  report.duplicates.forEach(function (d) {
    assert.ok(d.type && d.typeLabel, 'type');
    assert.ok(typeof d.confidence === 'number' && d.confidence > 0 && d.confidence <= 1, 'confidence');
    assert.ok(d.reason && d.reason.length > 10, 'reason');
    assert.ok(['Merge', 'Review', 'Keep Separate'].indexOf(d.recommendedAction) !== -1, 'action');
    assert.strictEqual(d.members.length, 2);
  });
});
test('exact duplicate (Kalyan, same Brand ID) is recommended Merge', function () {
  var exact = report.duplicates.filter(function (d) { return d.type === 'exact'; });
  assert.ok(exact.length >= 1);
  assert.strictEqual(exact[0].recommendedAction, 'Merge');
});
test('owner conflict flagged for Reliance Retail (Suraj vs Srihari)', function () {
  var oc = report.duplicates.filter(function (d) { return d.type === 'owner-conflict'; });
  assert.ok(oc.some(function (d) {
    return d.members.some(function (m) { return /Reliance Retail/i.test(m.name); });
  }), 'expected a Reliance Retail owner conflict');
});
test('agency conflict flagged for Reliance Jewels (GroupM vs Independent)', function () {
  var ac = report.duplicates.filter(function (d) { return d.type === 'agency-conflict'; });
  assert.ok(ac.some(function (d) {
    return d.members.some(function (m) { return /Reliance Jewels/i.test(m.name); });
  }), 'expected a Reliance Jewels agency conflict');
});
test('builds a Reliance parent group with multiple members', function () {
  var reliance = report.groups.filter(function (g) { return g.parent === 'Reliance'; })[0];
  assert.ok(reliance, 'Reliance group should exist');
  assert.ok(reliance.memberIds.length >= 4, 'Reliance group should have >= 4 members');
});

console.log('\n' + passed + ' checks passed.');
console.log('Report summary:', JSON.stringify(report.summary));
