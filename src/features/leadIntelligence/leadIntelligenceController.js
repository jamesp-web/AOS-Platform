/**
 * ALIP · Lead Intelligence Controller (feature — Phase 5)
 * ---------------------------------------------------------------------------
 * A ranked, AI-enriched view of every uploaded company with filtering across
 * Opportunity Score, Industry, Recommendation, Research Status, Validation
 * Status and Owner. Reads only from real Company Intelligence. Browser-only.
 */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') { return; }

  var f = { score: 'All', industry: 'All', recommendation: 'All', research: 'All', validation: 'All', owner: 'All', q: '' };

  function api() { return root.ALIP || {}; }
  function $(id) { return document.getElementById(id); }
  function U() { return api().UI; }
  function state() { var s = api().CRMStore; return { companies: s ? s.getCompanies() : [], validation: s ? s.getValidation() : null, research: s ? s.getResearch() : null }; }
  function uniq(a) { return a.filter(function (v, i) { return v && a.indexOf(v) === i; }); }

  function scoreBucket(s) { if (s == null) return 'Unscored'; if (s >= 90) return '90+'; if (s >= 75) return '75-89'; if (s >= 60) return '60-74'; return '<60'; }

  function sel(id, label, options, value) {
    return '<label class="li-sel"><span>' + label + '</span><select id="' + id + '">' +
      options.map(function (o) { return '<option' + (o === value ? ' selected' : '') + '>' + U().esc(o) + '</option>'; }).join('') +
      '</select></label>';
  }

  function render() {
    var wrap = $('leads-content'); if (!wrap || !U()) { return; }
    if (!api().UI.pageActive('page-leads')) { return; }
    var st = state(), S = api().IntelligenceSelectors, ui = U();

    if (!st.companies.length) {
      wrap.innerHTML = '<div class="val-empty"><div class="val-empty-ic"><svg viewBox="0 0 24 24"><path d="M11.5 3.5l1.9 4.2 4.6.4-3.5 3 1.1 4.5-4-2.4-4 2.4 1.1-4.5-3.5-3 4.6-.4z"/></svg></div>' +
        '<div class="val-empty-t">No leads yet</div><div class="val-empty-d">Upload a CRM and run the pipeline — enriched, scored leads appear here.</div>' +
        '<button class="btn-p" onclick="navigate(\'upload\')">Upload CRM</button></div>';
      return;
    }

    var views = st.companies.map(function (c) { return S.companyView(c, st.validation, st.research); });
    var industries = ['All'].concat(uniq(views.map(function (v) { return v.industry; })));
    var owners = ['All'].concat(uniq(views.map(function (v) { return v.crm.owner; })));

    var list = views.filter(function (v) {
      if (f.score !== 'All' && scoreBucket(v.score) !== f.score) return false;
      if (f.industry !== 'All' && v.industry !== f.industry) return false;
      if (f.recommendation !== 'All' && v.recommendation !== f.recommendation) return false;
      if (f.research !== 'All' && (v.researchStatus || '').toLowerCase() !== f.research.toLowerCase()) return false;
      if (f.validation !== 'All' && v.validationStatus !== f.validation) return false;
      if (f.owner !== 'All' && v.crm.owner !== f.owner) return false;
      if (f.q && (v.crm.brandName + ' ' + v.industry + ' ' + (v.crm.owner || '')).toLowerCase().indexOf(f.q.toLowerCase()) === -1) return false;
      return true;
    }).sort(function (a, b) { return (b.score || -1) - (a.score || -1); });

    wrap.innerHTML =
      '<div class="li-filters">' +
        sel('li-f-score', 'Opportunity Score', ['All', '90+', '75-89', '60-74', '<60', 'Unscored'], f.score) +
        sel('li-f-rec', 'Recommendation', ['All', 'High Priority', 'Priority', 'Review', 'Deprioritize'], f.recommendation) +
        sel('li-f-research', 'Research Status', ['All', 'Completed', 'Cached', 'Pending', 'Researching', 'Failed', 'Skipped'], f.research) +
        sel('li-f-val', 'Validation', ['All', 'Unique', 'Duplicate', 'Conflict', 'Group'], f.validation) +
        sel('li-f-ind', 'Industry', industries, f.industry) +
        sel('li-f-owner', 'Owner', owners, f.owner) +
      '</div>' +
      '<div class="tbl-bar"><div class="tbl-search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '<input type="text" id="li-q" placeholder="Search brand, industry, owner…" value="' + ui.esc(f.q) + '"></div>' +
        '<div class="showing">Showing <b>' + list.length + '</b> of ' + views.length + '</div></div>' +
      '<div class="leads-tbl"><div class="tbl-head li-cols"><div>Brand</div><div>Owner</div><div>Industry</div><div>Score</div><div>Recommendation</div><div>Research</div><div>Validation</div></div>' +
        (list.length ? list.map(row).join('') : '<div style="padding:40px;text-align:center;color:var(--t3)">No leads match these filters.</div>') +
      '</div>';

    [['li-f-score', 'score'], ['li-f-rec', 'recommendation'], ['li-f-research', 'research'], ['li-f-val', 'validation'], ['li-f-ind', 'industry'], ['li-f-owner', 'owner']].forEach(function (p) {
      var el = $(p[0]); if (el) { el.addEventListener('change', function () { f[p[1]] = el.value; render(); }); }
    });
    var q = $('li-q'); if (q) { q.addEventListener('input', function () { f.q = q.value; render(); var n = $('li-q'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); }
  }

  function row(v) {
    var ui = U();
    var sid = api().CRMStore && api().CRMStore.getSessionId();
    var canEnrich = !v.score && v.validationStatus !== 'Duplicate' && !!sid;
    var recCell = v.score ? ui.recPill(v.recommendation)
      : (canEnrich ? '<button class="li-enrich" onclick="event.stopPropagation();ALIP.UI.enrichRow(this,\'' + v.id + '\')"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Research</button>'
        : ui.recPill(v.recommendation));
    return '<div class="tbl-row li-cols" onclick="openCompany(\'' + v.id + '\')">' +
      '<div class="brand-cell"><div class="br-av" style="' + ui.avatarStyle(v.crm.brandName) + '">' + ui.esc(ui.initials(v.crm.brandName)) + '</div>' +
        '<div><div class="br-name">' + ui.esc(v.crm.brandName) + '</div><div class="br-sub">' + ui.esc(v.crm.brandId || '—') + '</div></div></div>' +
      '<div class="poc-cell">' + ui.esc(v.crm.owner || '—') + '</div>' +
      '<div><span class="badge bg-industry">' + ui.esc(v.industry) + '</span></div>' +
      '<div>' + ui.ring(v.score, 34) + '</div>' +
      '<div>' + recCell + '</div>' +
      '<div>' + ui.researchBadge(v.researchStatus) + '</div>' +
      '<div>' + ui.validationBadge(v.validationStatus) + '</div></div>';
  }

  function init() {
    if (!$('leads-content')) { return; }
    if (api().CRMStore) { api().CRMStore.subscribe(render); }
    render();
  }
  if (document.readyState !== 'loading') { init(); } else { document.addEventListener('DOMContentLoaded', init); }
  root.ALIP = root.ALIP || {};
  root.ALIP.LeadIntelligenceView = { render: render };
})(typeof self !== 'undefined' ? self : this);
