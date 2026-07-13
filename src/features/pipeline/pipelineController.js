/**
 * ALIP · Pipeline Controller (feature — UX clarity)
 * ---------------------------------------------------------------------------
 * A persistent progress stepper shown above every page: it makes the 5-stage
 * flow obvious (Upload → Validate → Research → Analyze → Dashboard), shows how
 * far along the founder is, and highlights the single next action. Reads real
 * state from CRMStore + selectors; clicking a stage navigates to it.
 *
 * Browser-only. Additive — does not touch the nav or existing pages.
 */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') { return; }

  function api() { return root.ALIP || {}; }
  function $(id) { return document.getElementById(id); }
  var CHECK = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
  var GRID = '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>';

  function render() {
    var bar = $('pipeline-bar');
    if (!bar || !api().CRMStore || !api().IntelligenceSelectors) { return; }
    var S = api().IntelligenceSelectors, CRMStore = api().CRMStore;
    var companies = CRMStore.getCompanies() || [];
    var validation = CRMStore.getValidation();
    var research = CRMStore.getResearch();

    var uploaded = companies.length > 0;
    var validated = !!validation;
    var k = uploaded ? S.computeKpis(companies, validation, research) : null;
    var researchable = k ? (k.totalCompanies - k.researchSkipped) : 0;
    var researched = k ? k.researchCompleted : 0;
    var scored = companies.filter(function (c) { return c.ai && c.ai.score; }).length;
    var researchDone = uploaded && researchable > 0 && researched >= researchable;
    var analyzeDone = researchDone && researched > 0 && scored >= researched;

    var steps = [
      { go: 'upload', name: 'Upload CRM', done: uploaded, sub: uploaded ? companies.length + ' companies' : 'start here' },
      { go: 'validation', name: 'Validate', done: validated, sub: validated ? (k.duplicateLeads + ' duplicates') : 'find duplicates' },
      { go: 'research', name: 'Research', done: researchDone, sub: uploaded ? (researched + '/' + researchable + ' researched') : 'enrich leads' },
      { go: 'intelligence', name: 'Analyze & Score', done: analyzeDone, sub: uploaded ? (scored + ' scored') : 'AI scoring' },
      { go: 'dashboard', name: 'Dashboard', done: analyzeDone, sub: 'executive view', view: true }
    ];

    // the next action = first incomplete stage (ignoring the Dashboard view)
    var activeIdx = -1;
    for (var i = 0; i < 4; i++) { if (!steps[i].done) { activeIdx = i; break; } }

    bar.innerHTML = '<div class="pl-steps">' + steps.map(function (s, idx) {
      var cls = s.done ? 'done' : (idx === activeIdx ? 'active' : 'todo');
      var node = s.view ? GRID : (s.done ? CHECK : String(idx + 1));
      var next = (idx === activeIdx && !s.view) ? '<span class="pl-next">Next</span>' : '';
      var line = idx < steps.length - 1 ? '<div class="pl-line' + (steps[idx].done ? ' done' : '') + '"></div>' : '';
      return '<div class="pl-step ' + cls + '" onclick="navigate(\'' + s.go + '\')" role="button" tabindex="0">' +
        '<div class="pl-node">' + node + '</div>' +
        '<div class="pl-txt"><div class="pl-name">' + s.name + next + '</div><div class="pl-sub">' + s.sub + '</div></div>' +
        '</div>' + line;
    }).join('') + '</div>';
  }

  function init() {
    if (!$('pipeline-bar')) { return; }
    if (api().CRMStore) { api().CRMStore.subscribe(render); }
    render();
  }
  if (document.readyState !== 'loading') { init(); } else { document.addEventListener('DOMContentLoaded', init); }
  root.ALIP = root.ALIP || {};
  root.ALIP.PipelineView = { render: render };
})(typeof self !== 'undefined' ? self : this);
