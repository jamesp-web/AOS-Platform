/**
 * ALIP · Upload Controller (feature)
 * ---------------------------------------------------------------------------
 * Wires the "CRM Upload" page: drag & drop / file picker -> ExcelService ->
 * CRMStore -> render. Presentation only; all parsing lives in the service and
 * all state in the store. Reuses existing design-system classes (.card,
 * .leads-tbl, .tbl-head, .badge...) — no new visual language.
 *
 * Browser-only (guards on `document`).
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

  function dupBadge(value) {
    if (!value) { return '<span class="up-dash">—</span>'; }
    var t = String(value).toLowerCase();
    if (t.indexOf('dup') !== -1 || t.indexOf('conflict') !== -1) {
      return '<span class="badge bg-orange">' + esc(value) + '</span>';
    }
    if (t.indexOf('unique') !== -1 || t.indexOf('clean') !== -1 || t === 'no') {
      return '<span class="badge bg-green">' + esc(value) + '</span>';
    }
    return '<span class="badge bg-gray">' + esc(value) + '</span>';
  }

  function render() {
    var CRMStore = api().CRMStore;
    var wrap = $('upload-result');
    if (!CRMStore || !wrap) { return; }

    var s = CRMStore.get();
    if (!s.companies || !s.companies.length) { wrap.innerHTML = ''; return; }

    var missing = (s.mapping && s.mapping.missing) || [];
    var missNote = missing.length
      ? '<div class="up-note">Columns not present in this file: <b>' + missing.map(esc).join(', ') +
        '</b> — displayed as empty. The AI layer can still enrich them in later phases.</div>'
      : '';

    var rows = s.companies.map(function (c) {
      var crm = c.crm || c;                              // canonical shape (Phase 1 improvement)
      var initial = esc(((crm.brandName || '?').charAt(0)).toUpperCase());
      return '' +
        '<div class="tbl-row up-cols">' +
          '<div class="brand-cell">' +
            '<div class="br-av up-av">' + initial + '</div>' +
            '<div><div class="br-name">' + esc(crm.brandName) + '</div>' +
            '<div class="br-sub">' + esc(crm.brandId || '—') + '</div></div>' +
          '</div>' +
          '<div class="poc-cell">' + (crm.owner ? esc(crm.owner) : '<span class="up-dash">—</span>') + '</div>' +
          '<div>' + (crm.agency ? '<span class="badge bg-industry">' + esc(crm.agency) + '</span>' : '<span class="up-dash">—</span>') + '</div>' +
          '<div>' + dupBadge(crm.duplicateStatus) + '</div>' +
        '</div>';
    }).join('');

    var matched = (s.mapping && s.mapping.matched) || [];

    wrap.innerHTML = '' +
      '<div class="up-summary">' +
        '<div class="up-metric"><div class="up-m-val">' + s.companies.length + '</div><div class="up-m-lbl">Companies extracted</div></div>' +
        '<div class="up-metric"><div class="up-m-val">' + matched.length + '<span class="up-m-sub">/5</span></div><div class="up-m-lbl">CRM fields mapped</div></div>' +
        '<div class="up-metric"><div class="up-m-val">' + (s.skipped || 0) + '</div><div class="up-m-lbl">Rows skipped (no name)</div></div>' +
        '<div class="up-metric up-metric-file"><div class="up-m-lbl">Source file</div><div class="up-m-file">' + esc(s.fileName || '') + '</div></div>' +
      '</div>' +
      missNote +
      '<div class="leads-tbl" style="margin-top:16px">' +
        '<div class="tbl-head up-cols"><div>Brand / Brand ID</div><div>Owner</div><div>Agency</div><div>Duplicate Status</div></div>' +
        rows +
      '</div>';
  }

  function setStatus(msg, kind) {
    var el = $('upload-status');
    if (!el) { return; }
    el.textContent = msg || '';
    el.className = 'up-status' + (kind ? ' up-' + kind : '');
  }

  function apiEnabled() { var c = api().ApiClient; return !!(c && !c.isDisabled()); }

  function handleFile(file) {
    var a = api(), CRMStore = a.CRMStore, ApiClient = a.ApiClient;
    if (!CRMStore) { setStatus('Upload modules failed to load.', 'err'); return; }

    // Phase 8: upload through the backend API; the browser never parses/dedups here.
    if (apiEnabled() && ApiClient) {
      setStatus('Uploading “' + file.name + '” to the ALIP API …', 'loading');
      ApiClient.upload(file, file.name)
        .then(function (up) { return ApiClient.session(up.session_id); })
        .then(function (state) {
          CRMStore.hydrate(state);
          // Pin the URL to the new session so a refresh keeps THIS upload (not an older one).
          if (root.history && root.history.replaceState && state.session_id) {
            try { root.history.replaceState(null, '', '?session=' + encodeURIComponent(state.session_id)); } catch (e) {}
          }
          if (a.SessionSwitcher) { a.SessionSwitcher.refresh(); }
          setStatus('Extracted ' + (state.companies || []).length + ' companies · session ' + state.session_id, 'ok');
          render();
        })
        .catch(function (err) {
          console.warn('[ALIP] API upload failed — falling back to local pipeline:', err && err.message);
          localHandle(file);
        });
      return;
    }
    localHandle(file);
  }

  function localHandle(file) {
    var a = api();
    var svc = a.ExcelService, CRMStore = a.CRMStore, CompanyModel = a.CompanyModel,
        DuplicateService = a.DuplicateService, ResearchQueue = a.ResearchQueue;
    if (!svc || !CompanyModel) { setStatus('Upload modules failed to load.', 'err'); return; }

    setStatus('Reading “' + file.name + '” …', 'loading');
    svc.parseFile(file).then(function (result) {
      if (result.error) { setStatus(result.error, 'err'); return; }

      // Phase 1 improvements: wrap into canonical companies (unique id + AI placeholders).
      var companies = CompanyModel.buildCompanies(result.companies);
      CRMStore.setUpload({
        fileName: result.fileName, sheetName: result.sheetName,
        mapping: result.mapping, skipped: result.skipped, companies: companies
      });

      // Phase 2: run the Lead Validation Engine so the report is ready immediately.
      if (DuplicateService) { CRMStore.setValidation(DuplicateService.analyze(companies)); }

      // Phase 3: build the Research Queue (one job per unique company; duplicates skipped).
      if (ResearchQueue) { CRMStore.setResearch(ResearchQueue.build(companies, CRMStore.getValidation())); }

      setStatus('Extracted ' + companies.length + ' companies from “' + result.fileName + '”.', 'ok');
      render();
    }).catch(function (err) {
      setStatus(err.message || 'Something went wrong reading the file.', 'err');
    });
  }

  function init() {
    var zone = $('upload-zone');
    if (!zone) { return; }
    var input = $('upload-input');
    var browse = $('upload-browse');
    var clearBtn = $('upload-clear');

    if (browse) { browse.addEventListener('click', function () { input.click(); }); }
    if (zone) { zone.addEventListener('click', function (e) { if (e.target === zone || e.target.classList.contains('up-zone-inner') || e.target.closest('.up-zone-inner')) { input.click(); } }); }
    if (input) {
      input.addEventListener('change', function (e) {
        if (e.target.files && e.target.files[0]) { handleFile(e.target.files[0]); }
        input.value = '';
      });
    }

    ['dragover', 'dragenter'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.add('up-drag'); });
    });
    ['dragleave', 'dragend'].forEach(function (ev) {
      zone.addEventListener(ev, function (e) { e.preventDefault(); zone.classList.remove('up-drag'); });
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('up-drag');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) { handleFile(e.dataTransfer.files[0]); }
    });

    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        api().CRMStore.clear();
        setStatus('', '');
        render();
      });
    }

    render();  // restore any previously uploaded data
  }

  if (document.readyState !== 'loading') { init(); }
  else { document.addEventListener('DOMContentLoaded', init); }
})(typeof self !== 'undefined' ? self : this);
