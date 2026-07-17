/**
 * ALIP · Dashboard Controller (feature — Phase 5)
 * ---------------------------------------------------------------------------
 * The Executive Intelligence Dashboard. Every widget reads from the real
 * Company Intelligence objects via IntelligenceSelectors — no mock data.
 * Executive Insights lead (the most important component), then the 14 KPIs,
 * then six charts, each titled as a business question. Renders only while its
 * page is active; destroys/recreates Chart.js instances to avoid leaks.
 *
 * Browser-only.
 */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') { return; }

  var charts = [];
  var PALETTE = ['#7C3AED', '#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#14B8A6', '#F97316'];

  // Small stroke icons (24x24) for the KPI cards — subtle, muted, single-color.
  var ICO = {
    layers: '<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>',
    check: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
    alert: '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    down: '<circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/>',
    activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>'
  };

  function api() { return root.ALIP || {}; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return api().UI.esc(s); }

  function kpi(label, value, sub, opts) {
    opts = opts || {};
    var txt = typeof value === 'string';
    return '<div class="stat-card' + (opts.tone ? ' feat' : '') + '"' + (opts.tip ? ' title="' + esc(opts.tip) + '"' : '') + '>' +
      '<div class="stat-top"><div class="stat-lbl">' + esc(label) + '</div>' +
      (opts.icon ? '<div class="stat-ic"><svg viewBox="0 0 24 24">' + opts.icon + '</svg></div>' : '') + '</div>' +
      '<div class="stat-val' + (txt ? ' txt' : '') + '">' + esc(value) + '</div>' +
      '<div class="kpi-sub">' + esc(sub) + '</div></div>';
  }
  function cluster(label, cards) {
    return '<div class="kpi-cluster"><div class="kpi-cluster-lbl">' + esc(label) + '</div><div class="exec-kpis">' + cards + '</div></div>';
  }
  // A single, obvious "do this next" prompt, driven by real pipeline state.
  function nudgeCard(icon, title, desc, page, cta) {
    return '<div class="nudge" onclick="navigate(\'' + page + '\')" role="button" tabindex="0" onkeydown="if(event.key===\'Enter\')navigate(\'' + page + '\')">' +
      '<div class="nudge-l"><div class="nudge-ic"><svg viewBox="0 0 24 24">' + icon + '</svg></div>' +
      '<div><div class="nudge-t">' + esc(title) + '</div><div class="nudge-d">' + esc(desc) + '</div></div></div>' +
      '<div class="nudge-cta">' + esc(cta) + '<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></div></div>';
  }

  var PRI = { High: 'pri-high', Medium: 'pri-med', Low: 'pri-low' };
  function actionCard(a) {
    return '<div class="action-card" onclick="openCompany(\'' + a.id + '\')">' +
      '<div class="action-top"><span class="action-pill ' + (PRI[a.priority] || 'pri-low') + '">' + esc(a.priority) + '</span>' +
        '<span class="action-type">' + esc(a.action) + '</span>' +
        '<span class="action-arrow"><svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg></span></div>' +
      '<div class="action-company">' + esc(a.company) + '</div>' +
      '<div class="action-reason">' + esc(a.reason) + '</div>' +
      '<div class="action-owner"><svg viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' + esc(a.owner) + '</div></div>';
  }

  function destroyCharts() { charts.forEach(function (c) { try { c.destroy(); } catch (e) {} }); charts = []; }

  function makeChart(id, type, data, opts) {
    var ctx = $(id); if (!ctx || !root.Chart) { return; }
    charts.push(new root.Chart(ctx, { type: type, data: data, options: opts }));
  }

  function barData(pairs) {
    return { labels: pairs.map(function (p) { return p.label; }),
      datasets: [{ data: pairs.map(function (p) { return p.value; }), backgroundColor: pairs.map(function (_, i) { return PALETTE[i % PALETTE.length]; }), borderRadius: 6, maxBarThickness: 42 }] };
  }
  function doughnutData(pairs) {
    return { labels: pairs.map(function (p) { return p.label; }),
      datasets: [{ data: pairs.map(function (p) { return p.value; }), backgroundColor: pairs.map(function (_, i) { return PALETTE[i % PALETTE.length]; }), borderWidth: 0, hoverOffset: 7, hoverBorderColor: '#fff', hoverBorderWidth: 2 }] };
  }
  // Shared tooltip skin — dark, rounded, Montserrat — reused by every chart.
  var TIP = { backgroundColor: 'rgba(15,23,42,0.96)', titleColor: '#fff', bodyColor: '#E2E8F0',
    padding: 11, cornerRadius: 10, displayColors: true, boxWidth: 9, boxHeight: 9, boxPadding: 4, usePointStyle: true,
    borderColor: 'rgba(124,58,237,0.4)', borderWidth: 1,
    titleFont: { size: 12, family: 'Montserrat', weight: '700' }, bodyFont: { size: 12, family: 'Montserrat', weight: '600' } };
  var BASE = { responsive: true, maintainAspectRatio: false, animation: { duration: 550 },
    interaction: { mode: 'nearest', intersect: false }, plugins: { legend: { display: false }, tooltip: TIP },
    scales: { x: { grid: { display: false }, border: { display: false }, ticks: { font: { size: 10, family: 'Montserrat' }, color: '#94A3B8' } },
      y: { beginAtZero: true, grid: { color: '#F1F5F9' }, border: { display: false }, ticks: { precision: 0, font: { size: 10, family: 'Montserrat' }, color: '#94A3B8' } } } };
  var DONUT = { responsive: true, maintainAspectRatio: false, cutout: '62%', animation: { duration: 550 },
    plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 11, family: 'Montserrat' }, color: '#334155', padding: 10, usePointStyle: true } },
      tooltip: Object.assign({ callbacks: { label: function (c) { var t = c.dataset.data.reduce(function (s, v) { return s + v; }, 0); var p = t ? Math.round(c.parsed / t * 100) : 0; return ' ' + c.label + ': ' + c.parsed + ' (' + p + '%)'; } } }, TIP) } };

  function chartCard(id, question, sub) {
    return '<div class="chart-card"><div class="chart-q">' + esc(question) + '</div><div class="chart-sub">' + esc(sub) + '</div>' +
      '<div class="chart-box"><canvas id="' + id + '"></canvas></div></div>';
  }

  function render() {
    var wrap = $('dashboard-content');
    if (!wrap || !api().IntelligenceSelectors) { return; }
    if (!api().UI.pageActive('page-dashboard')) { return; }   // only render when visible

    var S = api().IntelligenceSelectors, CRMStore = api().CRMStore;
    var companies = CRMStore ? CRMStore.getCompanies() : [];
    var validation = CRMStore ? CRMStore.getValidation() : null;
    var research = CRMStore ? CRMStore.getResearch() : null;

    destroyCharts();

    if (!companies.length) {
      wrap.innerHTML = '<div class="val-empty">' +
        '<div class="val-empty-ic"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>' +
        '<div class="val-empty-t">Your Executive Dashboard is empty</div>' +
        '<div class="val-empty-d">Upload Srihari\'s CRM to begin. As it flows through validation, research and scoring, this dashboard fills with live intelligence.</div>' +
        '<button class="btn-p" onclick="navigate(\'upload\')">Upload CRM</button></div>';
      return;
    }

    var brief = S.computeExecutiveBrief(companies, validation, research);
    var k = brief.kpis;
    var actions = S.computeActions(companies, validation, research);
    var ch = S.computeCharts(companies, validation, research);

    var briefHtml = brief.lines.map(function (t) { return '<div class="exec-insight"><span class="exec-dot"></span>' + esc(t) + '</div>'; }).join('');
    var focusHtml = brief.focusCompanies.length
      ? '<div class="brief-focus"><span class="brief-focus-lbl">Recommended focus this week</span><div class="brief-chips">' +
        brief.focusCompanies.map(function (c) { return '<span class="brief-chip" onclick="openCompany(\'' + c.id + '\')">' + esc(c.crm.brandName) + '<b>' + (c.ai.opportunityScore || '') + '</b></span>'; }).join('') + '</div></div>'
      : '';
    var actionsHtml = actions.length
      ? '<div class="section-head"><div class="page-lbl">Sales Action Center</div>' +
        '<div class="section-title">Immediate actions</div></div>' +
        '<div class="action-grid">' + actions.map(actionCard).join('') + '</div>'
      : '';

    var scoredCount = k.highPriority + k.priority + k.reviewRequired + k.deprioritized;
    var unscoredResearched = Math.max(0, k.researchCompleted - scoredCount);
    var nudge = '';
    if (k.researchPending > 0) {
      nudge = nudgeCard(ICO.search, k.researchPending + ' compan' + (k.researchPending === 1 ? 'y' : 'ies') + ' still need research',
        'Enrich them with live web intelligence before the Scoring Engine can rank them.', 'research', 'Research now');
    } else if (unscoredResearched > 0) {
      nudge = nudgeCard(ICO.bolt, unscoredResearched + ' researched compan' + (unscoredResearched === 1 ? 'y is' : 'ies are') + ' ready to score',
        'Run the AI analyst and the deterministic Scoring Engine to rank this pipeline.', 'intelligence', 'Analyze & score');
    }

    var kpiHtml =
      cluster('Pipeline health',
        kpi('Total Companies', k.totalCompanies, 'in this upload', { tone: true, icon: ICO.layers, tip: 'Every company in this CRM upload.' }) +
        kpi('Validated', k.validated, 'clean, non-duplicate', { icon: ICO.check, tip: 'Passed validation — not flagged as a duplicate.' }) +
        kpi('Duplicate Leads', k.duplicateLeads, 'need CRM cleanup', { icon: ICO.copy, tip: 'Flagged as an exact or fuzzy duplicate of another row.' }) +
        kpi('Owner Conflicts', k.ownerConflicts, 'resolve ownership', { icon: ICO.users, tip: 'Same company assigned to more than one sales owner.' }) +
        kpi('Agency Conflicts', k.agencyConflicts, 'confirm agency', { icon: ICO.briefcase, tip: 'Same company mapped to more than one agency.' })
      ) +
      cluster('Research & scoring',
        kpi('Research Completed', k.researchCompleted, 'enriched', { icon: ICO.search, tip: 'Companies enriched with live web research.' }) +
        kpi('Research Pending', k.researchPending, 'awaiting enrichment', { icon: ICO.clock, tip: 'Unique companies still waiting to be researched.' }) +
        kpi('High Priority', k.highPriority, 'pursue now', { icon: ICO.star, tip: 'Opportunity Score of 90 or above.' }) +
        kpi('Priority', k.priority, 'strong prospects', { icon: ICO.trend, tip: 'Opportunity Score of 75–89.' }) +
        kpi('Review Required', k.reviewRequired, 'validate first', { icon: ICO.alert, tip: 'Opportunity Score of 60–74 — verify before pursuing.' }) +
        kpi('Deprioritized', k.deprioritized, 'low fit', { icon: ICO.down, tip: 'Opportunity Score below 60.' })
      ) +
      cluster('Signals',
        kpi('Avg Opportunity Score', k.avgScore || '—', 'pipeline strength', { icon: ICO.activity, tip: 'Mean Opportunity Score across all scored companies.' }) +
        kpi('Top Industry', k.topIndustry, 'largest segment', { icon: ICO.grid, tip: 'Industry with the most companies in this upload.' }) +
        kpi('Top Sales Owner', k.topOwner, 'most accounts', { icon: ICO.user, tip: 'Sales owner responsible for the most accounts.' })
      );

    wrap.innerHTML =
      '<div class="ai-card exec-hero">' +
        '<div class="ai-ch"><div class="ai-ch-l"><div class="ai-bolt"><svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>' +
        '<div class="ai-tag">AI Executive Brief</div></div><div class="ai-refresh"><span class="rdot"></span>LIVE FROM UPLOADED CRM</div></div>' +
        '<div class="ai-main-title">Here\'s where Srihari\'s pipeline stands.</div>' +
        '<div class="exec-insights">' + briefHtml + '</div>' + focusHtml +
      '</div>' +
      nudge +
      actionsHtml +
      '<div class="section-head"><div class="page-lbl">Pipeline</div>' +
        '<div class="section-title">At a glance</div></div>' +
      kpiHtml +
      '<div class="section-head"><div class="page-lbl">Analytics</div>' +
        '<div class="section-title">Every chart answers a business question</div></div>' +
      '<div class="chart-grid">' +
        chartCard('ch-score', 'How strong is the pipeline?', 'Opportunity Score distribution') +
        chartCard('ch-rec', 'What should the team act on?', 'Recommendation distribution') +
        chartCard('ch-industry', 'Where is the opportunity concentrated?', 'Industry distribution') +
        chartCard('ch-research', 'How far along is enrichment?', 'Research status') +
        chartCard('ch-dup', 'How much CRM cleanup is needed?', 'Duplicate types') +
        chartCard('ch-owner', 'Who owns the pipeline?', 'Companies per sales owner') +
      '</div>';

    setTimeout(function () {
      makeChart('ch-score', 'bar', barData(ch.scoreDistribution), BASE);
      makeChart('ch-rec', 'doughnut', doughnutData(ch.recommendationDistribution), DONUT);
      makeChart('ch-industry', 'bar', barData(ch.industryDistribution), Object.assign({ indexAxis: 'y' }, BASE));
      makeChart('ch-research', 'doughnut', doughnutData(ch.researchStatus), DONUT);
      makeChart('ch-dup', 'bar', barData(ch.duplicateTypes), BASE);
      makeChart('ch-owner', 'bar', barData(ch.ownerDistribution), Object.assign({ indexAxis: 'y' }, BASE));
    }, 30);
  }

  function init() {
    if (!$('dashboard-content')) { return; }
    if (api().CRMStore) { api().CRMStore.subscribe(render); }
    render();
  }
  if (document.readyState !== 'loading') { init(); } else { document.addEventListener('DOMContentLoaded', init); }
  root.ALIP = root.ALIP || {};
  root.ALIP.DashboardView = { render: render };
})(typeof self !== 'undefined' ? self : this);
