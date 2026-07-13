/**
 * Phase 8 — exercises the real frontend apiClient against a running backend.
 * Start backend first: cd backend && ./.venv/bin/uvicorn app.main:app --port 8000
 * Run: node scripts/test-apiclient.cjs
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ApiClient = require('../src/services/apiClient.js');

let passed = 0;
function ok(name, cond) { if (!cond) { console.error('  ✗ ' + name); process.exit(1); } passed++; console.log('  ✓ ' + name); }

(async function () {
  ok('backend health reachable', await ApiClient.health());

  const buf = fs.readFileSync(path.join(__dirname, '..', 'sample_data', 'srihari_mumbai_crm.xlsx'));
  const up = await ApiClient.upload(new Blob([buf]), 'srihari_mumbai_crm.xlsx');
  ok('apiClient.upload → session + 23 extracted', up.session_id && up.extracted === 23);
  const sid = up.session_id;

  const state = await ApiClient.session(sid);
  ok('apiClient.session hydrate payload has full companies', state.companies.length === 23 && !!state.validation && !!state.research);

  await ApiClient.startResearch(sid);
  const rs = await ApiClient.researchStatus(sid);
  // researched = completed + cached (a prior run may have populated the server cache)
  ok('research: 19 researched (completed+cached) / 4 skipped / 0 pending via API',
     (rs.stats.completed + rs.stats.cached) === 19 && rs.stats.skipped === 4 && rs.stats.pending === 0);

  await ApiClient.analyze(sid);
  const after = await ApiClient.session(sid);
  ok('companies are scored after analyze', after.companies.some(c => c.ai && c.ai.score && typeof c.ai.opportunityScore === 'number'));

  const dash = await ApiClient.dashboard(sid);
  ok('dashboard KPIs + brief + actions + 6 charts', dash.kpis.totalCompanies === 23 && dash.executive_brief.lines.length >= 4 && Object.keys(dash.charts).length === 6);

  const fi = await ApiClient.founderInsights(sid);
  ok('founder-insights 5–8', fi.insights.length >= 5 && fi.insights.length <= 8);

  const blob = await ApiClient.exportBlob(sid);
  ok('export returns a non-empty xlsx blob', blob && blob.size > 1000);

  console.log('\n' + passed + ' apiClient↔backend checks passed.');
})().catch(e => { console.error(e); process.exit(1); });
