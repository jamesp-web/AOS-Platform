/**
 * ALIP · Research Controller (feature)
 * ---------------------------------------------------------------------------
 * Renders the "Research Queue" page from the queue held in CRMStore and drives
 * the ResearchRunner. Presentation + wiring only — no queue or research logic
 * here. Subscribes to the store so progress updates live while jobs run.
 *
 * Browser-only.
 */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') { return; }

  var running = false;

  function api() { return root.ALIP || {}; }
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function time(iso) { if (!iso) { return '—'; } try { return new Date(iso).toLocaleTimeString(); } catch (e) { return '—'; } }

  var STATUS_BADGE = {
    pending: 'bg-gray', queued: 'bg-gray', researching: 'bg-blue',
    completed: 'bg-green', failed: 'bg-red', cached: 'bg-purple', skipped: 'bg-gray'
  };

  function card(label, value, sub, tone) {
    return '<div class="rq-card' + (tone ? ' rq-' + tone : '') + '">' +
      '<div class="rq-c-lbl">' + esc(label) + '</div>' +
      '<div class="rq-c-val">' + value + '</div>' +
      (sub ? '<div class="rq-c-sub">' + esc(sub) + '</div>' : '') + '</div>';
  }

  function jobRow(j) {
    var Labels = (api().ResearchJob || {}).LABELS || {};
    return '<div class="tbl-row rq-cols">' +
      '<div class="rq-co"><span class="rq-id">' + esc(j.companyId) + '</span><span class="rq-name">' + esc(j.companyName) + '</span></div>' +
      '<div><span class="badge ' + (STATUS_BADGE[j.status] || 'bg-gray') + '">' + esc(Labels[j.status] || j.status) + '</span></div>' +
      '<div class="rq-retry">' + (j.retryCount || 0) + '</div>' +
      '<div class="rq-time">' + time(j.startedAt) + '</div>' +
      '<div class="rq-time">' + time(j.completedAt) + '</div>' +
      '<div class="rq-err">' + (j.lastError ? esc(j.lastError) : '<span class="up-dash">—</span>') + '</div>' +
      '</div>';
  }

  function apiEnabled() { var c = api().ApiClient; return !!(c && !c.isDisabled()); }

  var R_BATCH = 8;   // companies per request — keeps each call under serverless (Vercel 10s) timeouts

  function startResearch() {
    if (running) { return; }
    var a = api(), CRMStore = a.CRMStore, RQ = a.ResearchQueue, ApiClient = a.ApiClient;
    var research = CRMStore && CRMStore.getResearch();
    if (!research || !RQ) { return; }
    if (!RQ.pendingJobs(research.jobs).length) { return; }
    running = true; render();
    var sid = CRMStore.getSessionId();
    if (apiEnabled() && ApiClient && sid) {
      researchBatch(sid, 0, null);   // batched, resumable — the backend runs Tavily server-side
      return;
    }
    localResearch();
  }

  function pendingCount() {
    var CRMStore = api().CRMStore, RQ = api().ResearchQueue;
    var r = CRMStore && CRMStore.getResearch();
    return (r && RQ) ? RQ.pendingJobs(r.jobs).length : 0;
  }

  // Research a small batch, then continue while progress is being made. Each batch
  // is short (fits serverless limits) and saved server-side, so stopping loses nothing.
  function researchBatch(sid, guard, prevPending) {
    var CRMStore = api().CRMStore, ApiClient = api().ApiClient;
    if (guard > 300) { running = false; render(); return; }
    ApiClient.startResearch(sid, R_BATCH)
      .then(function () { return ApiClient.session(sid); })
      .then(function (state) {
        CRMStore.hydrate(state);
        var pending = pendingCount();
        if (running && pending > 0 && (prevPending == null || pending < prevPending)) {
          render(); researchBatch(sid, guard + 1, pending);   // more to do, and advancing
        } else {
          running = false; render();
        }
      })
      .catch(function (err) {
        console.warn('[ALIP] API research failed:', err && err.message);
        if (guard === 0) { localResearch(); } else { running = false; render(); }
      });
  }

  function localResearch() {
    var Runner = api().ResearchRunner, CRMStore = api().CRMStore;
    if (!Runner) { running = false; render(); return; }
    Runner.run(CRMStore).then(function () { running = false; render(); })
                        .catch(function () { running = false; render(); });
  }

  function retryFailed() {
    if (running) { return; }
    var a = api(), CRMStore = a.CRMStore, RQ = a.ResearchQueue, ApiClient = a.ApiClient;
    var research = CRMStore && CRMStore.getResearch();
    if (!research || !RQ) { return; }
    var sid = CRMStore.getSessionId();
    if (apiEnabled() && ApiClient && sid) {
      running = true; render();
      ApiClient.retryResearch(sid)
        .then(function () { return ApiClient.session(sid); })
        .then(function (state) { CRMStore.hydrate(state); running = false; render(); })
        .catch(function (err) { console.warn('[ALIP] API retry failed — local fallback:', err && err.message); running = false; localRetry(); });
      return;
    }
    localRetry();
  }

  function localRetry() {
    var CRMStore = api().CRMStore, RQ = api().ResearchQueue, research = CRMStore.getResearch();
    CRMStore.setResearch({ jobs: RQ.resetFailed(research.jobs), version: research.version, builtAt: research.builtAt });
    startResearch();
  }

  function render() {
    var wrap = $('research-content');
    if (!wrap) { return; }
    var CRMStore = api().CRMStore, RQ = api().ResearchQueue, Tavily = api().TavilyService;
    var companies = CRMStore ? CRMStore.getCompanies() : [];

    if (!companies || !companies.length) {
      wrap.innerHTML = '<div class="val-empty">' +
        '<div class="val-empty-ic"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div>' +
        '<div class="val-empty-t">No CRM uploaded yet</div>' +
        '<div class="val-empty-d">Upload a CRM and validate it — a research job is created for every unique company, ready to enrich.</div>' +
        '<button class="btn-p" onclick="navigate(\'upload\')">Go to CRM Upload</button></div>';
      return;
    }

    var research = CRMStore.getResearch();
    if (!research || !research.jobs) {
      wrap.innerHTML = '<div class="val-empty"><div class="val-empty-t">Queue not built yet.</div>' +
        '<div class="val-empty-d">Re-upload the CRM to build the research queue.</div></div>';
      return;
    }

    var s = RQ.stats(research.jobs);
    var current = research.jobs.filter(function (j) { return j.status === 'researching'; })[0];
    var eta = s.remaining ? (s.etaSeconds >= 60 ? Math.round(s.etaSeconds / 60) + ' min' : Math.round(s.etaSeconds) + 's') : '—';
    var providerMode = (Tavily && Tavily.hasApiKey()) ? 'Tavily (live)' : 'Offline stub — set a Tavily key for live research';

    var canStart = s.pending + s.queued > 0 && !running;
    var canRetry = s.failed > 0 && !running;

    var cards =
      card('Pending', s.pending, s.queued ? s.queued + ' queued' : 'awaiting research', s.pending ? 'amber' : 'neutral') +
      card('Researching', s.researching, running ? 'in progress' : 'idle', s.researching ? 'blue' : 'neutral') +
      card('Completed', s.completed, 'enriched', s.completed ? 'green' : 'neutral') +
      card('Failed', s.failed, s.failed ? 'retryable' : 'none', s.failed ? 'red' : 'neutral') +
      card('Cached', s.cached, 'reused', s.cached ? 'purple' : 'neutral') +
      card('Skipped', s.skipped, 'duplicates', 'neutral');

    var jobsSorted = research.jobs.slice().sort(function (a, b) {
      var order = { researching: 0, pending: 1, queued: 1, failed: 2, completed: 3, cached: 4, skipped: 5 };
      return (order[a.status] - order[b.status]);
    });

    wrap.innerHTML =
      '<div class="rq-bar">' +
        '<div class="rq-progress-wrap"><div class="rq-progress-top"><span>Queue Progress</span><span>' + s.progress + '%</span></div>' +
        '<div class="rq-progress"><div class="rq-progress-f" style="width:' + s.progress + '%"></div></div>' +
        '<div class="rq-progress-meta">' +
          (current ? 'Researching <b>' + esc(current.companyName) + '</b> · ' : '') +
          s.remaining + ' remaining · ETA ' + eta + ' · Provider: ' + esc(providerMode) +
        '</div></div>' +
        '<div class="rq-actions">' +
          '<button class="btn-p" id="rq-start"' + (canStart ? '' : ' disabled') + '>' + (running ? '<span class="spinner"></span>Researching…' : 'Start Research') + '</button>' +
          '<button class="btn-g" id="rq-retry"' + (canRetry ? '' : ' disabled') + '>Retry Failed</button>' +
        '</div>' +
      '</div>' +
      (running ? '<div class="load-note"><span class="spinner spinner-p"></span>Contacting Tavily and enriching companies with live web intelligence… this usually takes a moment.</div>' : '') +
      '<div class="rq-summary">' + cards + '</div>' +
      '<div class="val-section-lbl" style="margin-top:24px">Research jobs · ' + s.total + '</div>' +
      '<div class="leads-tbl"><div class="tbl-head rq-cols">' +
        '<div>Company</div><div>Status</div><div>Retries</div><div>Started</div><div>Completed</div><div>Last Error</div>' +
      '</div>' + jobsSorted.map(jobRow).join('') + '</div>';

    var startBtn = $('rq-start'); if (startBtn && canStart) { startBtn.addEventListener('click', startResearch); }
    var retryBtn = $('rq-retry'); if (retryBtn && canRetry) { retryBtn.addEventListener('click', retryFailed); }
  }

  function init() {
    if (!$('research-content')) { return; }
    var CRMStore = api().CRMStore;
    if (CRMStore) { CRMStore.subscribe(render); }
    render();
  }

  if (document.readyState !== 'loading') { init(); } else { document.addEventListener('DOMContentLoaded', init); }
  root.ALIP = root.ALIP || {};
  root.ALIP.ResearchView = { render: render };
})(typeof self !== 'undefined' ? self : this);
