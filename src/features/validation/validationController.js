/**
 * ALIP · Validation Controller (feature)
 * ---------------------------------------------------------------------------
 * Renders the "Lead Validation" page from the DuplicateService report held in
 * CRMStore. Presentation only — no detection logic here. Reuses existing
 * design-system classes; adds a few scoped .val-* styles in index.html.
 *
 * Business-group links are shown as parent cards (clear for the founder);
 * the detail table lists the actionable exact / fuzzy / conflict findings,
 * each with a plain-language reason.
 *
 * Browser-only.
 */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') { return; }

  function api() { return root.ALIP || {}; }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var TYPE_BADGE = {
    'exact': 'bg-red', 'fuzzy': 'bg-orange', 'business': 'bg-blue',
    'owner-conflict': 'bg-purple', 'agency-conflict': 'bg-purple'
  };
  var ACTION_BADGE = { 'Merge': 'bg-purple', 'Review': 'bg-orange', 'Keep Separate': 'bg-gray' };

  function ensureReport() {
    var CRMStore = api().CRMStore, DuplicateService = api().DuplicateService;
    if (!CRMStore) { return null; }
    var report = CRMStore.getValidation();
    if (!report && DuplicateService) {
      var companies = CRMStore.getCompanies();
      if (companies && companies.length) { report = CRMStore.setValidation(DuplicateService.analyze(companies)); report = CRMStore.getValidation(); }
    }
    return report;
  }

  function summaryCard(label, value, sub, tone) {
    return '<div class="val-card' + (tone ? ' val-' + tone : '') + '">' +
      '<div class="val-c-lbl">' + esc(label) + '</div>' +
      '<div class="val-c-val">' + value + '</div>' +
      (sub ? '<div class="val-c-sub">' + esc(sub) + '</div>' : '') +
      '</div>';
  }

  function memberChip(m) {
    var meta = [m.owner, m.agency].filter(Boolean).join(' · ');
    return '<div class="val-member"><span class="val-m-name">' + esc(m.name) + '</span>' +
      (meta ? '<span class="val-m-meta">' + esc(meta) + '</span>' : '') + '</div>';
  }

  function detailRow(d) {
    var conf = Math.round(d.confidence * 100);
    return '<div class="tbl-row val-cols">' +
      '<div><span class="badge ' + (TYPE_BADGE[d.type] || 'bg-gray') + '">' + esc(d.typeLabel) + '</span></div>' +
      '<div class="val-members">' + d.members.map(memberChip).join('<span class="val-vs">vs</span>') + '</div>' +
      '<div class="val-conf"><div class="val-bar"><div class="val-bar-f" style="width:' + conf + '%"></div></div><span>' + conf + '%</span></div>' +
      '<div><span class="badge ' + (ACTION_BADGE[d.recommendedAction] || 'bg-gray') + '">' + esc(d.recommendedAction) + '</span></div>' +
      '<div class="val-reason">' + esc(d.reason) + '</div>' +
      '</div>';
  }

  function groupCard(g) {
    return '<div class="val-group">' +
      '<div class="val-group-head"><div class="val-group-parent">' + esc(g.parent) +
      '</div><div class="val-group-tag">' + g.memberIds.length + ' brands · ' +
      (g.via === 'registry' ? 'known group' : 'inferred') + '</div></div>' +
      '<div class="val-group-members">' + g.memberNames.map(function (n) {
        return '<span class="val-chip">' + esc(n) + '</span>';
      }).join('') + '</div></div>';
  }

  function render() {
    var wrap = $('validation-content');
    if (!wrap) { return; }
    var CRMStore = api().CRMStore;
    var companies = CRMStore ? CRMStore.getCompanies() : [];

    if (!companies || !companies.length) {
      wrap.innerHTML = '<div class="val-empty">' +
        '<div class="val-empty-ic"><svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>' +
        '<div class="val-empty-t">No CRM uploaded yet</div>' +
        '<div class="val-empty-d">Upload a CRM export on the <b>CRM Upload</b> page and the Lead Validation Engine will analyse it automatically.</div>' +
        '<button class="btn-p" onclick="navigate(\'upload\')">Go to CRM Upload</button></div>';
      return;
    }

    var report = ensureReport();
    if (!report) { wrap.innerHTML = '<div class="val-empty"><div class="val-empty-t">Validation engine unavailable.</div></div>'; return; }

    var s = report.summary;
    var cards =
      summaryCard('Total Companies', s.totalCompanies, s.cleanCompanies + ' clean', 'neutral') +
      summaryCard('Exact Duplicates', s.exact, 'same name + ID', s.exact ? 'red' : 'neutral') +
      summaryCard('Fuzzy Duplicates', s.fuzzy, 'naming variations', s.fuzzy ? 'orange' : 'neutral') +
      summaryCard('Business Groups', s.businessGroups, s.businessGroupedCompanies + ' grouped brands', s.businessGroups ? 'blue' : 'neutral') +
      summaryCard('Owner Conflicts', s.ownerConflicts, 'multiple owners', s.ownerConflicts ? 'purple' : 'neutral') +
      summaryCard('Agency Conflicts', s.agencyConflicts, 'multiple agencies', s.agencyConflicts ? 'purple' : 'neutral');

    var detail = report.duplicates.filter(function (d) { return d.type !== 'business'; });
    detail.sort(function (a, b) { return b.confidence - a.confidence; });

    var groupsHtml = report.groups.length
      ? '<div class="val-section-lbl">Business Groups · parent relationships</div>' +
        '<div class="val-groups">' + report.groups.map(groupCard).join('') + '</div>'
      : '';

    var tableHtml = detail.length
      ? '<div class="val-section-lbl" style="margin-top:26px">Flagged for validation · ' + detail.length + ' findings</div>' +
        '<div class="leads-tbl"><div class="tbl-head val-cols">' +
          '<div>Type</div><div>Companies</div><div>Confidence</div><div>Action</div><div>Why it was flagged</div>' +
        '</div>' + detail.map(detailRow).join('') + '</div>'
      : '<div class="val-clean">✓ No exact, fuzzy, or conflict issues found in this upload.</div>';

    wrap.innerHTML =
      '<div class="val-summary">' + cards + '</div>' +
      groupsHtml +
      tableHtml;
  }

  function init() {
    if (!$('validation-content')) { return; }
    var CRMStore = api().CRMStore;
    if (CRMStore) { CRMStore.subscribe(render); }
    render();
  }

  if (document.readyState !== 'loading') { init(); }
  else { document.addEventListener('DOMContentLoaded', init); }

  // expose for router-triggered refresh
  root.ALIP = root.ALIP || {};
  root.ALIP.ValidationView = { render: render };
})(typeof self !== 'undefined' ? self : this);
