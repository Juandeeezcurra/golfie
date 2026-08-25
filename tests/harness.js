const fs = require('fs');
const { makeSpreadsheet } = require('./sheets-mock.js');
const ROOT = require('path').join(__dirname, '..') + '/';

// ---------- BACKEND: corre appsscript.gs real ----------
function makeBackend() {
  const ss = makeSpreadsheet();
  const env = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (t) => ({ setMimeType: () => ({ getContent: () => t }) })
    },
    Logger: { log: () => {} }
  };
  const src = fs.readFileSync(ROOT + 'appsscript.gs', 'utf8');
  const f = new Function('SpreadsheetApp', 'ContentService', 'Logger',
    src + '\n; return { doGet, doPost, claimLegacyRows };');
  return { api: f(env.SpreadsheetApp, env.ContentService, env.Logger), ss };
}

// ---------- CLIENTE: corre el <script> de golfie.html real ----------
function makeClient(backend, opts = {}) {
  const html = fs.readFileSync(ROOT + 'golfie.html', 'utf8');
  const src = html.match(/<script[^>]*>([\s\S]*?)<\/script>/)[1];

  const store = new Map();
  const localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  };

  const el = new Proxy(function () {}, {
    get: (t, p) => (p === 'value' ? '' : p === 'textContent' ? '' :
                    p === 'classList' ? { add(){}, remove(){}, toggle(){} } :
                    p === 'style' ? {} : p === 'dataset' ? {} : el),
    set: () => true,
    apply: () => el
  });
  const checks = { els: [] };
  const document = {
    getElementById: () => el, querySelector: () => el,
    querySelectorAll: (sel) => ((sel === '.cleanup-course' || sel === '.repair-course') ? checks.els : []),
    addEventListener: () => {}, body: el, documentElement: el
  };
  const navigator = { onLine: opts.online !== false };
  const window = { addEventListener: () => {}, scrollTo: () => {} };

  const net = { posts: 0, blockPost: !!opts.blockPost, offline: opts.online === false, readable: opts.readable !== false };
  async function fetch(url, init) {
    if (net.offline) throw new TypeError('Failed to fetch');
    if (!init || init.method !== 'POST') {
      const qs = Object.fromEntries(new URL(url).searchParams);
      const out = backend.api.doGet({ parameter: qs });
      return { ok: true, json: async () => JSON.parse(out.getContent()) };
    }
    net.posts++;
    if (net.blockPost) throw new TypeError('Failed to fetch');
    const res = backend.api.doPost({ postData: { contents: init.body } });
    if (!net.readable && init.mode !== 'no-cors') throw new TypeError('CORS blocked');
    return { ok: true, json: async () => JSON.parse(res.getContent()) };
  }

  const f = new Function('window','document','localStorage','fetch','navigator','console','location','setTimeout','URL',
    src + `\n; return { getUserId, setUserId, loadRounds, saveRoundToLS, saveToLS, loadFromLS,
      postToSheets, flushPending, syncFromServer, queueGet, reconcile, pruneQueue, enqueue,
      deleteRound, showModal, orphanRounds, applyCleanup, purgeOrphanQueue, purgeQueueForRound,
      applyRepair, coursesSummary, clearQueue, diagnose,
      renderHold, showHold, applyHold, RECONCILE_LIMIT };`);
  const app = f(window, document, localStorage, fetch, navigator,
                { warn(){}, log(){}, error(){} }, { reload(){} }, (fn)=>fn(), URL);
  // Simula tildar canchas en el modal de limpieza.
  app.__setCheckboxes = (marcadas, todas) => {
    const canchas = todas
      ? app.coursesSummary().map(([c]) => c)
      : [...new Set(app.orphanRounds().map(r => r.course_name || '—'))];
    checks.els = canchas.map(c => ({ checked: marcadas.has(c), dataset: { course: c } }));
  };
  return { app, store, net, localStorage };
}

// ---------- helpers de inspección ----------
function rowsOf(ss, name) {
  const sh = ss.getSheetByName(name);
  if (!sh) return [];
  const d = sh.getDataRange().getValues();
  if (d.length < 2) return [];
  const h = d[0];
  return d.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]])));
}
module.exports = { makeBackend, makeClient, rowsOf };
