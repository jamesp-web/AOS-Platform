/**
 * ALIP · OpenAIService (service — Phase 6)
 * ---------------------------------------------------------------------------
 * The real OpenAI integration. Takes a company name + Tavily research, calls
 * the Chat Completions API with the (separate) analyst prompt, and returns
 * ONLY structured JSON. It never scores, ranks or recommends — that stays in
 * the deterministic engine.
 *
 * Resilient by contract — it NEVER throws and NEVER crashes the pipeline. It
 * resolves to { ok:true, data } or { ok:false, code, error } after handling:
 *   • Rate limits (429)        → retry with backoff (honours Retry-After)
 *   • Server errors (5xx)      → retry with backoff
 *   • Timeouts                 → AbortController + retry, then graceful error
 *   • Network failures         → retry, then graceful error
 *   • Invalid JSON             → salvage, else graceful error
 *   • Unknown/unavailable model→ one-time fallback to a known model
 *
 * Model is configurable (localStorage 'alip.openai.model'); default targets the
 * latest model with a graceful fallback so it works as models evolve.
 */
(function (root) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);
  var Prompt = isNode ? require('../prompts/analystPrompt.js') : (root.ALIP && root.ALIP.AnalystPrompt);

  var OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
  var KEY_STORAGE = 'alip.openai.apiKey';
  var MODEL_STORAGE = 'alip.openai.model';
  var DEFAULT_MODEL = 'gpt-5.5';          // configurable; falls back if unavailable
  var FALLBACK_MODEL = 'gpt-4o-mini';
  var DEFAULT_TIMEOUT = 30000;
  var DEFAULT_RETRIES = 3;
  var MAX_BACKOFF = 20000;

  function ls(key) { try { return (root.localStorage && root.localStorage.getItem(key)) || ''; } catch (e) { return ''; } }
  function getApiKey() { return ls(KEY_STORAGE); }
  function getModel() { return ls(MODEL_STORAGE) || DEFAULT_MODEL; }
  function timers() { return { set: root.setTimeout || setTimeout, clear: root.clearTimeout || clearTimeout }; }
  function delay(ms) { var t = timers(); return new Promise(function (r) { t.set(r, ms); }); }

  function backoff(n, retryAfterSec) {
    if (retryAfterSec > 0) { return Math.min(retryAfterSec * 1000, MAX_BACKOFF); }
    return Math.min(500 * Math.pow(2, n) + Math.floor(Math.random() * 250), 8000);
  }
  function isModelError(text) {
    text = String(text || '').toLowerCase();
    return text.indexOf('model') !== -1 &&
      (text.indexOf('does not exist') !== -1 || text.indexOf('not found') !== -1 ||
       text.indexOf('invalid') !== -1 || text.indexOf('unknown') !== -1 || text.indexOf('unsupported') !== -1);
  }

  /** Parse the model's message content into JSON, salvaging a JSON object if needed. */
  function extractJson(content) {
    if (content == null || content === '') { throw new Error('empty content'); }
    try { return JSON.parse(content); }
    catch (e) {
      var m = String(content).match(/\{[\s\S]*\}/);
      if (m) { return JSON.parse(m[0]); }
      throw e;
    }
  }

  function callOnce(fetchFn, apiKey, body, timeoutMs) {
    var AC = root.AbortController || (isNode && typeof global !== 'undefined' ? global.AbortController : null);
    var ctrl = AC ? new AC() : null;
    var t = timers();
    var timer = ctrl ? t.set(function () { try { ctrl.abort(); } catch (e) {} }, timeoutMs) : null;
    function clear() { if (timer) { t.clear(timer); timer = null; } }

    var p;
    try {
      p = fetchFn(OPENAI_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
        body: JSON.stringify(body),
        signal: ctrl ? ctrl.signal : undefined
      });
    } catch (e) { clear(); return Promise.reject(e); }

    return p.then(function (res) {
      clear();
      var ra = (res.headers && res.headers.get) ? parseFloat(res.headers.get('retry-after')) : NaN;
      var retryAfter = isNaN(ra) ? 0 : ra;
      if (!res.ok) {
        return res.text().then(
          function (txt) { return { ok: false, status: res.status, errText: String(txt || '').slice(0, 300), retryAfter: retryAfter }; },
          function () { return { ok: false, status: res.status, errText: '', retryAfter: retryAfter }; }
        );
      }
      return res.json().then(function (j) { return { ok: true, status: res.status, json: j }; });
    }, function (err) { clear(); throw err; });
  }

  /**
   * Analyse one company. Never throws.
   * @param {{companyName:string, research:Object}} input
   * @param {Object} [opts] { fetch, apiKey, model, timeoutMs, maxRetries }
   * @returns {Promise<{ok:boolean, data?:Object, code?:string, error?:string, model?:string}>}
   */
  function analyze(input, opts) {
    opts = opts || {};
    var fetchFn = opts.fetch || root.fetch || (isNode && typeof global !== 'undefined' ? global.fetch : null);
    var apiKey = opts.apiKey || getApiKey();
    var timeoutMs = opts.timeoutMs || DEFAULT_TIMEOUT;
    var maxRetries = opts.maxRetries != null ? opts.maxRetries : DEFAULT_RETRIES;
    var startModel = opts.model || getModel();

    if (!apiKey) { return Promise.resolve({ ok: false, code: 'no_key', error: 'No OpenAI API key configured' }); }
    if (!fetchFn) { return Promise.resolve({ ok: false, code: 'no_fetch', error: 'No fetch implementation available' }); }
    if (!Prompt) { return Promise.resolve({ ok: false, code: 'no_prompt', error: 'Analyst prompt not loaded' }); }

    var messages = [{ role: 'system', content: Prompt.SYSTEM }, { role: 'user', content: Prompt.buildUser(input) }];

    function attempt(n, model) {
      var body = { model: model, temperature: 0, response_format: { type: 'json_object' }, messages: messages };
      return callOnce(fetchFn, apiKey, body, timeoutMs).then(function (r) {
        if (r.ok) {
          try {
            var choice = r.json && r.json.choices && r.json.choices[0];
            var content = choice && choice.message && choice.message.content;
            return { ok: true, data: extractJson(content), model: model };
          } catch (e) {
            return { ok: false, code: 'invalid_json', error: 'Model returned invalid JSON' };
          }
        }
        if ((r.status === 429 || r.status >= 500) && n < maxRetries) {
          return delay(backoff(n, r.retryAfter)).then(function () { return attempt(n + 1, model); });
        }
        if ((r.status === 404 || r.status === 400) && isModelError(r.errText) && model !== FALLBACK_MODEL) {
          return attempt(0, FALLBACK_MODEL);   // graceful, one-time model fallback
        }
        return { ok: false, code: 'http_' + r.status, error: 'OpenAI HTTP ' + r.status + (r.errText ? ': ' + r.errText : '') };
      }, function (err) {
        var aborted = err && (err.name === 'AbortError' || /abort/i.test(String(err.message || err)));
        if (n < maxRetries) { return delay(backoff(n)).then(function () { return attempt(n + 1, model); }); }
        return { ok: false, code: aborted ? 'timeout' : 'network', error: aborted ? 'OpenAI request timed out' : 'OpenAI request failed: ' + (err && err.message || err) };
      });
    }

    return attempt(0, startModel);
  }

  var OpenAIService = {
    KEY_STORAGE: KEY_STORAGE, MODEL_STORAGE: MODEL_STORAGE,
    DEFAULT_MODEL: DEFAULT_MODEL, FALLBACK_MODEL: FALLBACK_MODEL,
    getApiKey: getApiKey, getModel: getModel, analyze: analyze,
    _extractJson: extractJson, _backoff: backoff, _isModelError: isModelError
  };

  if (isNode) { module.exports = OpenAIService; }
  else { root.ALIP = root.ALIP || {}; root.ALIP.OpenAIService = OpenAIService; }
})(typeof self !== 'undefined' ? self : this);
