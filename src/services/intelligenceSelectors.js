/**
 * ALIP · IntelligenceSelectors (service — Phase 5)
 * ---------------------------------------------------------------------------
 * The read/aggregation layer for the Executive Dashboard and the Companies /
 * Lead Intelligence pages. Pure functions over the single source of truth
 * (uploaded companies + validation report + research queue). No DOM, no store —
 * so every KPI, insight and chart is testable and derived only from real data.
 *
 * Defensive by design: works at every pipeline stage (post-upload → validated →
 * researched → scored), returning zeros/empties for data that doesn't exist yet.
 *
 * Mirrors future backend: backend/services/dashboard_service.py
 */
(function (root) {
  'use strict';

  function jobsByCompany(research) {
    var map = {};
    if (research && research.jobs) { research.jobs.forEach(function (j) { map[j.companyId] = j; }); }
    return map;
  }

  /** Per-company validation status derived from the report's detections. */
  function validationIndex(validation) {
    var idx = {};
    function ensure(id) { return idx[id] || (idx[id] = { flagged: false, duplicate: false, ownerConflict: false, agencyConflict: false, business: false, types: [] }); }
    if (validation && validation.duplicates) {
      validation.duplicates.forEach(function (d) {
        d.members.forEach(function (m) {
          var v = ensure(m.id);
          v.flagged = true;
          if (v.types.indexOf(d.type) === -1) { v.types.push(d.type); }
          if (d.type === 'exact' || d.type === 'fuzzy') { v.duplicate = true; }
          if (d.type === 'owner-conflict') { v.ownerConflict = true; }
          if (d.type === 'agency-conflict') { v.agencyConflict = true; }
          if (d.type === 'business') { v.business = true; }
        });
      });
    }
    return idx;
  }

  function industryOf(c) { return (c.ai && c.ai.intelligence && c.ai.intelligence.industry) || (c.ai && c.ai.industry) || null; }
  function recommendationOf(c) { return c.ai && c.ai.recommendation; }
  function scoreOf(c) { return c.ai && typeof c.ai.opportunityScore === 'number' ? c.ai.opportunityScore : null; }

  function topOf(counts) {
    var best = null, n = -1;
    Object.keys(counts).forEach(function (k) { if (counts[k] > n) { n = counts[k]; best = k; } });
    return best ? { label: best, count: n } : { label: '—', count: 0 };
  }

  /** The 14 executive KPIs. */
  function computeKpis(companies, validation, research) {
    companies = companies || [];
    var jobs = jobsByCompany(research);
    var vidx = validationIndex(validation);
    var vsum = (validation && validation.summary) || {};

    var k = {
      totalCompanies: companies.length,
      validated: 0, researchCompleted: 0, researchPending: 0, researchSkipped: 0,
      duplicateLeads: 0, ownerConflicts: vsum.ownerConflicts || 0, agencyConflicts: vsum.agencyConflicts || 0,
      highPriority: 0, priority: 0, reviewRequired: 0, deprioritized: 0,
      avgScore: 0, topIndustry: '—', topOwner: '—'
    };

    var scoreSum = 0, scoreN = 0, industryCounts = {}, ownerCounts = {}, dupCompanies = {};

    companies.forEach(function (c) {
      var v = vidx[c.id];
      if (v && v.duplicate) { dupCompanies[c.id] = 1; }
      if (!(v && v.duplicate)) { k.validated++; }

      var st = (jobs[c.id] && jobs[c.id].status) || (c.ai && c.ai.researchStatus) || 'pending';
      if (st === 'completed' || st === 'cached' || st === 'done') { k.researchCompleted++; }
      else if (st === 'skipped') { k.researchSkipped++; }
      else if (st === 'pending' || st === 'queued' || st === 'researching') { k.researchPending++; }

      var rec = recommendationOf(c);
      if (rec === 'High Priority') { k.highPriority++; }
      else if (rec === 'Priority') { k.priority++; }
      else if (rec === 'Review') { k.reviewRequired++; }
      else if (rec === 'Deprioritize') { k.deprioritized++; }

      var s = scoreOf(c);
      if (s != null) { scoreSum += s; scoreN++; }

      var ind = industryOf(c); if (ind) { industryCounts[ind] = (industryCounts[ind] || 0) + 1; }
      var owner = c.crm && c.crm.owner; if (owner) { ownerCounts[owner] = (ownerCounts[owner] || 0) + 1; }
    });

    k.duplicateLeads = Object.keys(dupCompanies).length;
    k.avgScore = scoreN ? Math.round(scoreSum / scoreN) : 0;
    k.topIndustry = topOf(industryCounts).label;
    k.topOwner = topOf(ownerCounts).label;
    k._industryCounts = industryCounts;
    k._ownerCounts = ownerCounts;
    return k;
  }

  /** Business insights in plain language — only those with meaningful numbers. */
  function co(n) { return n + (n === 1 ? ' company' : ' companies'); }
  function vb(n, sing, plur) { return n === 1 ? sing : plur; }

  function computeInsights(companies, validation, research) {
    var k = computeKpis(companies, validation, research);
    var out = [];
    var total = k.totalCompanies || 1;

    if (k.highPriority) { out.push(co(k.highPriority) + ' ' + vb(k.highPriority, 'is', 'are') + ' High Priority — prioritise outreach this week.'); }

    // top industry share of high-opportunity (High Priority + Priority) leads
    var hi = companies.filter(function (c) { var r = recommendationOf(c); return r === 'High Priority' || r === 'Priority'; });
    if (hi.length) {
      var byInd = {};
      hi.forEach(function (c) { var i = industryOf(c) || 'Unclassified'; byInd[i] = (byInd[i] || 0) + 1; });
      var t = topOf(byInd);
      out.push(t.label + ' contributes ' + Math.round((t.count / hi.length) * 100) + '% of high-opportunity leads.');
    }
    if (k.duplicateLeads) { out.push(co(k.duplicateLeads) + ' ' + vb(k.duplicateLeads, 'requires', 'require') + ' duplicate review before outreach.'); }
    if (k.ownerConflicts) { out.push(co(k.ownerConflicts) + ' ' + vb(k.ownerConflicts, 'has', 'have') + ' owner conflicts to resolve.'); }

    var lowAdv = companies.filter(function (c) {
      var a = c.ai && (c.ai.advertisingActivity || (c.ai.intelligence && c.ai.intelligence.advertisingActivity));
      return a === 'Low' || a === 'Inactive';
    }).length;
    if (lowAdv) { out.push(co(lowAdv) + ' ' + vb(lowAdv, 'shows', 'show') + ' low advertising activity — untapped DOOH potential.'); }

    if (k.researchCompleted) { out.push('Research has completed for ' + Math.round((k.researchCompleted / total) * 100) + '% of uploaded companies.'); }
    if (k.avgScore) { out.push('Average Opportunity Score across scored leads is ' + k.avgScore + '/100.'); }
    return out;
  }

  function countBy(companies, fn) {
    var c = {};
    companies.forEach(function (x) { var key = fn(x); if (key != null) { c[key] = (c[key] || 0) + 1; } });
    return c;
  }
  function sortedPairs(counts, limit) {
    var arr = Object.keys(counts).map(function (k) { return { label: k, value: counts[k] }; })
      .sort(function (a, b) { return b.value - a.value; });
    return limit ? arr.slice(0, limit) : arr;
  }

  /** Data for the 6 dashboard charts (label/value pairs). */
  function computeCharts(companies, validation, research) {
    companies = companies || [];
    var jobs = jobsByCompany(research);
    var vsum = (validation && validation.summary) || {};

    var scoreBuckets = { 'Deprioritize (<60)': 0, 'Review (60-74)': 0, 'Priority (75-89)': 0, 'High (90+)': 0 };
    companies.forEach(function (c) {
      var s = scoreOf(c); if (s == null) { return; }
      if (s >= 90) { scoreBuckets['High (90+)']++; }
      else if (s >= 75) { scoreBuckets['Priority (75-89)']++; }
      else if (s >= 60) { scoreBuckets['Review (60-74)']++; }
      else { scoreBuckets['Deprioritize (<60)']++; }
    });

    var research_ = { Completed: 0, Cached: 0, Pending: 0, Researching: 0, Failed: 0, Skipped: 0 };
    companies.forEach(function (c) {
      var st = (jobs[c.id] && jobs[c.id].status) || (c.ai && c.ai.researchStatus) || 'pending';
      if (st === 'completed' || st === 'done') { research_.Completed++; }
      else if (st === 'cached') { research_.Cached++; }
      else if (st === 'researching') { research_.Researching++; }
      else if (st === 'failed') { research_.Failed++; }
      else if (st === 'skipped') { research_.Skipped++; }
      else { research_.Pending++; }
    });

    var rec = { 'High Priority': 0, 'Priority': 0, 'Review': 0, 'Deprioritize': 0 };
    companies.forEach(function (c) { var r = recommendationOf(c); if (r && rec[r] != null) { rec[r]++; } });

    return {
      scoreDistribution: Object.keys(scoreBuckets).map(function (k) { return { label: k, value: scoreBuckets[k] }; }),
      industryDistribution: sortedPairs(countBy(companies, industryOf), 8),
      researchStatus: Object.keys(research_).map(function (k) { return { label: k, value: research_[k] }; }).filter(function (p) { return p.value > 0; }),
      recommendationDistribution: Object.keys(rec).map(function (k) { return { label: k, value: rec[k] }; }),
      duplicateTypes: [
        { label: 'Exact', value: vsum.exact || 0 }, { label: 'Fuzzy', value: vsum.fuzzy || 0 },
        { label: 'Business', value: vsum.business || 0 }, { label: 'Owner Conflict', value: vsum.ownerConflicts || 0 },
        { label: 'Agency Conflict', value: vsum.agencyConflicts || 0 }
      ],
      ownerDistribution: sortedPairs(countBy(companies, function (c) { return c.crm && c.crm.owner; }), 8)
    };
  }

  /** A flattened, display-ready view of one company for tables/detail. */
  function companyView(c, validation, research) {
    var vidx = validationIndex(validation);
    var jobs = jobsByCompany(research);
    var v = vidx[c.id] || { flagged: false, types: [] };
    var job = jobs[c.id];
    return {
      id: c.id, crm: c.crm, ai: c.ai || {},
      industry: industryOf(c) || '—',
      score: scoreOf(c),
      recommendation: recommendationOf(c) || null,
      researchStatus: (job && job.status) || (c.ai && c.ai.researchStatus) || 'pending',
      validationStatus: v.duplicate ? 'Duplicate' : (v.ownerConflict || v.agencyConflict) ? 'Conflict' : v.business ? 'Group' : 'Unique',
      validationTypes: v.types
    };
  }

  function topScored(companies, n) {
    return companies.filter(function (c) { return scoreOf(c) != null; })
      .sort(function (a, b) { return scoreOf(b) - scoreOf(a); }).slice(0, n || 3);
  }
  function researchStatusOf(c, jobs) { return (jobs[c.id] && jobs[c.id].status) || (c.ai && c.ai.researchStatus) || 'pending'; }

  /** AI Executive Brief: plain-English summary lines + recommended focus companies. */
  function computeExecutiveBrief(companies, validation, research) {
    companies = companies || [];
    var k = computeKpis(companies, validation, research);
    var vidx = validationIndex(validation);
    var lines = [];
    lines.push(co(k.totalCompanies) + ' uploaded from the CRM.');
    if (k.validated) { lines.push(co(k.validated) + ' successfully validated.'); }
    if (k.duplicateLeads) { lines.push(co(k.duplicateLeads) + ' ' + vb(k.duplicateLeads, 'was', 'were') + ' flagged as duplicates.'); }
    if (k.topIndustry && k.topIndustry !== '—') { lines.push(k.topIndustry + ' contributes the largest share of high-opportunity companies.'); }
    var conflicts = companies.filter(function (c) { var v = vidx[c.id]; return v && (v.ownerConflict || v.agencyConflict); }).length;
    if (conflicts) { lines.push(co(conflicts) + ' ' + vb(conflicts, 'requires', 'require') + ' manual review for owner or agency conflicts.'); }
    var researchable = k.totalCompanies - k.researchSkipped;
    if (k.researchCompleted) { lines.push('Research completion is ' + Math.round((k.researchCompleted / (researchable || 1)) * 100) + '%.'); }
    var focus = topScored(companies, 3).map(function (c) { return c.crm.brandName; });
    return { lines: lines, focus: focus, focusCompanies: topScored(companies, 3), kpis: k };
  }

  function prank(p) { return p === 'High' ? 0 : p === 'Medium' ? 1 : 2; }

  /** Sales Action Center: prioritised action cards generated from real data. */
  function computeActions(companies, validation, research) {
    companies = companies || [];
    var vidx = validationIndex(validation), jobs = jobsByCompany(research), actions = [];
    function add(c, type, action, reason, priority) {
      actions.push({ id: c.id, company: c.crm.brandName, owner: c.crm.owner || 'Unassigned', reason: reason, action: action, priority: priority, type: type });
    }
    topScored(companies.filter(function (c) { return recommendationOf(c) === 'High Priority'; }), 5)
      .forEach(function (c) { add(c, 'contact', 'Contact immediately', 'Opportunity Score ' + scoreOf(c) + ' — top-converting profile', 'High'); });
    companies.filter(function (c) { var v = vidx[c.id]; return (v && v.ownerConflict) || !c.crm.owner; }).slice(0, 4)
      .forEach(function (c) { var v = vidx[c.id]; add(c, 'owner', 'Assign / confirm owner', (v && v.ownerConflict) ? 'Assigned to multiple owners' : 'No owner assigned', 'High'); });
    companies.filter(function (c) { var v = vidx[c.id]; return v && v.duplicate; }).slice(0, 4)
      .forEach(function (c) { var v = vidx[c.id]; add(c, 'duplicate', 'Review duplicate', 'Possible duplicate (' + v.types.join(', ') + ')', 'Medium'); });
    companies.filter(function (c) { var v = vidx[c.id]; return v && v.agencyConflict; }).slice(0, 3)
      .forEach(function (c) { add(c, 'validation', 'Manual validation required', 'Mapped to multiple agencies', 'Medium'); });
    companies.filter(function (c) { var st = researchStatusOf(c, jobs); return st === 'pending' || st === 'queued'; }).slice(0, 4)
      .forEach(function (c) { add(c, 'research', 'Run research', 'Awaiting AI enrichment', 'Low'); });
    return actions.sort(function (a, b) { return prank(a.priority) - prank(b.priority); }).slice(0, 12);
  }

  /** Founder Insights: 5–8 auto-generated business insights from real data. */
  function computeFounderInsights(companies, validation, research) {
    companies = companies || [];
    var k = computeKpis(companies, validation, research);
    var out = [];
    var hi = companies.filter(function (c) { var r = recommendationOf(c); return r === 'High Priority' || r === 'Priority'; });
    if (hi.length) {
      var byInd = {}; hi.forEach(function (c) { var i = industryOf(c) || 'Unclassified'; byInd[i] = (byInd[i] || 0) + 1; });
      var t = topOf(byInd); out.push({ text: t.label + ' represents ' + Math.round((t.count / hi.length) * 100) + '% of all high-priority opportunities.', metric: Math.round((t.count / hi.length) * 100) + '%' });
    }
    var indScores = {}; companies.forEach(function (c) { var s = scoreOf(c); if (s != null) { var i = industryOf(c) || 'Unclassified'; (indScores[i] = indScores[i] || []).push(s); } });
    var bestInd = null, bestAvg = -1;
    Object.keys(indScores).forEach(function (i) { var arr = indScores[i]; var avg = arr.reduce(function (a, b) { return a + b; }, 0) / arr.length; if (avg > bestAvg) { bestAvg = avg; bestInd = i; } });
    if (bestInd) { out.push({ text: bestInd + ' brands have the highest average Opportunity Score (' + Math.round(bestAvg) + ').', metric: Math.round(bestAvg) }); }
    if (k.researchPending) { out.push({ text: 'Research is pending for ' + co(k.researchPending) + '.', metric: k.researchPending }); }
    if (k.duplicateLeads) { out.push({ text: co(k.duplicateLeads) + ' ' + vb(k.duplicateLeads, 'has', 'have') + ' duplicate conflicts to resolve.', metric: k.duplicateLeads }); }
    if (k.avgScore) { out.push({ text: 'Average Opportunity Score across the pipeline is ' + k.avgScore + '/100.', metric: k.avgScore }); }
    var byOwner = {}; companies.filter(function (c) { return recommendationOf(c) === 'High Priority'; }).forEach(function (c) { var o = c.crm.owner || 'Unassigned'; byOwner[o] = (byOwner[o] || 0) + 1; });
    var to = topOf(byOwner); if (to.count > 0) { out.push({ text: to.label + ' owns the most high-priority accounts (' + to.count + ').', metric: to.count }); }
    var adv = companies.filter(function (c) { var a = c.ai && (c.ai.advertisingActivity || (c.ai.intelligence && c.ai.intelligence.advertisingActivity)); return a === 'Very High' || a === 'High'; }).length;
    if (adv) { out.push({ text: co(adv) + ' ' + vb(adv, 'is', 'are') + ' actively advertising — warm DOOH prospects.', metric: adv }); }
    if (k.totalCompanies) { out.push({ text: Math.round((k.validated / k.totalCompanies) * 100) + '% of uploaded companies passed validation.', metric: Math.round((k.validated / k.totalCompanies) * 100) + '%' }); }
    return out.slice(0, 8);
  }

  var IntelligenceSelectors = {
    validationIndex: validationIndex, jobsByCompany: jobsByCompany,
    computeKpis: computeKpis, computeInsights: computeInsights, computeCharts: computeCharts,
    computeExecutiveBrief: computeExecutiveBrief, computeActions: computeActions, computeFounderInsights: computeFounderInsights,
    companyView: companyView, industryOf: industryOf, scoreOf: scoreOf, recommendationOf: recommendationOf, topScored: topScored
  };

  if (typeof module !== 'undefined' && module.exports) { module.exports = IntelligenceSelectors; }
  else { root.ALIP = root.ALIP || {}; root.ALIP.IntelligenceSelectors = IntelligenceSelectors; }
})(typeof self !== 'undefined' ? self : this);
