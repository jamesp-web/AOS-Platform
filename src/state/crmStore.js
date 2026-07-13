/**
 * ALIP · CRMStore (state)
 * ---------------------------------------------------------------------------
 * Single source of truth for uploaded CRM data. Phase 1 stores the raw
 * extracted companies; later phases (dedup, research, AI merge) will extend
 * the same record shape so the pipeline stays additive.
 *
 * Persists to localStorage so an upload survives a page refresh, and exposes
 * a tiny pub/sub so any view can react without tight coupling.
 *
 * Mirrors future backend persistence: Supabase `crm_uploads` / `companies`.
 */
(function (root) {
  'use strict';

  var STORAGE_KEY = 'alip.crm.v1';

  function emptyState() {
    return { fileName: null, sheetName: null, uploadedAt: null, companies: [], mapping: null, skipped: 0, validation: null, research: null, researchCache: {}, sessionId: null };
  }

  var state = emptyState();
  var listeners = [];

  function load() {
    try {
      var raw = root.localStorage && root.localStorage.getItem(STORAGE_KEY);
      if (raw) { state = JSON.parse(raw); }
    } catch (e) { /* corrupt payload -> keep empty state */ }
    return state;
  }

  function persist() {
    try {
      if (root.localStorage) { root.localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    } catch (e) { /* storage full / disabled -> stay in-memory */ }
  }

  function emit() {
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](state); } catch (e) { /* isolate listener errors */ }
    }
  }

  function get() { return state; }

  /** Replace the current upload with a fresh extraction result. */
  function setUpload(result) {
    var keepCache = state.researchCache || {};   // research cache survives new uploads
    state = {
      fileName: result.fileName || null,
      sheetName: result.sheetName || null,
      uploadedAt: new Date().toISOString(),
      companies: result.companies || [],
      mapping: result.mapping || null,
      skipped: result.skipped || 0,
      validation: null,                // invalidated until re-analysed
      research: null,                  // queue rebuilt after validation
      researchCache: keepCache
    };
    persist();
    emit();
    return state;
  }

  /** Attach the Lead Validation report (Phase 2) to the current upload. */
  function setValidation(report) {
    state.validation = report || null;
    persist();
    emit();
    return state;
  }

  /** Research Queue (Phase 3): jobs container + persistent research cache. */
  function setResearch(research) { state.research = research || null; persist(); emit(); return state; }
  function getResearch() { return state.research; }
  function setCompanies(companies) { state.companies = companies || []; persist(); emit(); return state; }
  function getResearchCache() { return state.researchCache || (state.researchCache = {}); }
  function setResearchCacheEntry(key, value) { getResearchCache()[key] = value; persist(); }

  function getCompanies() { return state.companies || []; }
  function getValidation() { return state.validation; }
  function getSessionId() { return state.sessionId; }

  /**
   * Phase 8: replace the whole pipeline state from a backend session payload.
   * The backend returns the same canonical shapes the UI already renders, so
   * every view/selector keeps working unchanged.
   */
  function hydrate(payload) {
    payload = payload || {};
    state = {
      fileName: payload.file_name || payload.fileName || null,
      sheetName: payload.sheet_name || payload.sheetName || null,
      uploadedAt: new Date().toISOString(),
      companies: payload.companies || [],
      mapping: payload.mapping || null,
      skipped: payload.skipped || 0,
      validation: payload.validation || null,
      research: payload.research || null,
      researchCache: state.researchCache || {},
      sessionId: payload.session_id || payload.sessionId || state.sessionId || null
    };
    persist();
    emit();
    return state;
  }

  function clear() {
    state = emptyState();
    persist();
    emit();
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  function subscribe(fn) {
    listeners.push(fn);
    return function () { listeners = listeners.filter(function (l) { return l !== fn; }); };
  }

  var CRMStore = {
    get: get, getCompanies: getCompanies, getValidation: getValidation,
    getResearch: getResearch, getResearchCache: getResearchCache, getSessionId: getSessionId,
    setUpload: setUpload, setValidation: setValidation, setCompanies: setCompanies,
    setResearch: setResearch, setResearchCacheEntry: setResearchCacheEntry, hydrate: hydrate,
    clear: clear, subscribe: subscribe, load: load
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CRMStore;                     // Node (tests)
  } else {
    root.ALIP = root.ALIP || {};
    root.ALIP.CRMStore = CRMStore;                 // Browser
    load();                                        // restore persisted upload on boot
  }
})(typeof self !== 'undefined' ? self : this);
