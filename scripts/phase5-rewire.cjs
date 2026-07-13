/**
 * Phase 5 rewire — one-shot structural edit of index.html:
 *   1. Replace the mock Dashboard / Lead Intelligence / Companies page bodies
 *      with slim containers rendered by the new feature controllers.
 *   2. Remove the ~270-line mock application script (mock COMPANIES + renderers).
 *   3. Add the Phase 5 module includes + a slim router (delegates to controllers).
 *   4. Inject the Phase 5 CSS.
 * Idempotent guard: refuses to run twice.
 */
const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'index.html');
let html = fs.readFileSync(file, 'utf8');

if (html.indexOf('id="dashboard-content"') !== -1) { console.log('Already rewired — skipping.'); process.exit(0); }

let lines = html.split('\n');
function splice(start, end, text) { lines.splice(start - 1, end - start + 1, text); } // 1-based inclusive

// Bottom-to-top so earlier line numbers stay valid.
// mock application script: 781–1049
splice(781, 1049, '<!-- Phase 5: mock application script removed — pages now render from real Company Intelligence via feature controllers -->');
// Companies page: 698–715
splice(698, 715,
`    <!-- ═══ COMPANIES (Phase 5) ═══ -->
    <div class="page" id="page-companies">
      <div class="page-lbl">Directory</div>
      <div class="page-title">Companies</div>
      <div class="page-desc">Every uploaded company. Open any profile for its full intelligence dossier — overview, research summary, score breakdown, business reason, and statuses.</div>
      <div id="companies-content"></div>
    </div>`);
// Lead Intelligence page: 667–695
splice(667, 695,
`    <!-- ═══ LEAD INTELLIGENCE (Phase 5) ═══ -->
    <div class="page" id="page-leads">
      <div class="page-lbl">Pipeline</div>
      <div class="page-title">Lead Intelligence</div>
      <div class="page-desc">A ranked, AI-enriched view of every uploaded company. Filter by Opportunity Score, industry, recommendation, research status, validation status, or owner.</div>
      <div id="leads-content"></div>
    </div>`);
// Executive Dashboard page: 594–664
splice(594, 664,
`    <!-- ═══ EXECUTIVE DASHBOARD (Phase 5) ═══ -->
    <div class="page active" id="page-dashboard">
      <div class="page-lbl">Executive Intelligence · Srihari Mumbai Team</div>
      <div class="page-title">Executive Dashboard</div>
      <div class="page-desc">A live, 30-second read of the CRM. Every widget is computed from the uploaded companies and their AI enrichment — no mock data.</div>
      <div id="dashboard-content"></div>
    </div>`);

html = lines.join('\n');

// ── module includes + slim router (after the last existing include, before </body>) ──
const anchor = '<script src="src/features/intelligence/intelligenceController.js"></script>\n</body>';
const router = [
  '<script src="src/features/intelligence/intelligenceController.js"></script>',
  '<!-- ═══ Phase 5 · Executive Dashboard, Companies, Lead Intelligence ═══ -->',
  '<script src="src/services/intelligenceSelectors.js"></script>',
  '<script src="src/features/shared/ui.js"></script>',
  '<script src="src/features/dashboard/dashboardController.js"></script>',
  '<script src="src/features/companies/companiesController.js"></script>',
  '<script src="src/features/leadIntelligence/leadIntelligenceController.js"></script>',
  '<script>',
  '/* Slim router (Phase 5) — shows a page and delegates rendering to its controller. */',
  '(function(){',
  "  var VIEWS={dashboard:'DashboardView',companies:'CompaniesView',leads:'LeadIntelligenceView',research:'ResearchView',validation:'ValidationView',intelligence:'IntelligenceView'};",
  '  function show(page){',
  "    document.querySelectorAll('.page').forEach(function(p){p.classList.remove('active');});",
  "    document.querySelectorAll('.nav-item').forEach(function(n){n.classList.remove('active');});",
  "    var el=document.getElementById('page-'+page); if(el) el.classList.add('active');",
  "    var nav=document.querySelector('[data-page=\"'+(page==='company-detail'?'companies':page)+'\"]'); if(nav) nav.classList.add('active');",
  '  }',
  '  window.navigate=function(page){ show(page); var v=(window.ALIP||{})[VIEWS[page]]; if(v&&v.render) v.render(); var c=document.querySelector(".content"); if(c) c.scrollTop=0; };',
  '  window.openCompany=function(id){ show("company-detail"); var v=(window.ALIP||{}).CompaniesView; if(v&&v.renderDetail) v.renderDetail(id); var c=document.querySelector(".content"); if(c) c.scrollTop=0; };',
  "  document.getElementById('nav').addEventListener('click',function(e){var i=e.target.closest('.nav-item'); if(i) navigate(i.dataset.page);});",
  "  var start=(location.hash||'').slice(1);",
  "  navigate(document.getElementById('page-'+start)?start:'dashboard');",
  '})();',
  '</script>',
  '</body>'
].join('\n');
if (html.indexOf(anchor) === -1) { throw new Error('include anchor not found'); }
html = html.replace(anchor, router);

