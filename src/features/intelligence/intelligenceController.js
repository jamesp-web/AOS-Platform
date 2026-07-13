/**
 * ALIP · Intelligence Controller (feature — Phase 4)
 * ---------------------------------------------------------------------------
 * Renders the "AI Intelligence" page and drives the IntelligencePipeline
 * (analyst → deterministic scoring). For every scored company it shows the
 * Overall Score, the 7-factor breakdown with contributions, the business
 * reason, the recommended action, and the analyst intelligence. Presentation
 * + wiring only. Browser-only.
 */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') { return; }

  var running = false;

  function api() { return root.ALIP || {}; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function initials(name) { var w = String(name || '?').trim().split(/\s+/); return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase(); }

  var REC_TONE = {
    'High Priority': ['var(--pl)', 'var(--pd)'], 'Priority': ['var(--bll)', '#1D4ED8'],
    'Review': ['var(--ol)', '#B45309'], 'Deprioritize': ['var(--rl)', '#B91C1C']
  };
  function scoreColor(t) { return t >= 75 ? 'var(--g)' : t >= 60 ? 'var(--o)' : 'var(--r)'; }

  function ring(total) {
    var c = scoreColor(total);
    return '<div class="ring" style="--v:' + total + ';--c:' + c + ';width:62px;height:62px">' +
      '<span style="color:' + c + ';font-size:19px">' + total + '</span></div>';
  }

  function factorRow(f) {
    var pctW = Math.round((f.earned / f.max) * 100);
    return '<div class="aii-f">' +
      '<div class="aii-f-lbl">' + esc(f.label) + '</div>' +
      '<div class="aii-f-bar"><div class="aii-f-fill" style="width:' + pctW + '%"></div></div>' +
      '<div class="aii-f-pts">' + f.earned + '<span>/' + f.max + '</span></div></div>';
  }

  function companyCard(c) {
    var ai = c.ai, s = ai.score, intel = ai.intelligence || {};
    var tone = REC_TONE[s.recommendation] || REC_TONE.Deprioritize;
    var signals = (intel.keySignals || []).map(function (k) { return '<span class="aii-chip">' + esc(k) + '</span>'; }).join('');
    return '<div class="aii-card">' +
      '<div class="aii-head">' +
        '<div class="aii-logo">' + esc(initials(c.crm.brandName)) + '</div>' +
        '<div class="aii-head-info"><div class="aii-name">' + esc(c.crm.brandName) + '</div>' +
          '<div class="aii-meta">' + esc(intel.industry || '—') + ' · ' + esc(intel.companyType || '—') + ' · analyst confidence ' + (intel.confidence || 0) + '%</div></div>' +
        '<div class="aii-score">' + ring(s.total) +
          '<span class="rec-pill" style="background:' + tone[0] + ';color:' + tone[1] + '">' + esc(s.recommendation) + '</span></div>' +
      '</div>' +
      '<div class="aii-body">' +
        '<div class="aii-breakdown">' +
          '<div class="aii-b-lbl">Score Breakdown · factor contributions</div>' +
          s.breakdown.map(factorRow).join('') +
          '<div class="aii-total"><span>Total Opportunity Score</span><b>' + s.total + '<i>/100</i></b></div>' +
        '</div>' +
        '<div class="aii-side">' +
          '<div class="aii-s-lbl">Business Reason</div><div class="aii-reason">' + esc(s.businessReason) + '</div>' +
          '<div class="aii-s-lbl">AI Analyst Summary</div><div class="aii-sum">' + esc(intel.businessSummary || '') + '</div>' +
          '<div class="aii-signals">' + signals + '</div>' +
        '</div>' +
      '</div></div>';
  }

  function apiEnabled() { var c = api().ApiClient; return !!(c && !c.isDisabled()); }

  var BATCH = 8;   // companies per request — short enough for serverless (Vercel 10s) limits; saves often

  function runAnalysis() {
    if (running) { return; }
    var a = api(), CRMStore = a.CRMStore, ApiClient = a.ApiClient;
    if (!CRMStore) { return; }
    var sid = CRMStore.getSessionId();
    running = true; render();
    if (apiEnabled() && ApiClient && sid) {
      runBatch(sid, 0);   // resumable, batched, rate-limit-paced walk through the researched set
      return;
    }
    localAnalyze();
  }

  // Score one batch, persist, then continue while progress is being made. Each
  // batch is saved server-side, so stopping (or a rate-limit wall) never loses work.
  function runBatch(sid, guard) {
    var a = api(), CRMStore = a.CRMStore, ApiClient = a.ApiClient;
    if (guard > 200) { running = false; render(); return; }   // safety cap
    ApiClient.analyze(sid, false, BATCH)                       // rescore=false → only unscored
      .then(function (res) {
        return ApiClient.session(sid).then(function (state) {
          CRMStore.hydrate(state);                             // refresh progress + list
          var d = (res && res.detail) || {};
          if (running && (d.remaining || 0) > 0 && (d.scored || 0) > 0) {
            runBatch(sid, guard + 1);                          // keep going while advancing
          } else {
            running = false; render();                         // done, or stalled (rate-limited)
          }
        });
      })
      .catch(function (err) {
        console.warn('[ALIP] analyze batch failed:', err && err.message);
        if (guard === 0) { localAnalyze(); return; }           // first-batch failure → offline fallback
        running = false; render();
      });
  }

  function localAnalyze() {
    var a = api(), CRMStore = a.CRMStore, Pipeline = a.IntelligencePipeline;
    if (!Pipeline) { running = false; render(); return; }
    Pipeline.run(CRMStore.getCompanies(), {
      ai: a.AIIntelligenceService, scoring: a.ScoringEngine, reScore: true,
      onUpdate: function (companies) { CRMStore.setCompanies(companies); }
    }).then(function () { running = false; render(); }).catch(function () { running = false; render(); });
  }

  function render() {
    var wrap = $('intelligence-content');
    if (!wrap) { return; }
    var CRMStore = api().CRMStore, Pipeline = api().IntelligencePipeline, AI = api().AIIntelligenceService;
    var companies = CRMStore ? CRMStore.getCompanies() : [];

    var researched = companies.filter(function (c) { return Pipeline.isResearched(c); });
    if (!companies.length || !researched.length) {
      wrap.innerHTML = '<div class="val-empty">' +
        '<div class="val-empty-ic"><svg viewBox="0 0 24 24"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z"/></svg></div>' +
        '<div class="val-empty-t">No researched companies yet</div>' +
        '<div class="val-empty-d">Run the <b>Research Queue</b> first — the AI analyst needs research to work from, then the Scoring Engine computes the Opportunity Score.</div>' +
        '<button class="btn-p" onclick="navigate(\'research\')">Go to Research Queue</button></div>';
      return;
    }

    var st = Pipeline.stats(companies);
    var scored = companies.filter(function (c) { return c.ai && c.ai.score; })
                          .sort(function (a, b) { return b.ai.score.total - a.ai.score.total; });
    var provider = (AI && AI.hasApiKey()) ? 'OpenAI (live)' : 'Offline stub — set an OpenAI key for live analysis';
    var canRun = !running && researched.length > 0;
    var remaining = Math.max(0, researched.length - scored.length);
    var progress = researched.length ? Math.round((st.scored / researched.length) * 100) : 0;
    var runLabel = running ? '<span class="spinner"></span>Analyzing…'
      : (scored.length > 0 && remaining > 0 ? 'Score remaining (' + remaining + ')' : 'Run AI Analysis &amp; Scoring');

    wrap.innerHTML =
      '<div class="rq-bar">' +
        '<div class="rq-progress-wrap"><div class="rq-progress-top"><span>Analysis &amp; Scoring Progress</span><span>' + progress + '%</span></div>' +
        '<div class="rq-progress"><div class="rq-progress-f" style="width:' + progress + '%"></div></div>' +
        '<div class="rq-progress-meta">' + st.scored + ' of ' + researched.length + ' researched companies scored · ' +
          'Analyst: ' + esc(provider) + ' · Scoring: deterministic (app-owned)</div></div>' +
        '<div class="rq-actions"><button class="btn-p" id="aii-run"' + (canRun ? '' : ' disabled') + '>' + runLabel + '</button></div>' +
      '</div>' +
      (running ? '<div class="load-note"><span class="spinner spinner-p"></span>Scoring in safe batches (paced for the LLM\'s rate limits)… you can leave this page — progress is saved.</div>' : '') +
      (!running && remaining > 0 && scored.length > 0 ? '<div class="load-note">' + remaining + ' researched compan' + (remaining === 1 ? 'y' : 'ies') + ' still need scoring — click <b>Score remaining</b> to continue. Batches are paced &amp; saved to respect the LLM\'s free-tier rate limit.</div>' : '') +
      (scored.length
        ? '<div class="val-section-lbl" style="margin-top:24px">Scored companies · ' + scored.length + '</div>' + '<div class="aii-list">' + scored.map(companyCard).join('') + '</div>'
        : '<div class="val-clean" style="margin-top:20px">Ready to analyze ' + researched.length + ' researched companies. Click <b>Run AI Analysis &amp; Scoring</b>.</div>');

    var btn = $('aii-run'); if (btn && canRun) { btn.addEventListener('click', runAnalysis); }
  }

  function init() {
    if (!$('intelligence-content')) { return; }
    var CRMStore = api().CRMStore;
    if (CRMStore) { CRMStore.subscribe(render); }
    render();
  }

  if (document.readyState !== 'loading') { init(); } else { document.addEventListener('DOMContentLoaded', init); }
  root.ALIP = root.ALIP || {};
  root.ALIP.IntelligenceView = { render: render };
})(typeof self !== 'undefined' ? self : this);
