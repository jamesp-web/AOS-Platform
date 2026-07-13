/**
 * Dev tooling — generates a realistic Srihari · Mumbai CRM export (.xlsx)
 * so Phase 1 (and later phases) can be exercised end to end.
 *
 * Run:  node scripts/make-sample.cjs
 * Out:  sample_data/srihari_mumbai_crm.xlsx
 *
 * Intentionally includes duplicate/owner-conflict/fuzzy rows and a blank-name
 * row so downstream phases (dedup, validation) have something real to catch.
 */
const XLSX = require('xlsx');
const path = require('path');

const HEADERS = ['Brand Name', 'Brand ID', 'Owner', 'Agency', 'Duplicate Status'];

const ROWS = [
  ['Merkle Sokrati',            'BR-1504', 'Suruchi',           'In-house',    'Unique'],
  ['Bharti Axa Life Insurance', 'BR-2087', 'Namita',            'Madison',     'Unique'],
  ['Araiya By Aza',             'BR-3311', 'Ganesh Deosarkar',  'Independent', 'Unique'],    // Aza group
  ['Aza Fashion Clothing',      'BR-3312', 'Ganesh Deosarkar',  'Independent', 'Unique'],    // Aza group (business dup)
  ['JioStar',                   'BR-1290', 'Navin',             'GroupM',      'Unique'],
  ['Malabar Gold & Diamonds',   'BR-4410', 'Sagar',             'Wavemaker',   'Unique'],
  ['Timezone',                  'BR-5501', 'Santosh Rajput',    'Dentsu',      'Unique'],
  ['Timezone',                  'BR-5502', 'Navin',             'Dentsu',      ''],           // fuzzy(same name) + owner conflict
  ['SBI Home Loan',             'BR-6620', 'Anushka',           'GroupM',      'Unique'],
  ['Dr Agarwals Eye Hospital',  'BR-7788', 'Suruchi',           'Madison',     'Unique'],
  ['Reliance Retail',           'BR-7001', 'Suraj',             'GroupM',      'Unique'],     // Reliance group
  ['Reliance Retail',           'BR-7002', 'Srihari',           'GroupM',      'Duplicate'],  // fuzzy + owner conflict
  ['Reliance Digital',          'BR-7003', 'Suraj',             'Madison',     'Unique'],     // Reliance group (business dup)
  ['Reliance Smart Bazaar',     'BR-7004', 'Navin',             'Madison',     'Unique'],     // Reliance group (business dup)
  ['Reliance Jewels',           'BR-8890', 'Aryan',             'GroupM',      'Unique'],
  ['Reliance Jewels Pvt Ltd',   'BR-8891', 'Aryan',             'Independent', 'Duplicate'],  // fuzzy + agency conflict
  ['Kalyan Jewellers',          'BR-9001', 'Sagar',             'Wavemaker',   'Unique'],
  ['Kalyan Jewellers',          'BR-9001', 'Sagar',             'Wavemaker',   'Duplicate'],  // EXACT (same name + same Brand ID)
  ['Godrej Properties',         'BR-9110', 'Loukik Govande',    'GroupM',      'Unique'],     // Godrej group
  ['PUMA India',                'BR-9245', 'Suruchi',           'GroupM',      'Unique'],
  ['Cashurdrive',               'BR-9302', 'Aryan',             'Independent', 'Unique'],
  ['Mindseed Preschool',        'BR-9410', 'Sangram Deshmukh',  '',            'Unique'],
  ['Phoenix Marketcity',        'BR-9500', 'Gautam',            'Wavemaker',   'Unique'],
  ['',                          'BR-9999', 'Unassigned',        '',            '']            // blank name -> must be skipped
];

const aoa = [HEADERS].concat(ROWS);
const ws = XLSX.utils.aoa_to_sheet(aoa);
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, 'Srihari Mumbai');

const out = path.join(__dirname, '..', 'sample_data', 'srihari_mumbai_crm.xlsx');
XLSX.writeFile(wb, out);
console.log('Wrote ' + out + '  (' + ROWS.length + ' data rows, 1 intentional blank-name row)');