// ── Phase 5 CSS (before the aii-chip rule's closing </style>) ──
const cssAnchor = '.aii-chip{font-size:11.5px;font-weight:600;color:var(--t2);background:var(--b2);border:1px solid var(--b);border-radius:8px;padding:4px 9px}\n</style>';
const css = `.aii-chip{font-size:11.5px;font-weight:600;color:var(--t2);background:var(--b2);border:1px solid var(--b);border-radius:8px;padding:4px 9px}
/* ═══ Executive Dashboard + Lead Intelligence (Phase 5) ═══ */
.exec-hero{margin-top:24px}
.exec-insights{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.exec-insight{display:flex;align-items:flex-start;gap:10px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:13px 15px;font-size:13px;font-weight:600;color:rgba(255,255,255,.92);line-height:1.4;backdrop-filter:blur(8px)}
.exec-dot{width:7px;height:7px;border-radius:50%;background:#4ADE80;margin-top:5px;flex-shrink:0;box-shadow:0 0 0 3px rgba(74,222,128,.25)}
.exec-kpis{display:grid;grid-template-columns:repeat(7,1fr);gap:12px;margin-top:18px}
.kpi-sub{font-size:10.5px;color:var(--t3);font-weight:600;margin-top:6px;line-height:1.3}
.stat-val.txt{font-size:15px;line-height:1.25;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chart-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:14px}
.chart-card{background:var(--w);border:1px solid var(--b);border-radius:16px;padding:18px;box-shadow:var(--sh-xs)}
.chart-q{font-size:14px;font-weight:800;color:var(--t);letter-spacing:-.015em}
.chart-sub{font-size:11px;color:var(--t4);font-weight:600;margin-top:2px;margin-bottom:12px}
.chart-box{position:relative;height:200px}
.li-filters{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-top:20px;margin-bottom:14px}
.li-sel{display:flex;flex-direction:column;gap:5px}
.li-sel>span{font-size:10px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--t4)}
.li-sel select{font-family:'Montserrat',sans-serif;font-size:12.5px;font-weight:600;color:var(--t);background:var(--w);border:1px solid var(--b);border-radius:9px;padding:8px 10px;cursor:pointer;box-shadow:var(--sh-xs);outline:none}
.li-sel select:focus{border-color:var(--p3);box-shadow:0 0 0 3px var(--pl)}
.li-cols{display:grid;grid-template-columns:2fr 1fr 1.3fr 84px 132px 116px 104px;gap:14px;align-items:center;min-width:1000px}
.ring.ring-empty{background:var(--b2)}
.ring.ring-empty span{color:var(--t4)}
</style>`;
if (html.indexOf(cssAnchor) === -1) { throw new Error('css anchor not found'); }
html = html.replace(cssAnchor, css);

fs.writeFileSync(file, html);
console.log('Phase 5 rewire complete. Lines:', html.split('\n').length);
