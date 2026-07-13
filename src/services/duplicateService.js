/**
 * ALIP · DuplicateService (service — Lead Validation Engine)
 * ---------------------------------------------------------------------------
 * Composes the four building blocks (Normalize · Similarity · BusinessGroups ·
 * ValidationRules) into a structured validation report. Pure: companies in →
 * report out. No DOM, no store, no side effects — the UI and store consume it.
 *
 * Detects & classifies: exact, fuzzy, business-group, owner-conflict,
 * agency-conflict. Every detection carries a confidence, a plain-language
 * reason and a recommended action (Merge / Review / Keep Separate).
 *
 * Mirrors future backend service: backend/services/duplicate_service.py
 * (a FastAPI endpoint would import the same four modules unchanged).
 */
(function (root) {
  'use strict';

  var isNode = (typeof module !== 'undefined' && module.exports);
  var N  = isNode ? require('../domain/normalize.js')       : (root.ALIP && root.ALIP.Normalize);
  var S  = isNode ? require('../domain/similarity.js')      : (root.ALIP && root.ALIP.Similarity);
  var BG = isNode ? require('../domain/businessGroups.js')  : (root.ALIP && root.ALIP.BusinessGroups);
  var R  = isNode ? require('../domain/validationRules.js') : (root.ALIP && root.ALIP.ValidationRules);

  function member(m) {
    return { id: m.id, name: m.name, owner: m.owner, agency: m.agency, brandId: m.brandId };
  }

  function makeDetection(idNum, type, confidence, A, B, ctx) {
    confidence = Math.round(confidence * 100) / 100;
    return {
      id: 'DUP-' + idNum,
      type: type,
      typeLabel: R.LABELS[type],
      confidence: confidence,
      reason: R.reason(type, {
        a: A.name, b: B.name, confidence: confidence,
        parent: ctx.parent, brandId: ctx.brandId,
        ownerA: A.owner || '—', ownerB: B.owner || '—',
        agencyA: A.agency || '—', agencyB: B.agency || '—'
      }),
      recommendedAction: R.recommendedAction(type, confidence),
      members: [member(A), member(B)],
      meta: { parent: ctx.parent || null, similarity: ctx.similarity != null ? ctx.similarity : null }
    };
  }

  /**
   * Analyse a list of canonical companies and return a validation report.
   * @param {Array<Object>} companies canonical companies (id + crm{...})
   */
  function analyze(companies) {
    companies = companies || [];

    var meta = companies.map(function (c) {
      var crm = c.crm || c;
      return {
        id: c.id,
        name: crm.brandName || '',
        brandId: crm.brandId || '',
        owner: crm.owner || '',
        agency: crm.agency || '',
        exactName: N.exact(crm.brandName),
        norm: N.name(crm.brandName),
        group: BG.detect(crm.brandName)
      };
    });

    var detections = [];
    var counts = { exact: 0, fuzzy: 0, business: 0, 'owner-conflict': 0, 'agency-conflict': 0 };
    var flagged = {};
    var groupsMap = {};
    var seq = 0;

    // Aggregate parent-group membership (for the parent-relationship view).
    meta.forEach(function (m) {
      if (m.group && m.group.confidence >= R.THRESHOLDS.group) {
        var g = groupsMap[m.group.parent] || (groupsMap[m.group.parent] = { via: m.group.via, ids: [], names: [], cleans: {} });
        g.ids.push(m.id); g.names.push(m.name); g.cleans[m.norm.clean] = 1;
      }
    });

    function flag(id) { flagged[id] = true; }

    for (var i = 0; i < meta.length; i++) {
      for (var j = i + 1; j < meta.length; j++) {
        var A = meta[i], B = meta[j];
        if (!A.name || !B.name) { continue; }

        var nameExact = A.exactName !== '' && A.exactName === B.exactName;
        var idEqual   = A.brandId && B.brandId && N.exact(A.brandId) === N.exact(B.brandId);
        var normEqual = A.norm.clean !== '' && A.norm.clean === B.norm.clean;
        var sim       = (nameExact || normEqual) ? 1 : S.score(A.name, B.name);
        var grp       = BG.sameGroup(A.name, B.name);

        var dupType = null, conf = 0, entity = false;
        if (nameExact && idEqual) { dupType = 'exact'; conf = 1; entity = true; }
        else if (normEqual || sim >= R.THRESHOLDS.fuzzyHigh) { dupType = 'fuzzy'; conf = normEqual ? 0.96 : sim; entity = true; }
        else if (sim >= R.THRESHOLDS.fuzzy) { dupType = 'fuzzy'; conf = sim; entity = true; }
        else if (grp && grp.confidence >= R.THRESHOLDS.group) { dupType = 'business'; conf = grp.confidence; entity = false; }

        if (dupType) {
          detections.push(makeDetection(++seq, dupType, conf, A, B, {
            parent: grp && grp.parent, brandId: idEqual ? A.brandId : '', similarity: sim
          }));
          counts[dupType]++; flag(A.id); flag(B.id);
        }

        if (entity) {
          if (N.person(A.owner) && N.person(B.owner) && N.person(A.owner) !== N.person(B.owner)) {
            detections.push(makeDetection(++seq, 'owner-conflict', conf, A, B, { similarity: sim }));
            counts['owner-conflict']++; flag(A.id); flag(B.id);
          }
          if (N.agency(A.agency) && N.agency(B.agency) && N.agency(A.agency) !== N.agency(B.agency)) {
            detections.push(makeDetection(++seq, 'agency-conflict', conf, A, B, { similarity: sim }));
            counts['agency-conflict']++; flag(A.id); flag(B.id);
          }
        }
      }
    }

    var groups = Object.keys(groupsMap)
      .map(function (parent) {
        var g = groupsMap[parent];
        var ids = g.ids.filter(function (v, k) { return g.ids.indexOf(v) === k; });
        var names = g.names.filter(function (v, k) { return g.names.indexOf(v) === k; });
        return { parent: parent, via: g.via, memberIds: ids, memberNames: names, distinctNames: Object.keys(g.cleans).length };
      })
      // a genuine business group needs ≥2 DISTINCT brand names (not the same name repeated)
      .filter(function (g) { return g.distinctNames >= 2; });

    var flaggedCount = Object.keys(flagged).length;
    var groupedIds = {};
    groups.forEach(function (g) { g.memberIds.forEach(function (id) { groupedIds[id] = 1; }); });

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        totalCompanies: companies.length,
        exact: counts.exact,
        fuzzy: counts.fuzzy,
        business: counts.business,                               // pairwise business links
        businessGroups: groups.length,                           // distinct parent groups
        businessGroupedCompanies: Object.keys(groupedIds).length,
        ownerConflicts: counts['owner-conflict'],
        agencyConflicts: counts['agency-conflict'],
        flaggedCompanies: flaggedCount,
        cleanCompanies: companies.length - flaggedCount
      },
      duplicates: detections,
      groups: groups
    };
  }

  var DuplicateService = { analyze: analyze };

  if (isNode) { module.exports = DuplicateService; }
  else { root.ALIP = root.ALIP || {}; root.ALIP.DuplicateService = DuplicateService; }
})(typeof self !== 'undefined' ? self : this);
