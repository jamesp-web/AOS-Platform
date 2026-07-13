/**
 * Phase 3 tests — Research Queue + Tavily runner (pure, no browser, no network).
 * Run:  node tests/phase3.test.cjs
 */
const assert = require('assert');
const path = require('path');
const XLSX = require('xlsx');

const ExcelService = require('../src/services/excelService.js');
const CompanyModel = require('../src/domain/companyModel.js');
const Normalize = require('../src/domain/normalize.js');
const DuplicateService = require('../src/services/duplicateService.js');
const ResearchQueue = require('../src/services/researchQueue.js');
const ResearchJob = require('../src/domain/researchJob.js');
const ResearchRunner = require('../src/services/researchRunner.js');
const TavilyService = require('../src/services/tavilyService.js');

let passed = 0;
function test(name, fn) {
  return Promise.resolve().then(fn).then(function () { passed++; console.log('  ✓ ' + name); },
    function (e) { console.error('  ✗ ' + name + '\n      ' + (e && e.message)); process.exitCode = 1; });
}

function sampleCompanies() {
  var wb = XLSX.readFile(path.join(__dirname, '..', 'sample_data', 'srihari_mumbai_crm.xlsx'));
  var rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false, defval: '' });
  return CompanyModel.buildCompanies(ExcelService.extractCompanies(rows).companies);
}
function stubProvider() {
  return { calls: [], research: function (c) { this.calls.push(c.id); return Promise.resolve({ provider: 'test', sources: [{ title: c.crm.brandName }] }); } };
}

