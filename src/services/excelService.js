/**
 * ALIP · ExcelService (service)
 * ---------------------------------------------------------------------------
 * Reads an uploaded .xlsx and extracts canonical CRM companies.
 *
 *   parseFile(file)          browser wrapper: File -> SheetJS workbook -> rows
 *   extractCompanies(rows)   PURE core: array-of-arrays -> company records
 *
 * The pure core has no dependency on the DOM or SheetJS, so it is fully unit
 * testable in Node. Identity is never fabricated: a row without a Brand Name
 * is skipped, not invented.
 *
 * Mirrors future backend service: backend/services/excel_service.py
 */
(function (root) {
  'use strict';

  var ColumnMapper = (typeof module !== 'undefined' && module.exports)
    ? require('../utils/columnMapper.js')
    : (root.ALIP && root.ALIP.ColumnMapper);

  var CANONICAL_FIELDS = ['brandName', 'brandId', 'owner', 'agency', 'duplicateStatus'];

  function cell(value) {
    return value == null ? '' : String(value).trim();
  }

  /**
   * Locate the header row. Real CRM exports often have title/blank rows above
   * the headers, so we scan the first rows and pick the one that maps the most
   * canonical fields (and must include Brand Name).
   * @returns {{ index:number, matched:number, mapping:Object }}
   */
  function findHeaderRow(rows) {
    var best = { index: -1, matched: -1, mapping: null };
    var limit = Math.min(rows.length, 15);
    for (var r = 0; r < limit; r++) {
      var mapping = ColumnMapper.mapColumns(rows[r]);
      if (mapping.map.brandName >= 0 && mapping.matched.length > best.matched) {
        best = { index: r, matched: mapping.matched.length, mapping: mapping };
      }
    }
    return best;
  }

  /**
   * Extract canonical CRM companies from a sheet represented as array-of-arrays.
   * @param {Array<Array<*>>} rows  rows[0] = header row.
   * @returns {{ companies: Object[], mapping: Object, skipped: number, error?: string }}
   */
  function extractCompanies(rows) {
    if (!rows || !rows.length) {
      return {
        companies: [],
        mapping: { map: {}, matched: [], missing: CANONICAL_FIELDS.slice() },
        skipped: 0,
        error: 'The sheet is empty.'
      };
    }

    var header = findHeaderRow(rows);
    if (header.index < 0) {
      var preview = (rows[0] || []).map(function (h) { return '"' + cell(h) + '"'; }).join(', ');
      return {
        companies: [],
        mapping: header.mapping || ColumnMapper.mapColumns(rows[0] || []),
        skipped: 0,
        error: 'Could not find a "Brand Name" column in the first rows. Headers seen: ' + preview
      };
    }

    var mapping = header.mapping;
    var map = mapping.map;
    var companies = [];
    var skipped = 0;

    for (var r = header.index + 1; r < rows.length; r++) {
      var row = rows[r];
      if (!row || !row.length) { continue; }

      var brandName = cell(row[map.brandName]);
      if (!brandName) { skipped++; continue; }   // never fabricate identity

      companies.push({
        rowIndex: r + 1,
        brandName: brandName,
        brandId:         map.brandId >= 0         ? cell(row[map.brandId])         : '',
        owner:           map.owner >= 0           ? cell(row[map.owner])           : '',
        agency:          map.agency >= 0          ? cell(row[map.agency])          : '',
        duplicateStatus: map.duplicateStatus >= 0 ? cell(row[map.duplicateStatus]) : ''
      });
    }

    return { companies: companies, mapping: mapping, skipped: skipped };
  }

  /**
   * Browser entry point. Reads a File and returns the extraction result.
   * @param {File} file
   * @returns {Promise<Object>}
   */
  function parseFile(file) {
    return new Promise(function (resolve, reject) {
      if (!file) { return reject(new Error('No file provided.')); }
      if (!/\.xlsx$/i.test(file.name)) { return reject(new Error('Please upload a .xlsx file.')); }

      var XLSX = root.XLSX;
      if (!XLSX) { return reject(new Error('Excel library (SheetJS) is not loaded.')); }

      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Could not read the file.')); };
      reader.onload = function (e) {
        try {
          var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' });
          var sheet = wb.Sheets[wb.SheetNames[0]];
          var rows = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
          var result = extractCompanies(rows);
          result.fileName = file.name;
          result.sheetName = wb.SheetNames[0];
          resolve(result);
        } catch (err) {
          reject(new Error('Failed to parse workbook: ' + err.message));
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }

  var ExcelService = {
    CANONICAL_FIELDS: CANONICAL_FIELDS,
    extractCompanies: extractCompanies,
    parseFile: parseFile
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ExcelService;                 // Node (tests)
  } else {
    root.ALIP = root.ALIP || {};
    root.ALIP.ExcelService = ExcelService;         // Browser
  }
})(typeof self !== 'undefined' ? self : this);
