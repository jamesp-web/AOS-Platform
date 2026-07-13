/**
 * ALIP · ResearchQueue (service)
 * ---------------------------------------------------------------------------
 * Turns the validated CRM into a queue of research jobs — one per UNIQUE
 * company. Exact/fuzzy duplicates are collapsed (a representative is researched;
 * the rest are Skipped as "duplicate of X"), so Tavily is never called twice for
 * the same company. Business-group members are distinct brands → each queued.
 *
 * Pure orchestration (no network, no DOM). Mirrors future backend service:
 * backend/services/research_queue.py
 */
(function (root) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);
  var ResearchJob = isNode ? require('../domain/researchJob.js') : (root.ALIP && root.ALIP.ResearchJob);

  /** Minimal union-find for clustering duplicate pairs. */
  function makeUF(ids) {
    var parent = {};
    ids.forEach(function (id) { parent[id] = id; });
    function find(x) { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; }
    function union(a, b) { var ra = find(a), rb = find(b); if (ra !== rb) { parent[ra] = rb; } }
    return { find: find, union: union };
  }

  /**
   * Build the initial queue from canonical companies + a validation report.
   * @returns {{ jobs: Object[], version: string, builtAt: string }}
   */
  function build(companies, validationReport) {
    companies = companies || [];
    var uf = makeUF(companies.map(function (c) { return c.id; }));

    // Collapse only identity duplicates (exact + fuzzy). Business/conflict links
    // do NOT merge identity — those remain separately researchable / same entity.
    var dups = (validationReport && validationReport.duplicates) || [];
    dups.forEach(function (d) {
      if (d.type === 'exact' || d.type === 'fuzzy') {
        uf.union(d.members[0].id, d.members[1].id);
      }
    });

    // Group companies by cluster root, preserving input order.
    var clusters = {};
    companies.forEach(function (c) {
      var r = uf.find(c.id);
      (clusters[r] = clusters[r] || []).push(c);
    });

    var byId = {};
    companies.forEach(function (c) { byId[c.id] = c; });

    var jobs = companies.map(function (c) {
      var rep = clusters[uf.find(c.id)][0];       // first company in the cluster is the representative
      var job = ResearchJob.create(c);
      if (rep.id !== c.id) {
        job = ResearchJob.toSkipped(job, 'Duplicate of ' + ((rep.crm && rep.crm.brandName) || rep.id));
      }
      return job;
    });

    return { jobs: jobs, version: ResearchJob.RESEARCH_VERSION, builtAt: new Date().toISOString() };
  }

  /** Aggregate queue statistics for the dashboard/queue page. */
  function stats(jobs) {
    jobs = jobs || [];
    var s = { total: jobs.length, pending: 0, queued: 0, researching: 0, completed: 0, failed: 0, skipped: 0, cached: 0 };
    jobs.forEach(function (j) { if (s[j.status] != null) { s[j.status]++; } });

    var finished = s.completed + s.cached + s.skipped + s.failed;
    var processable = s.total - s.skipped;                       // skipped never needs work
    var done = s.completed + s.cached;
    s.progress = processable > 0 ? Math.round((done / processable) * 100) : 100;
    s.remaining = s.pending + s.queued + s.researching;
    s.finished = finished;
    // rough ETA: ~1.2s per remaining research (Tavily latency estimate)
    s.etaSeconds = s.remaining * 1.2;
    return s;
  }

  /** IDs of jobs still needing work, in order. */
  function pendingJobs(jobs) {
    return (jobs || []).filter(function (j) {
      return j.status === ResearchJob.STATUS.PENDING || j.status === ResearchJob.STATUS.QUEUED;
    });
  }

  /** Reset failed jobs back to pending for a retry pass. */
  function resetFailed(jobs) {
    return (jobs || []).map(function (j) {
      return j.status === ResearchJob.STATUS.FAILED ? ResearchJob.toRetry(j) : j;
    });
  }

  var ResearchQueue = { build: build, stats: stats, pendingJobs: pendingJobs, resetFailed: resetFailed };

  if (isNode) { module.exports = ResearchQueue; }
  else { root.ALIP = root.ALIP || {}; root.ALIP.ResearchQueue = ResearchQueue; }
})(typeof self !== 'undefined' ? self : this);