(async function () {
  console.log('ResearchQueue.build');
  const companies = sampleCompanies();
  const report = DuplicateService.analyze(companies);
  const queue = ResearchQueue.build(companies, report);

  await test('creates exactly one job per company', function () {
    assert.strictEqual(queue.jobs.length, companies.length);
  });
  await test('every job has the required fields', function () {
    queue.jobs.forEach(function (j) {
      ['companyId', 'companyName', 'status', 'createdAt', 'startedAt', 'completedAt', 'retryCount', 'lastError', 'researchVersion']
        .forEach(function (k) { assert.ok(k in j, 'missing ' + k); });
    });
  });
  await test('unique companies are Pending, duplicate rows are Skipped', function () {
    var s = ResearchQueue.stats(queue.jobs);
    // 4 exact/fuzzy clusters (Kalyan, Timezone, Reliance Retail, Reliance Jewels) → 4 skipped
    assert.strictEqual(s.skipped, 4, 'expected 4 skipped duplicates, got ' + s.skipped);
    assert.strictEqual(s.pending, companies.length - 4);
  });
  await test('skipped jobs explain which company they duplicate', function () {
    var skipped = queue.jobs.filter(function (j) { return j.status === 'skipped'; });
    assert.ok(skipped.length && skipped.every(function (j) { return /Duplicate of/.test(j.lastError || ''); }));
  });

  console.log('ResearchRunner.processJobs');
  await test('researches all pending jobs → Completed, storing results in company.ai.research', async function () {
    var cs = sampleCompanies();
    var q = ResearchQueue.build(cs, DuplicateService.analyze(cs));
    var prov = stubProvider();
    await ResearchRunner.processJobs(cs, q.jobs, prov);
    var s = ResearchQueue.stats(q.jobs);
    assert.strictEqual(s.pending, 0);
    assert.strictEqual(s.completed, cs.length - s.skipped);
    var done = cs.find(function (c) { return c.ai.researchStatus === 'done'; });
    assert.ok(done && done.ai.research && done.ai.research.provider === 'test');
  });
  await test('never researches skipped duplicates', async function () {
    var cs = sampleCompanies();
    var q = ResearchQueue.build(cs, DuplicateService.analyze(cs));
    var prov = stubProvider();
    await ResearchRunner.processJobs(cs, q.jobs, prov);
    var skippedIds = q.jobs.filter(function (j) { return j.status === 'skipped'; }).map(function (j) { return j.companyId; });
    skippedIds.forEach(function (id) { assert.ok(prov.calls.indexOf(id) === -1, 'skipped id was researched: ' + id); });
  });

  console.log('Failure isolation');
  await test('one Tavily failure fails only that company; the rest complete', async function () {
    var cs = CompanyModel.buildCompanies([
      { brandName: 'Alpha', brandId: 'A1' }, { brandName: 'Bravo', brandId: 'B1' }, { brandName: 'Charlie', brandId: 'C1' }
    ]);
    var q = ResearchQueue.build(cs, DuplicateService.analyze(cs));
    var failing = { research: function (c) { return c.crm.brandName === 'Bravo' ? Promise.reject(new Error('Tavily 500')) : Promise.resolve({ provider: 'test' }); } };
    await ResearchRunner.processJobs(cs, q.jobs, failing);
    var s = ResearchQueue.stats(q.jobs);
    assert.strictEqual(s.completed, 2);
    assert.strictEqual(s.failed, 1);
    var bravo = q.jobs.find(function (j) { return j.companyName === 'Bravo'; });
    assert.strictEqual(bravo.status, 'failed');
    assert.strictEqual(bravo.retryCount, 1);
    assert.ok(/Tavily 500/.test(bravo.lastError));
  });
  await test('resetFailed re-queues failed jobs for retry', function () {
    var cs = CompanyModel.buildCompanies([{ brandName: 'Bravo', brandId: 'B1' }]);
    var jobs = [ResearchJob.toFailed(ResearchJob.create(cs[0]), new Error('x'))];
    var reset = ResearchQueue.resetFailed(jobs);
    assert.strictEqual(reset[0].status, 'pending');
  });

  console.log('Only-pending & caching');
  await test('does not re-research jobs that are already Completed', async function () {
    var cs = CompanyModel.buildCompanies([{ brandName: 'Alpha', brandId: 'A1' }, { brandName: 'Bravo', brandId: 'B1' }]);
    var q = ResearchQueue.build(cs, DuplicateService.analyze(cs));
    // pre-complete Alpha
    q.jobs[0] = ResearchJob.toCompleted(q.jobs[0]);
    var prov = stubProvider();
    await ResearchRunner.processJobs(cs, q.jobs, prov);
    assert.ok(prov.calls.indexOf(cs[0].id) === -1, 'completed job must not be researched again');
    assert.ok(prov.calls.indexOf(cs[1].id) !== -1, 'pending job should be researched');
  });
  await test('fresh cache hit → Cached, reuses result, no provider call', async function () {
    var cs = CompanyModel.buildCompanies([{ brandName: 'Alpha', brandId: 'A1' }]);
    var q = ResearchQueue.build(cs, DuplicateService.analyze(cs));
    var key = Normalize.name('Alpha').clean;
    var cache = (function () { var m = {}; m[key] = { result: { provider: 'cached', sources: [] }, fetchedAt: Date.now() }; return { get: function (k) { return m[k]; }, set: function (k, v) { m[k] = v; } }; })();
    var prov = stubProvider();
    await ResearchRunner.processJobs(cs, q.jobs, prov, { cache: cache });
    assert.strictEqual(q.jobs[0].status, 'cached');
    assert.strictEqual(prov.calls.length, 0, 'provider must not be called on cache hit');
    assert.strictEqual(cs[0].ai.researchStatus, 'cached');
    assert.strictEqual(cs[0].ai.research.provider, 'cached');
  });

  console.log('TavilyService');
  await test('offline stub returns a normalised research payload', async function () {
    var cs = CompanyModel.buildCompanies([{ brandName: 'Reliance Retail', brandId: 'R1' }]);
    var r = await TavilyService.stubResearch(cs[0]);
    assert.ok(r.query && /Reliance Retail/.test(r.query));
    assert.ok(Array.isArray(r.sources) && r.sources.length > 0);
    assert.strictEqual(r.provider, 'stub');
  });

  console.log('\n' + passed + ' checks passed.');
})();
