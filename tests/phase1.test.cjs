/**
 * Phase 1 tests — pure parsing logic (no browser, no DOM).
 * Run:  node tests/phase1.test.cjs
 */
const assert = require('assert');
const path = require('path');
const XLSX = require('xlsx');

const ColumnMapper = require('../src/utils/columnMapper.js');
const ExcelService = require('../src/services/excelService.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { console.error('  ✗ ' + name + '\n      ' + e.message); process.exitCode = 1; }
}

console.log('ColumnMapper');
test('maps canonical headers regardless of casing/spacing', function () {
  var r = ColumnMapper.mapColumns(['Brand Name', 'BRAND ID', ' owner ', 'Agency', 'Duplicate Status']);
  assert.strictEqual(r.map.brandName, 0);
  assert.strictEqual(r.map.brandId, 1);
  assert.strictEqual(r.map.owner, 2);
  assert.strictEqual(r.map.agency, 3);
  assert.strictEqual(r.map.duplicateStatus, 4);
  assert.strictEqual(r.missing.length, 0);
});
test('matches header aliases (Company / POC / Dup)', function () {
  var r = ColumnMapper.mapColumns(['Company', 'ID', 'POC', 'Media Agency', 'Dup']);
  assert.strictEqual(r.map.brandName, 0);
  assert.strictEqual(r.map.owner, 2);
  assert.strictEqual(r.matched.length, 5);
});
test('reports missing columns instead of guessing', function () {
  var r = ColumnMapper.mapColumns(['Brand', 'Owner']);
  assert.deepStrictEqual(r.missing.sort(), ['agency', 'brandId', 'duplicateStatus']);
});

console.log('ExcelService.extractCompanies (pure)');
test('extracts the 5 canonical fields', function () {
  var rows = [
    ['Brand Name', 'Brand ID', 'Owner', 'Agency', 'Duplicate Status'],
    ['Merkle Sokrati', 'BR-1', 'Suruchi', 'In-house', 'Unique']
  ];
  var out = ExcelService.extractCompanies(rows);
  assert.strictEqual(out.companies.length, 1);
  assert.deepStrictEqual(out.companies[0].brandName, 'Merkle Sokrati');
  assert.deepStrictEqual(out.companies[0].brandId, 'BR-1');
  assert.deepStrictEqual(out.companies[0].duplicateStatus, 'Unique');
});
test('skips rows with no Brand Name (never fabricates identity)', function () {
  var rows = [
    ['Brand Name', 'Owner'],
    ['', 'Ghost'],
    ['Real Co', 'Suruchi']
  ];
  var out = ExcelService.extractCompanies(rows);
  assert.strictEqual(out.companies.length, 1);
  assert.strictEqual(out.skipped, 1);
});
test('errors clearly when Brand Name column is absent', function () {
  var out = ExcelService.extractCompanies([['Foo', 'Bar'], ['1', '2']]);
  assert.strictEqual(out.companies.length, 0);
  assert.ok(/Brand Name/.test(out.error));
});
test('handles an empty sheet', function () {
  var out = ExcelService.extractCompanies([]);
  assert.strictEqual(out.companies.length, 0);
  assert.ok(out.error);
});

console.log('End-to-end: read the generated .xlsx via SheetJS');
test('parses sample workbook to the expected companies', function () {
  var file = path.join(__dirname, '..', 'sample_data', 'srihari_mumbai_crm.xlsx');
  var wb = XLSX.readFile(file);
  var sheet = wb.Sheets[wb.SheetNames[0]];
  var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
  var out = ExcelService.extractCompanies(rows);
  assert.strictEqual(out.mapping.missing.length, 0, 'all 5 columns should map');
  assert.strictEqual(out.skipped, 1, 'one blank-name row should be skipped');
  assert.strictEqual(out.companies.length, 23, 'should extract 23 named companies');
  assert.ok(out.companies.some(function (c) { return c.brandName === 'Timezone'; }));
});

console.log('\n' + passed + ' checks passed.');
