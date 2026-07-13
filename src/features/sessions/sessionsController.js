/**
 * ALIP · Session Switcher (feature — UX)
 * ---------------------------------------------------------------------------
 * A header dropdown listing every stored upload so the founder can jump between
 * datasets deliberately (instead of by hand-editing the ?session= URL) and
 * delete redundant ones. Reads the summary from GET /api/sessions; switching
 * navigates to ?session=<id> (a clean reload the existing loader understands).
 *
 * Additive + API-only: renders nothing in the offline/local pipeline.
 * Browser-only.
 */
(function (root) {
  'use strict';
  if (typeof document === 'undefined') { return; }

  function api() { return root.ALIP || {}; }
  function $(id) { return document.getElementById(id); }
  function esc(s) { return api().UI ? api().UI.esc(s) : String(s == null ? '' : s); }

  var LAYERS = '<svg viewBox="0 0 24 24"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>';
  var CHEV = '<svg class="ssw-chev" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>';
  var CHECK = '<svg class="ssw-check" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
  var TRASH = '<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>';

  var sessions = [];
  var open = false;

  function enabled() { var c = api().ApiClient; return !!(c && !c.isDisabled()); }
  function activeId() { var s = api().CRMStore; return s && s.getSessionId ? s.getSessionId() : null; }

  function metaOf(s) {
    var bits = [s.companies + ' compan' + (s.companies === 1 ? 'y' : 'ies')];
    if (s.scored) { bits.push(s.scored + ' scored'); }
    else if (s.researched) { bits.push(s.researched + ' researched'); }
    return bits.join(' · ');
  }

  function fetchAndRender() {
    if (!enabled()) { render(); return; }
    api().ApiClient.sessions()
      .then(function (res) { sessions = (res && res.sessions) || []; render(); })
      .catch(function () { render(); });
  }

  function render() {
    var wrap = $('session-switch');
    if (!wrap) { return; }
    if (!enabled()) { wrap.innerHTML = ''; return; }

    var aid = activeId();
    var cur = sessions.filter(function (s) { return s.session_id === aid; })[0];
    var btnFile = cur ? (cur.file_name || 'Untitled upload') : (aid ? 'Current upload' : 'No upload loaded');
    var btnMeta = cur ? metaOf(cur) : (sessions.length ? sessions.length + ' uploads' : '—');

    var items = sessions.length ? sessions.map(function (s) {
      var active = s.session_id === aid;
      return '<div class="ssw-item' + (active ? ' active' : '') + '" data-id="' + esc(s.session_id) + '">' +
        '<div class="ssw-item-main">' +
          '<div class="ssw-item-file">' + esc(s.file_name || 'Untitled upload') + '</div>' +
          '<div class="ssw-item-meta">' + esc(metaOf(s)) + '</div>' +
        '</div>' +
        (active ? CHECK : '') +
        '<button class="ssw-del" data-del="' + esc(s.session_id) + '" title="Delete this upload">' + TRASH + '</button>' +
      '</div>';
    }).join('') : '<div class="ssw-empty">No uploads yet. Upload a CRM to begin.</div>';

    wrap.innerHTML =
      '<button class="ssw-btn" id="ssw-btn" type="button">' +
        '<div class="ssw-ic">' + LAYERS + '</div>' +
        '<div class="ssw-txt"><div class="ssw-file">' + esc(btnFile) + '</div><div class="ssw-meta">' + esc(btnMeta) + '</div></div>' +
        CHEV +
      '</button>' +
      '<div class="ssw-menu"><div class="ssw-menu-lbl">Your uploads · click to switch</div>' + items + '</div>';

    wrap.classList.toggle('open', open);

    var btn = $('ssw-btn');
    if (btn) { btn.addEventListener('click', function (e) { e.stopPropagation(); open = !open; wrap.classList.toggle('open', open); }); }
    wrap.querySelectorAll('.ssw-item').forEach(function (it) {
      it.addEventListener('click', function (e) { if (e.target.closest('.ssw-del')) { return; } switchTo(it.getAttribute('data-id')); });
    });
    wrap.querySelectorAll('.ssw-del').forEach(function (b) {
      b.addEventListener('click', function (e) { e.stopPropagation(); del(b.getAttribute('data-del')); });
    });
  }

  function switchTo(id) {
    if (!id || id === activeId()) { open = false; render(); return; }
    root.location.search = '?session=' + encodeURIComponent(id);   // reload → existing loader hydrates it
  }

  function del(id) {
    var s = sessions.filter(function (x) { return x.session_id === id; })[0];
    var label = s ? (s.file_name || 'this upload') + ' (' + s.companies + ' companies)' : 'this upload';
    if (!root.confirm || !root.confirm('Delete ' + label + ' permanently? This cannot be undone.')) { return; }
    if (!enabled()) { return; }
    var wasActive = id === activeId();
    api().ApiClient.deleteSession(id).then(function () {
      sessions = sessions.filter(function (x) { return x.session_id !== id; });
      if (wasActive) {
        if (sessions.length) { root.location.search = '?session=' + encodeURIComponent(sessions[0].session_id); return; }
        root.location.href = root.location.pathname;   // nothing left → clean slate
        return;
      }
      render();
    }).catch(function (err) { if (root.alert) { root.alert('Could not delete: ' + (err && err.message || 'error')); } });
  }

  function init() {
    if (!$('session-switch')) { return; }
    document.addEventListener('click', function () {
      if (open) { open = false; var w = $('session-switch'); if (w) { w.classList.remove('open'); } }
    });
    if (api().CRMStore && api().CRMStore.subscribe) { api().CRMStore.subscribe(render); }
    fetchAndRender();
  }
  if (document.readyState !== 'loading') { init(); } else { document.addEventListener('DOMContentLoaded', init); }
  root.ALIP = root.ALIP || {};
  root.ALIP.SessionSwitcher = { refresh: fetchAndRender, render: render };
})(typeof self !== 'undefined' ? self : this);
