/**
 * ALIP · Companies Controller (feature — Phase 5)
 * ---------------------------------------------------------------------------
 * Renders the Companies directory and the full Company profile from the real
 * uploaded + enriched data (no mock). The profile shows Overview, Research
 * Summary, Opportunity Score + Breakdown, Business Reason, Recommendation,
 * Research/Duplicate/Validation status, and Recent Signals.
 *
 * Browser-only.
 */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') { return; }

  var search = '', industryFilter = 'All';

  function api() { return root.ALIP || {}; }
  function $(id) { return document.getElementById(id); }
  function U() { return api().UI; }

  function state() {
    var s = api().CRMStore;
    return { companies: s ? s.getCompanies() : [], validation: s ? s.getValidation() : null, research: s ? s.getResearch() : null };
  }
  function byId(id) { return state().companies.filter(function (c) { return c.id === id; })[0]; }

  // ── directory grid ──
  function renderGrid() {
    var wrap = $('companies-content'); if (!wrap || !U()) { return; }
    if (!api().UI.pageActive('page-companies')) { return; }
    var st = state(), S = api().IntelligenceSelectors, ui = U();

    if (!st.companies.length) {
      wrap.innerHTML = emptyState('No companies yet', 'Upload a CRM to populate the directory.', 'upload', 'Upload CRM');
      return;
    }

    var industries = ['All'].concat(uniq(st.companies.map(function (c) { return S.industryOf(c) || 'Unclassified'; })));
    var list = st.companies.map(function (c) { return S.companyView(c, st.validation, st.research); });
    if (industryFilter !== 'All') { list = list.filter(function (v) { return (v.industry || 'Unclassified') === industryFilter; }); }
    if (search) { list = list.filter(function (v) { return (v.crm.brandName + ' ' + v.industry + ' ' + (v.crm.owner || '')).toLowerCase().indexOf(search.toLowerCase()) !== -1; }); }
    list.sort(function (a, b) { return (b.score || -1) - (a.score || -1); });

    wrap.innerHTML =
      '<div style="display:flex;align-items:center;gap:12px;margin-top:20px">' +
        '<div class="tbl-search" style="max-width:360px"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '<input type="text" id="co-search" placeholder="Search companies, industry, owner…" value="' + ui.esc(search) + '"></div>' +
        '<div class="res-cnt"><b>' + list.length + '</b> of ' + st.companies.length + '</div>' +
        (api().CRMStore.getSessionId() ? '<button class="btn-g" id="co-export" title="Export enriched CRM"><svg viewBox="0 0 24 24" style="width:15px;height:15px;stroke:currentColor;fill:none;stroke-width:2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>Export</button>' : '') +
        '</div>' +
      '<div class="ind-filter">' + industries.map(function (i) {
        return '<div class="ind-ftab' + (i === industryFilter ? ' active' : '') + '" data-ind="' + ui.esc(i) + '">' + ui.esc(i) + '</div>';
      }).join('') + '</div>' +
      '<div class="comp-grid">' + (list.length ? list.map(card).join('') : '<div class="val-clean">No companies match your filters.</div>') + '</div>';

    var si = $('co-search');
    if (si) { si.addEventListener('input', function (e) { search = e.target.value; renderGrid(); var n = $('co-search'); if (n) { n.focus(); n.setSelectionRange(n.value.length, n.value.length); } }); }
    wrap.querySelectorAll('.ind-ftab').forEach(function (t) { t.addEventListener('click', function () { industryFilter = t.getAttribute('data-ind'); renderGrid(); }); });
    var eb = $('co-export'); if (eb) { eb.addEventListener('click', downloadExport); }
  }

  function card(v) {
    var ui = U();
    var sid = api().CRMStore && api().CRMStore.getSessionId();
    var canEnrich = !v.score && v.validationStatus !== 'Duplicate' && !!sid;
    var enrichBtn = canEnrich
      ? '<button class="co-enrich" onclick="event.stopPropagation();ALIP.UI.enrichRow(this,\'' + v.id + '\')"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>Research &amp; score</button>'
      : '';
    return '<div class="co-card" onclick="openCompany(\'' + v.id + '\')">' +
      '<div class="co-logo" style="' + ui.avatarStyle(v.crm.brandName) + '">' + ui.esc(ui.initials(v.crm.brandName)) + '</div>' +
      '<div class="co-score">' + ui.ring(v.score, 36) + '</div>' +
      '<div class="co-name">' + ui.esc(v.crm.brandName) + '</div>' +
      '<div class="co-meta">' + ui.esc(v.industry) + (v.crm.owner ? ' · ' + ui.esc(v.crm.owner) : '') + '</div>' +
      '<div class="co-badges">' + ui.recPill(v.recommendation) + ui.validationBadge(v.validationStatus) + '</div>' +
      enrichBtn + '</div>';
  }

  // ── company profile ──
  function fact(label, value) { return '<div class="mini-stat"><div class="mini-lbl">' + U().esc(label) + '</div><div class="mini-val sm">' + U().esc(value || '—') + '</div></div>'; }
  function factorRow(f) {
    var w = Math.round((f.earned / f.max) * 100);
    return '<div class="aii-f"><div class="aii-f-lbl">' + U().esc(f.label) + '</div>' +
      '<div class="aii-f-bar"><div class="aii-f-fill" style="width:' + w + '%"></div></div>' +
      '<div class="aii-f-pts">' + f.earned + '<span>/' + f.max + '</span></div></div>';
  }

  function renderDetail(id) {
    var wrap = $('cd-content'); if (!wrap || !U()) { return; }
    var st = state(), S = api().IntelligenceSelectors, ui = U();
    var c = byId(id); if (!c) { wrap.innerHTML = '<div class="val-empty"><div class="val-empty-t">Company not found.</div></div>'; return; }
    var v = S.companyView(c, st.validation, st.research);
    var ai = c.ai || {}, intel = ai.intelligence || {}, sc = ai.score, research = ai.research;

    var sid = api().CRMStore.getSessionId();
    var notDup = v.validationStatus !== 'Duplicate';
    var researched = v.researchStatus === 'completed' || v.researchStatus === 'cached';
    var canEnrich = !sc && notDup && !!sid;
    var enrichBtn = canEnrich ? '<button class="btn-p" id="cd-enrich" style="margin-top:10px">Research &amp; score</button>' : '';
    // Re-research (ignore cache) — the fix for a wrong-entity / stale cached result.
    var reBtn = ((sc || researched) && notDup && !!sid)
      ? '<button class="li-enrich" id="cd-reresearch" style="margin-top:12px" title="Ignore the cached result and fetch fresh research"><svg viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>Re-research</button>'
      : '';
    var scoreArea = (sc
      ? ui.ring(sc.total, 78) + '<div class="cd-rec-lbl" style="margin-top:10px">Recommendation</div>' + ui.recPill(sc.recommendation) + '<div class="conf-text">Score is deterministic &amp; reproducible</div>'
      : ui.ring(null, 78) + '<div class="conf-text" style="margin-top:8px">Not yet scored</div>' + enrichBtn) + reBtn;

    var breakdown = sc
      ? '<div class="det-sec"><div class="det-sec-lbl">Score Composition</div><div class="det-sec-title">How this score was built</div>' +
          sc.breakdown.map(factorRow).join('') +
          '<div class="aii-total"><span>Total Opportunity Score</span><b>' + sc.total + '<i>/100</i></b></div>' +
          '<div class="aii-reason" style="margin-top:14px">' + ui.esc(sc.businessReason) + '</div></div>'
      : '';

    var signals = (intel.keySignals || []);
    var signalsHtml = signals.length
      ? '<div class="det-sec"><div class="det-sec-lbl">Recent Signals</div><div class="det-sec-title">What the analyst surfaced</div><div class="sig-timeline">' +
          signals.map(function (s) { return '<div class="sig-item"><div class="sig-dot"><div class="sig-dot-i"></div></div><div><div class="sig-desc">' + ui.esc(s) + '</div></div></div>'; }).join('') +
        '</div></div>'
      : '';

    var researchHtml = research
      ? '<div class="det-sec"><div class="det-sec-lbl">Research Summary</div><div class="det-sec-title">Sourced intelligence · ' + ui.esc(research.provider) + '</div>' +
          '<div class="ai-sum-text">' + ui.esc(research.answer || '') + '</div>' +
          (research.sources || []).map(function (s) { return '<div class="adv-item"><div class="ai-ico"><svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/></svg></div>' + ui.esc(s.title) + '</div>'; }).join('') +
        '</div>'
      : '';

    var job = (S.jobsByCompany(st.research))[c.id];
    var events = [
      { label: 'Uploaded from CRM', done: true, meta: 'Brand ID ' + (c.crm.brandId || '—') },
      { label: 'Validated', done: !!st.validation, meta: v.validationStatus },
      { label: 'Researched', done: (v.researchStatus === 'completed' || v.researchStatus === 'cached'), meta: (research && research.fetchedAt) ? new Date(research.fetchedAt).toLocaleString() : (v.researchStatus === 'skipped' ? 'Skipped (duplicate)' : 'Pending') },
      { label: 'Scored', done: !!sc, meta: sc ? sc.total + '/100 · ' + sc.recommendation : 'Not scored' }
    ];
    var timelineHtml = '<div class="det-sec"><div class="det-sec-lbl">Timeline</div><div class="det-sec-title">Pipeline journey</div><div class="sig-timeline">' +
      events.map(function (e) { return '<div class="sig-item"><div class="sig-dot' + (e.done ? '' : ' sig-dot-off') + '"><div class="sig-dot-i"></div></div><div><div class="sig-tc">' + ui.esc(e.label) + '</div><div class="sig-desc">' + ui.esc(e.meta) + '</div></div></div>'; }).join('') +
      '</div></div>';

    wrap.innerHTML =
      '<div class="cd-header">' +
        '<div class="cd-logo" style="' + ui.avatarStyle(c.crm.brandName) + '">' + ui.esc(ui.initials(c.crm.brandName)) + '</div>' +
        '<div class="cd-info"><div class="cd-sec-badge">' + ui.esc(v.industry) + (intel.companyType ? ' · ' + ui.esc(intel.companyType) : '') + '</div>' +
          '<div class="cd-name">' + ui.esc(c.crm.brandName) + '</div>' +
          '<div class="cd-meta-row">' +
            '<div class="cd-meta-item">ID <b style="margin-left:4px">' + ui.esc(c.crm.brandId || '—') + '</b></div>' +
            '<div class="cd-meta-item">Owner <b style="margin-left:4px">' + ui.esc(c.crm.owner || '—') + '</b></div>' +
            '<div class="cd-meta-item">' + ui.validationBadge(v.validationStatus) + '</div>' +
            '<div class="cd-meta-item">' + ui.researchBadge(v.researchStatus) + '</div>' +
          '</div></div>' +
        '<div class="cd-score-area">' + scoreArea + '</div>' +
      '</div>' +
      '<div class="det-layout"><div>' +
        (intel.businessSummary ? '<div class="det-sec"><div class="det-sec-lbl">AI Analyst Summary</div><div class="det-sec-title">What our analyst sees</div><div class="ai-sum-text">' + ui.esc(intel.businessSummary) + '</div></div>' : '') +
        breakdown + researchHtml + signalsHtml + timelineHtml +
        (!ai.intelligence ? '<div class="val-clean">This company hasn\'t been analyzed yet. Run the Research Queue and AI Intelligence steps to enrich it.</div>' : '') +
      '</div><div>' +
        (sc ? '<div class="rp-card rp-hero"><div class="rp-hero-ic"><svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>' +
          '<div class="rp-lbl">Recommendation</div><div style="font-size:20px;font-weight:800;color:var(--t);margin:2px 0 8px">' + ui.esc(sc.recommendation) + '</div>' +
          '<div style="font-size:13px;color:var(--t3);line-height:1.6">' + ui.esc(sc.businessReason) + '</div></div>' : '') +
        '<div class="rp-card"><div class="rp-lbl">Status</div><div class="rp-title">Pipeline state</div>' +
          '<div class="mini-grid">' +
            '<div class="mini-stat"><div class="mini-lbl">Research</div><div style="margin-top:5px">' + ui.researchBadge(v.researchStatus) + '</div></div>' +
            '<div class="mini-stat"><div class="mini-lbl">Validation</div><div style="margin-top:5px">' + ui.validationBadge(v.validationStatus) + '</div></div>' +
            '<div class="mini-stat"><div class="mini-lbl">CRM Duplicate</div><div class="mini-val sm">' + ui.esc(c.crm.duplicateStatus || '—') + '</div></div>' +
            '<div class="mini-stat"><div class="mini-lbl">Confidence</div><div class="mini-val">' + (intel.confidence || 0) + '%</div></div>' +
          '</div></div>' +
        '<div class="rp-card"><div class="rp-lbl">AI Intelligence</div><div class="rp-title">Analyst facts</div><div class="mini-grid">' +
            fact('Financial', intel.financialHealth) + fact('Advertising', intel.advertisingActivity) +
            fact('Growth', intel.growthSignals) + fact('Expansion', intel.expansionSignals) +
            fact('Decision Maker', intel.decisionMakerLikelihood) + fact('Company Type', intel.companyType) +
          '</div></div>' +
        '<div class="rp-card"><div class="rp-lbl">CRM Data · untouched</div><div class="rp-title">Source record</div><div class="mini-grid">' +
            fact('Brand ID', c.crm.brandId) + fact('Owner', c.crm.owner) + fact('Agency', c.crm.agency) + fact('Duplicate', c.crm.duplicateStatus) +
          '</div></div>' +
      '</div></div>';

    var eb = $('cd-enrich');
    if (eb) { eb.addEventListener('click', function () { enrichOne(id, false); }); }
    var rb = $('cd-reresearch');
    if (rb) { rb.addEventListener('click', function () { enrichOne(id, true); }); }
  }

  // Phase 8: research + analyse + score a SINGLE company on demand (backend does the work).
  // force=true ignores any cached research and re-fetches (fixes wrong-entity results).
  function enrichOne(id, force) {
    var ApiClient = api().ApiClient, CRMStore = api().CRMStore, sid = CRMStore.getSessionId();
    if (!ApiClient || !sid) { return; }
    var btnId = force ? 'cd-reresearch' : 'cd-enrich';
    var btn = $(btnId); if (btn) { btn.innerHTML = '<span class="spinner spinner-p"></span>' + (force ? 'Re-researching…' : 'Researching & scoring…'); btn.disabled = true; }
    ApiClient.enrichCompany(sid, id, force)
      .then(function (res) {
        return ApiClient.session(sid).then(function (state) {
          CRMStore.hydrate(state);   // refresh dashboard/lists from the updated session
          renderDetail(id);          // re-open this profile with its new score
          if (res && res.ok === false && res.error) { setTimeout(function () { alert('Analysis failed: ' + res.error); }, 50); }
        });
      })
      .catch(function (err) {
        var b = $(btnId); if (b) { b.textContent = 'Failed — retry'; b.disabled = false; }
        console.warn('[ALIP] enrich failed:', err && err.message);
      });
  }

  function emptyState(t, d, page, btn) {
    return '<div class="val-empty"><div class="val-empty-ic"><svg viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M9 21v-4h6v4"/></svg></div>' +
      '<div class="val-empty-t">' + t + '</div><div class="val-empty-d">' + d + '</div>' +
      '<button class="btn-p" onclick="navigate(\'' + page + '\')">' + btn + '</button></div>';
  }
  function uniq(a) { return a.filter(function (v, i) { return a.indexOf(v) === i; }); }

  // Phase 8: download the enriched .xlsx from the backend export endpoint.
  function downloadExport() {
    var ApiClient = api().ApiClient, sid = api().CRMStore.getSessionId();
    if (!ApiClient || !sid) { return; }
    var btn = $('co-export'); if (btn) { btn.textContent = 'Exporting…'; btn.disabled = true; }
    ApiClient.exportBlob(sid).then(function (blob) {
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = 'alip_enriched.xlsx';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      renderGrid();
    }).catch(function (err) { console.warn('[ALIP] Export failed:', err && err.message); renderGrid(); });
  }

  function init() {
    if (!$('companies-content')) { return; }
    if (api().CRMStore) { api().CRMStore.subscribe(renderGrid); }
    renderGrid();
  }
  if (document.readyState !== 'loading') { init(); } else { document.addEventListener('DOMContentLoaded', init); }
  root.ALIP = root.ALIP || {};
  root.ALIP.CompaniesView = { render: renderGrid, renderDetail: renderDetail };
})(typeof self !== 'undefined' ? self : this);
