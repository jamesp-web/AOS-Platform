/**
 * ALIP · UI helpers (feature-shared)
 * ---------------------------------------------------------------------------
 * Small presentation helpers reused by the dashboard / companies / lead
 * intelligence controllers: escaping, avatars, score rings, and the badge
 * vocabulary. Browser-only, no data logic.
 */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') { return; }

  var AC = ['#6366F1', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444', '#14B8A6', '#F97316', '#06B6D4', '#84CC16', '#A855F7'];
  function hash(s) { var h = 0; for (var i = 0; i < String(s).length; i++) { h = (h * 31 + String(s).charCodeAt(i)) % AC.length; } return h; }
  function ac(s) { return AC[hash(s)]; }
  function hexA(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')'; }

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function initials(name) { var w = String(name || '?').trim().split(/\s+/); return ((w[0] || '?')[0] + (w[1] ? w[1][0] : '')).toUpperCase(); }
  function avatarStyle(name) { var c = ac(name); return 'background:' + hexA(c, 0.12) + ';color:' + c; }

  function scoreColor(t) { return t == null ? 'var(--t4)' : t >= 75 ? 'var(--g)' : t >= 60 ? 'var(--o)' : 'var(--r)'; }
  function ring(score, size) {
    if (score == null) { return '<div class="ring ring-empty" style="width:' + size + 'px;height:' + size + 'px"><span>—</span></div>'; }
    var c = scoreColor(score), fs = size < 34 ? 11 : size < 44 ? 12.5 : size > 58 ? 19 : 13;
    return '<div class="ring" style="--v:' + score + ';--c:' + c + ';width:' + size + 'px;height:' + size + 'px"><span style="color:' + c + ';font-size:' + fs + 'px">' + score + '</span></div>';
  }

  var REC_TONE = {
    'High Priority': ['var(--pl)', 'var(--pd)'], 'Priority': ['var(--bll)', '#1D4ED8'],
    'Review': ['var(--ol)', '#B45309'], 'Deprioritize': ['var(--rl)', '#B91C1C']
  };
  function recPill(rec) {
    if (!rec) { return '<span class="badge bg-gray">Unscored</span>'; }
    var t = REC_TONE[rec] || REC_TONE.Deprioritize;
    return '<span class="rec-pill" style="background:' + t[0] + ';color:' + t[1] + '">' + esc(rec) + '</span>';
  }

  var RESEARCH_BADGE = { completed: 'bg-green', done: 'bg-green', cached: 'bg-purple', researching: 'bg-blue', pending: 'bg-gray', queued: 'bg-gray', failed: 'bg-red', skipped: 'bg-gray' };
  function researchBadge(st) { var lbl = st ? st.charAt(0).toUpperCase() + st.slice(1) : 'Pending'; return '<span class="badge ' + (RESEARCH_BADGE[st] || 'bg-gray') + '">' + esc(lbl) + '</span>'; }

  var VALIDATION_BADGE = { Unique: 'bg-green', Duplicate: 'bg-red', Conflict: 'bg-orange', Group: 'bg-blue' };
  function validationBadge(st) { return '<span class="badge ' + (VALIDATION_BADGE[st] || 'bg-gray') + '">' + esc(st) + '</span>'; }

  function pageActive(id) { var el = document.getElementById(id); return !!(el && el.classList.contains('active')); }

  // Enrich one company on demand (research + LLM + score) via the backend, then
  // re-hydrate the store so every view updates. Shared by the per-row buttons.
  function enrichCompany(id) {
    var a = root.ALIP || {}, A = a.ApiClient, S = a.CRMStore, sid = S && S.getSessionId();
    if (!A || !sid) { return Promise.reject(new Error('API/session unavailable')); }
    return A.enrichCompany(sid, id).then(function (res) {
      return A.session(sid).then(function (state) { S.hydrate(state); return res; });
    });
  }
  function enrichRow(btn, id) {
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner spinner-p"></span>'; }
    return enrichCompany(id).catch(function (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
      console.warn('[ALIP] enrich failed:', err && err.message);
    });
  }

  root.ALIP = root.ALIP || {};
  root.ALIP.UI = {
    esc: esc, initials: initials, avatarStyle: avatarStyle, ring: ring, scoreColor: scoreColor,
    recPill: recPill, researchBadge: researchBadge, validationBadge: validationBadge, pageActive: pageActive,
    enrichCompany: enrichCompany, enrichRow: enrichRow
  };
})(typeof self !== 'undefined' ? self : this);
