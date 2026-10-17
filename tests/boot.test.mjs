// ============================================================
// ARRANQUE DE LA APP
// ============================================================
// Importa main.js con un DOM simulado y lo deja arrancar entero. No valida
// cómo se ve nada: valida que el grafo de módulos cargue, que init() corra
// sin tirar una excepción y que los handlers queden colgados de window.
//
// Es el reemplazo barato de "abrir la app y ver si quedó en blanco": un
// import roto o un getElementById sobre algo que no existe rompen la app
// entera y antes sólo se notaba abriéndola.
// ============================================================

import test from 'node:test';
import assert from 'node:assert/strict';

function makeEl() {
  const el = new Proxy(function () {}, {
    get: (t, p) => {
      if (p === 'classList') return { add() {}, remove() {}, toggle() {}, contains: () => false };
      if (p === 'style') return {};
      if (p === 'dataset') return {};
      if (p === 'value' || p === 'textContent' || p === 'innerHTML') return '';
      if (p === 'querySelectorAll') return () => [];
      if (p === 'querySelector') return () => el;
      return el;
    },
    set: () => true,
    apply: () => el,
  });
  return el;
}

function installBrowser() {
  const store = new Map();
  const el = makeEl();

  globalThis.localStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };

  const listeners = {};
  globalThis.document = {
    readyState: 'complete',
    visibilityState: 'visible',
    getElementById: () => el,
    querySelector: () => el,
    querySelectorAll: () => [],
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    body: el,
    documentElement: el,
  };

  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), method: (init && init.method) || 'GET' });
    const body = String(url).includes('action=ping')
      ? JSON.stringify({ ok: true, v: 2 })
      : JSON.stringify([]);
    return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  // Node ya define navigator y es sólo-lectura, así que hay que redefinirlo.
  // Sin serviceWorker adentro, main.js no intenta registrar el SW.
  Object.defineProperty(globalThis, 'navigator', {
    value: { onLine: true }, configurable: true, writable: true,
  });
  globalThis.location = { search: '', reload() {} };
  globalThis.window = {
    localStorage: globalThis.localStorage,
    fetch: globalThis.fetch,
    addEventListener: (ev, fn) => { (listeners[ev] = listeners[ev] || []).push(fn); },
    scrollTo: () => {},
  };

  return { calls, listeners };
}

test('la app arranca sin explotar y deja los handlers en window', async () => {
  const { calls } = installBrowser();

  await import('../public/js/main.js');
  // init() dispara sync en segundo plano; se le da una vuelta de event loop.
  await new Promise(r => setTimeout(r, 50));

  // Los handlers que usa el markup tienen que estar colgados de window.
  for (const fn of ['goTo', 'switchTab', 'startRound', 'saveHole', 'viewRound', 'deleteRound', 'toggleScoreVisibility', 'showRepair']) {
    assert.equal(typeof globalThis.window[fn], 'function', `falta window.${fn}`);
  }

  // Y el arranque tiene que haber hablado con el backend.
  assert.ok(calls.some(c => c.url.includes('action=getRounds')), 'el arranque no pidió las rondas al servidor');
});
