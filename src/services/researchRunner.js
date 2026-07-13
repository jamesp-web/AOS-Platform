/**
 * ALIP · ResearchRunner (service — Phase 3 orchestration)
 * ---------------------------------------------------------------------------
 * Drives the queue: for each PENDING job it reuses fresh cached research
 * (→ Cached) or calls the provider (→ Researching → Completed / Failed). One
 * company's failure never stops the rest. Tavily results are written into the
 * company intelligence object at `company.ai.research`; OpenAI-derived fields
 * are left untouched (Phase 4).
 *
 * `processJobs` is provider- and store-agnostic (inject anything) so it is
 * unit-testable; `run` is the thin CRMStore + TavilyService wrapper for the UI.
 *
 * Mirrors future backend service: backend/services/research_runner.py
 */
(function (root) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);
  var Normalize   = isNode ? require('../domain/normalize.js')  : (root.ALIP && root.ALIP.Normalize);
  var ResearchJob = isNode ? require('../domain/researchJob.js') : (root.ALIP && root.ALIP.ResearchJob);

  var DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days

  function memoryCache() {
    var m = {};
    return { get: function (k) { return m[k]; }, set: function (k, v) { m[k] = v; } };
  }
  function isFresh(entry, ttlMs) {
    return entry && entry.fetchedAt && (Date.now() - entry.fetchedAt) < ttlMs;
  }
  function cacheKey(company) {
    var crm = company.crm || company;
    return Normalize.name(crm.brandName).clean || crm.brandName;
  }
  function applyResult(company, result, source) {
    company.ai = company.ai || {};
    company.ai.research = result;
    company.ai.researchStatus = source;     // 'done' | 'cached'
  }
  function findJob(jobs, id) {
    for (var i = 0; i < jobs.length; i++) { if (jobs[i].companyId === id) { return jobs[i]; } }
    return null;
  }
  function replaceJob(jobs, job) {
    for (var i = 0; i < jobs.length; i++) { if (jobs[i].companyId === job.companyId) { jobs[i] = job; return; } }
  }

  /**
   * Process every pending job sequentially.
   * @param {Object[]} companies canonical companies (mutated: ai.research)
   * @param {Object[]} jobs      research jobs (mutated: status/timestamps)
   * @param {{research:Function}} provider
   * @param {Object} opts { cache, ttlMs, onUpdate(jobs, companies) }
   * @returns {Promise<{jobs, companies}>}
   */
  function processJobs(companies, jobs, provider, opts) {
    opts = opts || {};
    var cache = opts.cache || memoryCache();
    var ttlMs = opts.ttlMs != null ? opts.ttlMs : DEFAULT_TTL_MS;
    var onUpdate = opts.onUpdate || function () {};

    var byId = {};
    companies.forEach(function (c) { byId[c.id] = c; });

    var pending = jobs.filter(function (j) {
      return j.status === ResearchJob.STATUS.PENDING || j.status === ResearchJob.STATUS.QUEUED;
    });

    var chain = Promise.resolve();
    pending.forEach(function (job0) {
      chain = chain.then(function () {
        var company = byId[job0.companyId];
        if (!company) { return; }
        var key = cacheKey(company);

        var cached = cache.get(key);
        if (isFresh(cached, ttlMs)) {
          applyResult(company, cached.result, 'cached');
          replaceJob(jobs, ResearchJob.toCached(findJob(jobs, job0.companyId)));
          onUpdate(jobs, companies);
          return;
        }

        replaceJob(jobs, ResearchJob.toResearching(findJob(jobs, job0.companyId)));
        onUpdate(jobs, companies);

        return Promise.resolve()
          .then(function () { return provider.research(company); })
          .then(function (result) {
            applyResult(company, result, 'done');
            cache.set(key, { result: result, fetchedAt: Date.now() });
            replaceJob(jobs, ResearchJob.toCompleted(findJob(jobs, job0.companyId)));
            onUpdate(jobs, companies);
          })
          .catch(function (err) {
            if (company.ai) { company.ai.researchStatus = 'failed'; }
            replaceJob(jobs, ResearchJob.toFailed(findJob(jobs, job0.companyId), err));
            onUpdate(jobs, companies);           // isolated failure — keep going
          });
      });
    });

    return chain.then(function () { return { jobs: jobs, companies: companies }; });
  }

  /** Browser entry point: wires CRMStore + TavilyService (or an injected provider). */
  function run(store, provider, opts) {
    opts = opts || {};
    var research = store.getResearch();
    if (!research || !research.jobs) { return Promise.resolve(null); }
    var companies = store.getCompanies().map(function (c) { return c; });
    var jobs = research.jobs.slice();
    provider = provider || (root.ALIP && root.ALIP.TavilyService);

    // persistent cache backed by the store
    var cache = {
      get: function (k) { return store.getResearchCache()[k]; },
      set: function (k, v) { store.setResearchCacheEntry(k, v); }
    };

    return processJobs(companies, jobs, provider, {
      cache: cache,
      ttlMs: opts.ttlMs,
      onUpdate: function (jobs, companies) {
        store.setCompanies(companies);
        store.setResearch({ jobs: jobs, version: research.version, builtAt: research.builtAt, lastRunAt: new Date().toISOString() });
      }
    });
  }

  var ResearchRunner = { processJobs: processJobs, run: run, DEFAULT_TTL_MS: DEFAULT_TTL_MS };

  if (isNode) { module.exports = ResearchRunner; }
  else { root.ALIP = root.ALIP || {}; root.ALIP.ResearchRunner = ResearchRunner; }
})(typeof self !== 'undefined' ? self : this);
