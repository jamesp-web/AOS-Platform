/**
 * ALIP · ResearchJob (domain)
 * ---------------------------------------------------------------------------
 * The unit of work for AI enrichment: one research job per unique company.
 * Defines the status lifecycle and pure transition helpers (each returns a new
 * job object — no mutation, so state changes are traceable and testable).
 *
 *   pending → queued → researching → completed
 *                                  ↘ failed  (retryable → back to pending)
 *   pending → skipped   (duplicate of another company)
 *   pending → cached    (fresh prior research reused, no Tavily call)
 *
 * Mirrors future backend model: backend/models/research_job.py
 */
(function (root) {
  'use strict';

  var STATUS = {
    PENDING: 'pending',
    QUEUED: 'queued',
    RESEARCHING: 'researching',
    COMPLETED: 'completed',
    FAILED: 'failed',
    SKIPPED: 'skipped',
    CACHED: 'cached'
  };

  var LABELS = {
    pending: 'Pending', queued: 'Queued', researching: 'Researching',
    completed: 'Completed', failed: 'Failed', skipped: 'Skipped', cached: 'Cached'
  };

  /** Statuses that are "finished" (the runner will not process them). */
  var TERMINAL = { completed: 1, cached: 1, skipped: 1 };

  var RESEARCH_VERSION = 'v1';

  function now() { return new Date().toISOString(); }
  function clone(job) { var c = {}; for (var k in job) { c[k] = job[k]; } return c; }

  function create(company) {
    return {
      companyId: company.id,
      companyName: (company.crm && company.crm.brandName) || company.brandName || '',
      status: STATUS.PENDING,
      createdAt: now(),
      startedAt: null,
      completedAt: null,
      retryCount: 0,
      lastError: null,
      researchVersion: RESEARCH_VERSION
    };
  }

  function toQueued(job)      { var j = clone(job); j.status = STATUS.QUEUED; return j; }
  function toResearching(job) { var j = clone(job); j.status = STATUS.RESEARCHING; j.startedAt = now(); j.lastError = null; return j; }
  function toCompleted(job)   { var j = clone(job); j.status = STATUS.COMPLETED; j.completedAt = now(); j.lastError = null; return j; }
  function toCached(job)      { var j = clone(job); j.status = STATUS.CACHED; j.completedAt = now(); j.lastError = null; return j; }
  function toSkipped(job, reason) { var j = clone(job); j.status = STATUS.SKIPPED; j.completedAt = now(); j.lastError = reason || null; return j; }
  function toFailed(job, error) { var j = clone(job); j.status = STATUS.FAILED; j.completedAt = now(); j.retryCount = (job.retryCount || 0) + 1; j.lastError = String(error && error.message ? error.message : error); return j; }
  /** Reset a failed job so it can be retried. */
  function toRetry(job)      { var j = clone(job); j.status = STATUS.PENDING; j.startedAt = null; j.completedAt = null; return j; }

  var ResearchJob = {
    STATUS: STATUS, LABELS: LABELS, TERMINAL: TERMINAL, RESEARCH_VERSION: RESEARCH_VERSION,
    create: create,
    toQueued: toQueued, toResearching: toResearching, toCompleted: toCompleted,
    toCached: toCached, toSkipped: toSkipped, toFailed: toFailed, toRetry: toRetry
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = ResearchJob; }
  else { root.ALIP = root.ALIP || {}; root.ALIP.ResearchJob = ResearchJob; }
})(typeof self !== 'undefined' ? self : this);
