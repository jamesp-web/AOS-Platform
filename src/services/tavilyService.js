/**
 * ALIP · TavilyService (service — Phase 3)
 * ---------------------------------------------------------------------------
 * Company research provider. One clean interface — research(company) → Promise
 * — with two implementations behind it:
 *
 *   • liveResearch(): real Tavily /search call, used when an API key is set.
 *   • stubResearch(): deterministic offline research, used when no key is set,
 *     so the whole pipeline (queue → researching → completed) is demonstrable
 *     and unit-testable without a backend.
 *
 * SECURITY NOTE: calling Tavily directly from the browser exposes the API key
 * and is subject to CORS. For production this exact request belongs in the
 * FastAPI backend (backend/services/tavily_service.py) as a proxy; the request
 * shape here is intentionally identical so that move is a copy-paste.
 */
(function (root) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);
  var Normalize = isNode ? require('../domain/normalize.js') : (root.ALIP && root.ALIP.Normalize);

  var TAVILY_URL = 'https://api.tavily.com/search';
  var KEY_STORAGE = 'alip.tavily.apiKey';

  function getApiKey() {
    try { return (root.localStorage && root.localStorage.getItem(KEY_STORAGE)) || ''; }
    catch (e) { return ''; }
  }
  function hasApiKey() { return !!getApiKey(); }

  function buildQuery(company) {
    var crm = company.crm || company;
    return '"' + crm.brandName + '" company India — industry, business profile, ' +
           'advertising activity, financial health, hiring and expansion news';
  }

  /** Real Tavily call. Resolves to the normalised research result. */
  function liveResearch(company, apiKey) {
    var query = buildQuery(company);
    return fetch(TAVILY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey, query: query, search_depth: 'basic',
        max_results: 5, include_answer: true
      })
    }).then(function (res) {
      if (!res.ok) { throw new Error('Tavily HTTP ' + res.status); }
      return res.json();
    }).then(function (data) {
      return {
        provider: 'tavily',
        query: query,
        answer: data.answer || '',
        sources: (data.results || []).map(function (r) {
          return { title: r.title, url: r.url, snippet: (r.content || '').slice(0, 400) };
        }),
        fetchedAt: new Date().toISOString()
      };
    });
  }

  /** Deterministic offline research (demo / tests). Never throws. */
  function stubResearch(company) {
    var crm = company.crm || company;
    var q = buildQuery(company);
    var slug = Normalize.name(crm.brandName).clean.replace(/\s+/g, '-') || 'company';
    var result = {
      provider: 'stub',
      query: q,
      answer: crm.brandName + ' is an active brand in the Indian market. Public sources indicate ongoing ' +
              'commercial activity relevant to out-of-home advertising evaluation.',
      sources: [
        { title: crm.brandName + ' — Official', url: 'https://example.com/' + slug, snippet: 'Company overview and offerings for ' + crm.brandName + '.' },
        { title: crm.brandName + ' — News', url: 'https://news.example.com/' + slug, snippet: 'Recent business updates, hiring and expansion signals.' },
        { title: crm.brandName + ' — Directory', url: 'https://dir.example.com/' + slug, snippet: 'Industry classification and location details.' }
      ],
      fetchedAt: new Date().toISOString()
    };
    return new Promise(function (resolve) {
      // small simulated latency so queue progress is visible in the UI
      if (root.setTimeout) { root.setTimeout(function () { resolve(result); }, 180); }
      else { resolve(result); }
    });
  }

  /** Public interface used by the runner. Chooses live vs stub automatically. */
  function research(company) {
    var key = getApiKey();
    return key ? liveResearch(company, key) : stubResearch(company);
  }

  var TavilyService = {
    KEY_STORAGE: KEY_STORAGE,
    getApiKey: getApiKey, hasApiKey: hasApiKey,
    buildQuery: buildQuery, liveResearch: liveResearch, stubResearch: stubResearch,
    research: research
  };

  if (isNode) { module.exports = TavilyService; }
  else { root.ALIP = root.ALIP || {}; root.ALIP.TavilyService = TavilyService; }
})(typeof self !== 'undefined' ? self : this);
