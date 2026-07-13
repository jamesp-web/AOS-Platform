/**
 * ALIP · ApiClient (service — Phase 8)
 * ---------------------------------------------------------------------------
 * Thin wrapper around the FastAPI backend. This is the ONLY module that talks
 * to the network. The browser never calls OpenAI / Tavily / Supabase — it calls
 * these endpoints, and the backend does the rest with its own keys.
 *
 * Base URL is configurable via localStorage 'alip.api.base'
 * (default http://127.0.0.1:8000/api). Set 'alip.api.disabled'='1' to force the
 * offline local pipeline.
 */
(function (root) {
  'use strict';

  var DEFAULT_BASE = 'http://127.0.0.1:8000/api';   // local dev default

  function ls(k) { try { return root.localStorage && root.localStorage.getItem(k); } catch (e) { return null; } }
  // Resolve the API base for any environment:
  //   1) localStorage 'alip.api.base'  — manual override
  //   2) window.ALIP_API_BASE          — deploy-time config
  //   3) localhost / file://           — local backend on :8000
  //   4) deployed                      — same-origin '/api' (use a Vercel rewrite to proxy to the backend)
  function defaultBase() {
    if (root.ALIP_API_BASE) { return String(root.ALIP_API_BASE); }
    var loc = root.location || {}, host = loc.hostname || '';
    if (loc.protocol === 'file:' || host === '' || host === 'localhost' || host === '127.0.0.1') { return DEFAULT_BASE; }
    return (loc.origin || '') + '/api';
  }
  function base() { return (ls('alip.api.base') || defaultBase()).replace(/\/$/, ''); }
  function disabled() { return ls('alip.api.disabled') === '1'; }
  function fetchFn() { return root.fetch || (typeof fetch !== 'undefined' ? fetch : null); }

  function req(path, opts) {
    var f = fetchFn();
    if (!f) { return Promise.reject(new Error('fetch unavailable')); }
    return f(base() + path, opts).then(function (res) {
      return res.text().then(function (txt) {
        var body; try { body = txt ? JSON.parse(txt) : {}; } catch (e) { body = { raw: txt }; }
        if (!res.ok) {
          var msg = (body && (body.detail || body.error)) || ('HTTP ' + res.status);
          var err = new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
          err.status = res.status;
          throw err;
        }
        return body;
      });
    });
  }
  function postJson(path, obj) {
    return req(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj || {}) });
  }

  /** Is the backend reachable? Resolves true/false (never rejects). */
  function health() {
    var f = fetchFn();
    if (!f || disabled()) { return Promise.resolve(false); }
    return f(base().replace(/\/api$/, '') + '/health').then(function (r) { return r.ok; }).catch(function () { return false; });
  }

  function upload(file, filename) {
    var fd = new (root.FormData || FormData)();
    fd.append('file', file, filename || (file && file.name) || 'crm.xlsx');
    return req('/upload', { method: 'POST', body: fd });
  }

  var ApiClient = {
    DEFAULT_BASE: DEFAULT_BASE,
    base: base, isDisabled: disabled, health: health,
    upload: upload,
    session: function (sid) { return req('/session/' + encodeURIComponent(sid)); },
    sessions: function () { return req('/sessions'); },
    deleteSession: function (sid) { return req('/session/' + encodeURIComponent(sid), { method: 'DELETE' }); },
    startResearch: function (sid, limit) { var b = { session_id: sid }; if (limit != null) { b.limit = limit; } return postJson('/research/start', b); },
    retryResearch: function (sid) { return postJson('/research/retry', { session_id: sid }); },
    researchStatus: function (sid) { return req('/research/status?session_id=' + encodeURIComponent(sid)); },
    analyze: function (sid, rescore, limit) { var b = { session_id: sid, rescore: rescore !== false }; if (limit != null) { b.limit = limit; } return postJson('/analyze', b); },
    companies: function (sid) { return req('/companies?session_id=' + encodeURIComponent(sid)); },
    company: function (sid, id) { return req('/company/' + encodeURIComponent(id) + '?session_id=' + encodeURIComponent(sid)); },
    enrichCompany: function (sid, id, force) { return postJson('/company/' + encodeURIComponent(id) + '/enrich', { session_id: sid, force: !!force }); },
    dashboard: function (sid) { return req('/dashboard?session_id=' + encodeURIComponent(sid)); },
    founderInsights: function (sid) { return req('/founder-insights?session_id=' + encodeURIComponent(sid)); },
    /** Download the enriched .xlsx as a Blob (browser). */
    exportBlob: function (sid) {
      return fetchFn()(base() + '/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ session_id: sid }) })
        .then(function (res) { if (!res.ok) { throw new Error('Export failed (HTTP ' + res.status + ')'); } return res.blob(); });
    }
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = ApiClient; }
  else { root.ALIP = root.ALIP || {}; root.ALIP.ApiClient = ApiClient; }
})(typeof self !== 'undefined' ? self : this);
