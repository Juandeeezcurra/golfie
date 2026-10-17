// Helpers para probar el Worker (src/index.js) contra un D1 falso en memoria,
// sin levantar Cloudflare. Misma idea que tests/harness.js para el backend
// viejo: ejercitar el camino real (fetch -> Worker -> D1), no mocks internos.
import { FakeD1 } from '../../tools/fake-d1.mjs';
import { buildSchemaSql } from '../../src/schema.js';
import worker from '../../src/index.js';

export function makeEnv() {
  const d1 = new FakeD1();
  d1.exec(buildSchemaSql());
  return { DB: d1, ASSETS: { fetch: async () => new Response('not found', { status: 404 }) } };
}

export async function get(env, action, params = {}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  const res = await worker.fetch(new Request(`https://x/api?${qs}`), env);
  return res.json();
}

export async function post(env, action, data = {}) {
  const res = await worker.fetch(new Request('https://x/api', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, ...data }),
  }), env);
  return res.json();
}

// Inspección directa de la tabla, para verificar lo que el Worker no expone
// por la API (p.ej. filas sin dueño, que doGet nunca devuelve).
export function rowsOf(env, table) {
  return env.DB.db.prepare(`SELECT * FROM ${table} ORDER BY _seq`).all();
}
