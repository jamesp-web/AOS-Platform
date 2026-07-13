/**
 * Dev tooling — builds a throwaway harness (/tmp/alip_verify.html) that renders
 * the REAL Lead Validation view with the REAL styles + engine output, so the
 * populated page can be screenshotted in headless (file-drop can't be scripted).
 * Not part of the app. Run: node scripts/buildVerify.cjs
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const style = (html.match(/<style>[\s\S]*?<\/style>/) || [''])[0];
const abs = f => 'file://' + path.join(root, f);

const raw = [
  { brandName: 'Merkle Sokrati', brandId: 'BR-1504', owner: 'Suruchi', agency: 'In-house', duplicateStatus: 'Unique' },
  { brandName: 'Reliance Retail', brandId: 'BR-7001', owner: 'Suraj', agency: 'GroupM', duplicateStatus: 'Unique' },
  { brandName: 'Reliance Retail', brandId: 'BR-7002', owner: 'Srihari', agency: 'GroupM', duplicateStatus: 'Duplicate' },
  { brandName: 'Reliance Digital', brandId: 'BR-7003', owner: 'Suraj', agency: 'Madison', duplicateStatus: 'Unique' },
  { brandName: 'Reliance Smart Bazaar', brandId: 'BR-7004', owner: 'Navin', agency: 'Madison', duplicateStatus: 'Unique' },
  { brandName: 'Reliance Jewels', brandId: 'BR-8890', owner: 'Aryan', agency: 'GroupM', duplicateStatus: 'Unique' },
  { brandName: 'Reliance Jewels Pvt Ltd', brandId: 'BR-8891', owner: 'Aryan', agency: 'Independent', duplicateStatus: 'Duplicate' },
  { brandName: 'Kalyan Jewellers', brandId: 'BR-9001', owner: 'Sagar', agency: 'Wavemaker', duplicateStatus: 'Unique' },
  { brandName: 'Kalyan Jewellers', brandId: 'BR-9001', owner: 'Sagar', agency: 'Wavemaker', duplicateStatus: 'Duplicate' },
  { brandName: 'Timezone', brandId: 'BR-5501', owner: 'Santosh Rajput', agency: 'Dentsu', duplicateStatus: 'Unique' },
  { brandName: 'Timezone', brandId: 'BR-5502', owner: 'Navin', agency: 'Dentsu', duplicateStatus: '' },
  { brandName: 'Godrej Properties', brandId: 'BR-9110', owner: 'Loukik Govande', agency: 'GroupM', duplicateStatus: 'Unique' }
];

const scripts = [
  'vendor/xlsx.full.min.js', 'src/utils/columnMapper.js', 'src/services/excelService.js',
  'src/domain/normalize.js', 'src/domain/similarity.js', 'src/domain/businessGroups.js',
  'src/domain/validationRules.js', 'src/domain/companyModel.js', 'src/domain/researchJob.js', 'src/domain/scoringEngine.js',
  'src/services/duplicateService.js', 'src/services/researchQueue.js', 'src/services/tavilyService.js',
  'src/services/researchRunner.js', 'src/prompts/analystPrompt.js', 'src/services/openaiService.js',
  'src/services/aiIntelligenceService.js', 'src/services/intelligencePipeline.js',
  'src/services/intelligenceSelectors.js', 'src/state/crmStore.js', 'src/features/shared/ui.js',
  'src/features/validation/validationController.js', 'src/features/research/researchController.js',
  'src/features/intelligence/intelligenceController.js', 'src/features/dashboard/dashboardController.js',
  'src/features/companies/companiesController.js', 'src/features/leadIntelligence/leadIntelligenceController.js',
  'src/features/founderInsights/founderInsightsController.js'
].map(f => '<script src="' + abs(f) + '"></scr' + 'ipt>').join('\n');

const seed =
  'window.navigate=function(){};' +
  'var raw=' + JSON.stringify(raw) + ';' +
  'var companies=ALIP.CompanyModel.buildCompanies(raw);' +
  'ALIP.CRMStore.setUpload({fileName:"srihari_mumbai_crm.xlsx",companies:companies,mapping:{matched:["brandName","brandId","owner","agency","duplicateStatus"],missing:[]},skipped:1});' +
  'ALIP.CRMStore.setValidation(ALIP.DuplicateService.analyze(companies));' +
  'ALIP.CRMStore.setResearch(ALIP.ResearchQueue.build(companies, ALIP.CRMStore.getValidation()));';

function page(id, title, lbl, desc, containerId) {
  return '<div class="content"><div class="page active" id="page-' + id + '">' +
    '<div class="page-lbl">' + lbl + '</div><div class="page-title">' + title + '</div>' +
    '<div class="page-desc">' + desc + '</div><div id="' + containerId + '"></div></div></div>';
}
const head = '<!doctype html><html><head><meta charset="utf8">' +
  '<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">' +
  '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></scr' + 'ipt>' +
  style + '</head><body style="display:block;background:var(--bg)">';

fs.writeFileSync('/tmp/alip_verify.html',
  head + page('validation', 'Lead Validation', 'Data Ingestion · Step 2', 'Duplicate Intelligence Engine output.', 'validation-content') +
  scripts + '<script>' + seed + 'ALIP.ValidationView.render();</scr' + 'ipt></body></html>');

fs.writeFileSync('/tmp/alip_verify_research.html',
  head + page('research', 'Research Queue', 'Data Ingestion · Step 3', 'Every unique company gets a research job with failure isolation, retries and caching.', 'research-content') +
  scripts + '<script>' + seed +
  'ALIP.ResearchView.render();' +
  'ALIP.ResearchRunner.run(ALIP.CRMStore).then(function(){ALIP.ResearchView.render();});' +
  '</scr' + 'ipt></body></html>');

fs.writeFileSync('/tmp/alip_verify_intel.html',
  head + page('intelligence', 'AI Intelligence', 'Data Ingestion · Step 4', 'OpenAI analyses; the deterministic Scoring Engine (app-owned) computes the Opportunity Score.', 'intelligence-content') +
  scripts + '<script>' + seed +
  'ALIP.ResearchRunner.run(ALIP.CRMStore).then(function(){' +
  'return ALIP.IntelligencePipeline.run(ALIP.CRMStore.getCompanies(),{ai:ALIP.AIIntelligenceService,scoring:ALIP.ScoringEngine,reScore:true,onUpdate:function(cs){ALIP.CRMStore.setCompanies(cs);}});' +
  '}).then(function(){ALIP.IntelligenceView.render();});' +
  '</scr' + 'ipt></body></html>');

fs.writeFileSync('/tmp/alip_verify_dashboard.html',
  head + page('dashboard', 'Executive Dashboard', 'Executive Intelligence · Srihari Mumbai Team', 'A live, 30-second read of the CRM — computed from real Company Intelligence.', 'dashboard-content') +
  scripts + '<script>window.navigate=function(){};' + seed +
  'ALIP.ResearchRunner.run(ALIP.CRMStore).then(function(){' +
  'return ALIP.IntelligencePipeline.run(ALIP.CRMStore.getCompanies(),{ai:ALIP.AIIntelligenceService,scoring:ALIP.ScoringEngine,reScore:true,onUpdate:function(cs){ALIP.CRMStore.setCompanies(cs);}});' +
  '}).then(function(){ALIP.DashboardView.render();});' +
  '</scr' + 'ipt></body></html>');

var fullRun = 'ALIP.ResearchRunner.run(ALIP.CRMStore).then(function(){' +
  'return ALIP.IntelligencePipeline.run(ALIP.CRMStore.getCompanies(),{ai:ALIP.AIIntelligenceService,scoring:ALIP.ScoringEngine,reScore:true,onUpdate:function(cs){ALIP.CRMStore.setCompanies(cs);}});})';

fs.writeFileSync('/tmp/alip_verify_founder.html',
  head + page('lead-insights', 'Founder Insights', 'Executive Intelligence', 'Key things the founder should know — generated from real data.', 'founder-insights-content') +
  scripts + '<script>window.navigate=function(){};' + seed + fullRun + '.then(function(){ALIP.FounderInsightsView.render();});</scr' + 'ipt></body></html>');

fs.writeFileSync('/tmp/alip_verify_detail.html',
  head + '<div class="content"><div class="page active" id="page-company-detail"><div class="back-btn">All companies</div><div id="cd-content"></div></div></div>' +
  scripts + '<script>window.navigate=function(){};window.openCompany=function(){};' + seed + fullRun +
  '.then(function(){var top=ALIP.IntelligenceSelectors.topScored(ALIP.CRMStore.getCompanies(),1)[0];ALIP.CompaniesView.renderDetail(top.id);});</scr' + 'ipt></body></html>');

console.log('wrote dashboard, founder and detail harnesses too');
