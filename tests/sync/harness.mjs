// ============================================================
// HARNESS DE SINCRONIZACIÓN
// ============================================================
// Levanta el cliente real (public/js/**) contra el backend real
// (src/index.js sobre un D1 falso en memoria). No hay mocks de la lógica:
// un test ejercita guardar un hoyo → cola → POST → Worker → D1 → sync de
// vuelta, igual que en la cancha.
//
// Reemplaza al harness viejo, que corría la copia congelada golfie.html
// contra un Google Sheets simulado: eso ya no es la app que se despliega.
// ============================================================

import { FakeD1 } from '../../tools/fake-d1.mjs';
import { buildSchemaSql } from '../../src/schema.js';
import worker from '../../src/index.js';
import { createStore } from '../../public/js/store.js';
import { createSync } from '../../public/js/sync.js';
import { app } from '../../public/js/context.js';

// ---------- BACKEND: Worker real + D1 falso ----------
export function makeBackend() {
  const d1 = new FakeD1();
  d1.exec(buildSchemaSql());
  const env = { DB: d1, ASSETS: { fetch: async () => new Response('', { status: 404 }) } };
  return {
    d1,
    env,
    fetch: (url, init) => worker.fetch(new Request(new URL(url, 'http://localhost'), init), env),
  };
}

// Filas crudas de una tabla, para verificar lo que la API no expone.
export function rowsOf(backend, table) {
  return backend.d1.db.prepare(`SELECT * FROM ${table} ORDER BY _seq`).all();
}

// Siembra una fila directo en la base, sin pasar por la API. Sirve para
// reproducir estado heredado: filas viejas sin user_id, o datos que ya
// estaban cuando se migró.
export function seedServerRow(backend, table, obj) {
  const cols = Object.keys(obj);
  const placeholders = cols.map(() => '?').join(', ');
  backend.d1.db
    .prepare(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`)
    .run(...cols.map(c => {
      const v = obj[c];
      if (typeof v === 'boolean') return v ? 1 : 0;
      return v === undefined ? null : v;
    }));
}

// ---------- localStorage falso ----------
function makeStorage() {
  const map = new Map();
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    _map: map,
  };
}

// ---------- DOM mínimo ----------
// Las pantallas de reparar/limpiar leen checkboxes y escriben en elementos.
// No se simula un DOM real: alcanza con que no explote y con poder decidir
// qué devuelve querySelectorAll para los checkboxes.
function installDom(checks) {
  const el = new Proxy(function () {}, {
    get: (t, p) => (p === 'value' ? '' : p === 'textContent' ? '' :
      p === 'classList' ? { add() {}, remove() {}, toggle() {} } :
      p === 'style' ? {} : p === 'dataset' ? {} : el),
    set: () => true,
    apply: () => el,
  });

  const document = {
    getElementById: () => el,
    querySelector: () => el,
    querySelectorAll: sel => ((sel === '.cleanup-course' || sel === '.repair-course') ? checks.els : []),
    addEventListener: () => {},
    body: el,
    documentElement: el,
  };

  globalThis.document = document;
  globalThis.window = globalThis.window || { addEventListener: () => {}, scrollTo: () => {} };
  globalThis.location = globalThis.location || { reload() {} };
  return document;
}

// ---------- CLIENTE ----------
export function makeClient(backend, opts = {}) {
  const storage = makeStorage();
  const checks = { els: [] };
  installDom(checks);

  const net = {
    posts: 0,
    offline: opts.online === false,
    blockPost: !!opts.blockPost,
    readable: opts.readable !== false,
    dropRate: opts.dropRate || 0,
  };

  async function fetchFn(url, init) {
    if (net.offline) throw new TypeError('Failed to fetch');

    if (!init || init.method !== 'POST') {
      return backend.fetch(url, init);
    }

    net.posts++;
    if (net.blockPost) throw new TypeError('Failed to fetch');
    if (net.dropRate && Math.random() < net.dropRate) throw new TypeError('Failed to fetch');

    const res = await backend.fetch(url, init);
    // El navegador puede impedir LEER la respuesta aunque la escritura haya
    // llegado. Por eso se consulta al backend primero y recién después se
    // simula el bloqueo: es exactamente el caso que vació la cola de más.
    if (!net.readable && init.mode !== 'no-cors') throw new TypeError('CORS blocked');
    return res;
  }

  const store = createStore(storage);
  const sync = createSync({
    store,
    fetchFn,
    navigatorRef: { get onLine() { return !net.offline; } },
    apiUrl: '/api',
  });

  const client = {
    store,
    sync,
    net,
    storage,
    // Apunta el contexto compartido a este cliente: las funciones de UI
    // (applyCleanup, applyRepair, …) lo leen de ahí.
    use() { app.store = store; app.sync = sync; return client; },
    // Simula tildar canchas en los modales de limpieza/reparación.
    setCheckboxes(marcadas, todasLasCanchas) {
      const canchas = todasLasCanchas
        ? sync.coursesSummary().map(([c]) => c)
        : [...new Set(sync.orphanRounds().map(r => r.course_name || '—'))];
      checks.els = canchas.map(c => ({ checked: marcadas.has(c), dataset: { course: c } }));
    },
  };

  return client.use();
}

// Importa las pantallas de mantenimiento ya con el DOM instalado.
export async function loadRepairUi() {
  return import('../../public/js/ui/repair.js');
}
