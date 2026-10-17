// El freno que faltaba cuando reconcile subió 210 registros en silencio:
// por encima de RECONCILE_LIMIT no se sube nada sin aprobación explícita.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackend, makeClient, rowsOf } from './harness.mjs';
import { applyHold } from '../../public/js/ui/repair.js';

test('freno de subida masiva: espera aprobación', async () => {
  const b = makeBackend();
  const c = makeClient(b);
  const uid = c.store.getUserId();

  const rounds = [];
  for (let i = 0; i < 10; i++) {
    const rid = 'r-' + i;
    rounds.push({
      round_id: rid, user_id: uid, date: '2026-08-20', course_name: 'Palermo GC',
      tees: 'Blancos', total_score: 90, holes_played: 18, completed: true,
    });
    const h = {};
    for (let n = 1; n <= 18; n++) h[n] = { round_id: rid, hole_number: n, par: 4, score: 5, putts: 2 };
    c.store.saveHoles(rid, h);
  }
  c.store.saveRounds(rounds);

  await c.sync.syncFromServer();

  assert.equal(c.sync.queueGet().length, 0, 'no encoló nada solo: son más de ' + c.sync.RECONCILE_LIMIT + ' registros');
  assert.equal(rowsOf(b, 'rounds').length, 0, 'no tocó el servidor sin permiso');
  const enEspera = c.store.loadFromLS('reconcile_hold') || [];
  assert.ok(enEspera.length > c.sync.RECONCILE_LIMIT, 'quedaron esperando tu visto bueno');

  applyHold();                                  // el OK explícito
  await new Promise(r => setTimeout(r, 0));
  await c.sync.flushPending();

  assert.equal(rowsOf(b, 'rounds').length, 10, 'recién ahí sube');
  assert.equal((c.store.loadFromLS('reconcile_hold') || []).length, 0, 'y la espera se limpia');
});

test('recuperar una ronda suelta no molesta', async () => {
  const b = makeBackend();
  const c = makeClient(b);
  const uid = c.store.getUserId();
  const rid = 'r-una';

  c.store.saveRounds([{
    round_id: rid, user_id: uid, date: 'x', course_name: 'Cañuelas',
    tees: 'Blancos', total_score: 90, holes_played: 18, completed: true,
  }]);
  const h = {};
  for (let n = 1; n <= 18; n++) h[n] = { round_id: rid, hole_number: n, par: 4, score: 5, putts: 2 };
  c.store.saveHoles(rid, h);

  await c.sync.syncFromServer();

  assert.equal((c.store.loadFromLS('reconcile_hold') || []).length, 0, 'no frena una ronda sola');
  assert.equal(rowsOf(b, 'rounds').length, 1, 'la sube sin preguntar, como debe');
  assert.equal(rowsOf(b, 'holes').length, 18, 'con sus 18 hoyos');
});
