/**
 * ALIP · Founder Insights Controller (feature — Phase 5.5)
 * ---------------------------------------------------------------------------
 * A dedicated analytical view for the founder: 5–8 auto-generated business
 * insights plus the current score leaders — all from real Company Intelligence.
 * Browser-only.
 */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') { return; }

  function api() { return root.ALIP || {}; }
  function $(id) { return document.getElementById(id); }
  function U() { return api().UI; }

  function render() {
    var wrap = $('founder-insights-content'); if (!wrap || !U()) { return; }
    if (!api().UI.pageActive('page-lead-insights')) { return; }
    var S = api().IntelligenceSelectors, CRMStore = api().CRMStore, ui = U();
    var companies = CRMStore ? CRMStore.getCompanies() : [];
    var validation = CRMStore ? CRMStore.getValidation() : null;
    var research = CRMStore ? CRMStore.getResearch() : null;

    if (!companies.length) {
      wrap.innerHTML = '<div class="val-empty"><div class="val-empty-ic"><svg viewBox="0 0 24 24"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></svg></div>' +
        '<div class="val-empty-t">No insights yet</div><div class="val-empty-d">Upload and enrich a CRM — the founder\'s key insights are generated automatically from the data.</div>' +
        '<button class="btn-p" onclick="navigate(\'upload\')">Upload CRM</button></div>';
      return;
    }

    var insights = S.computeFounderInsights(companies, validation, research);
    var leaders = S.topScored(companies, 8);

    var insightCards = insights.length
      ? insights.map(function (i, n) {
          return '<div class="fi-card"><div class="fi-num">' + String(n + 1).padStart(2, '0') + '</div>' +
            '<div class="fi-body"><div class="fi-metric">' + ui.esc(i.metric) + '</div><div class="fi-text">' + ui.esc(i.text) + '</div></div></div>';
        }).join('')
      : '<div class="val-clean">Run research and scoring to generate founder insights.</div>';

    var leaderRows = leaders.map(function (c) {
      return '<div class="fi-leader" onclick="openCompany(\'' + c.id + '\')">' +
        '<div class="fi-leader-av" style="' + ui.avatarStyle(c.crm.brandName) + '">' + ui.esc(ui.initials(c.crm.brandName)) + '</div>' +
        '<div class="fi-leader-info"><div class="fi-leader-name">' + ui.esc(c.crm.brandName) + '</div>' +
        '<div class="fi-leader-meta">' + ui.esc(S.industryOf(c) || '—') + ' · ' + ui.esc(c.crm.owner || '—') + '</div></div>' +
        ui.ring(c.ai.opportunityScore, 34) + '</div>';
    }).join('') || '<div style="padding:20px;color:var(--t3);font-size:13px">No scored companies yet.</div>';

    wrap.innerHTML =
      '<div class="fi-layout"><div>' +
        '<div class="page-lbl" style="margin-top:24px">Auto-generated · ' + insights.length + ' insights</div>' +
        '<div class="fi-grid">' + insightCards + '</div>' +
      '</div><div>' +
        '<div class="opp-panel"><div class="sec-lbl">Score Leaders</div><div class="sec-title" style="margin:2px 0 6px">Highest Opportunity Scores</div>' + leaderRows + '</div>' +
      '</div></div>';
  }

  function init() {
    if (!$('founder-insights-content')) { return; }
    if (api().CRMStore) { api().CRMStore.subscribe(render); }
    render();
  }
  if (document.readyState !== 'loading') { init(); } else { document.addEventListener('DOMContentLoaded', init); }
  root.ALIP = root.ALIP || {};
  root.ALIP.FounderInsightsView = { render: render };
})(typeof self !== 'undefined' ? self : this);
