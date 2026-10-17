// Rondas ajenas que YA quedaron firmadas con tu código (la limpieza no las ve,
// porque técnicamente son "tuyas"), y el borrado a mano en el servidor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackend, makeClient, rowsOf } from './harness.mjs';
import { applyRepair } from '../../public/js/ui/repair.js';

test('E) Palermo ya adoptada con tu código: la repara "Reparar datos"', async () => {
  const b = makeBackend();
  const c = makeClient(b);
  const uid = c.store.getUserId();

  const rounds = [];
  const mk = (rid, cancha) => {
    rounds.push({
      round_id: rid, user_id: uid, date: '2026-08-20', course_name: cancha, tees: 'Blancos',
      slope_rating: 130, course_rating: 71, total_score: 90, par_total: 72,
      holes_played: 18, completed: true,
    });
    const h = {};
    for (let i = 1; i <= 18; i++) h[i] = { round_id: rid, hole_number: i, par: 4, score: 5, putts: 2 };
    c.store.saveHoles(rid, h);
  };
  for (let i = 0; i < 10; i++) mk('r-pal-' + i, 'Palermo GC');
  mk('r-mia', 'Cañuelas');
  c.store.saveRounds(rounds);

  for (const r of rounds) {
    await c.sync.postToSheets('addRound', r);
    for (let i = 1; i <= 18; i++) {
      await c.sync.postToSheets('addHole', { round_id: r.round_id, hole_number: i, par: 4, score: 5, putts: 2 });
    }
  }

  assert.equal(c.sync.orphanRounds().length, 0, 'la limpieza no las ve: ya tienen tu código');
  assert.equal(rowsOf(b, 'rounds').length, 11, 'el servidor tiene las 11');

  const resumen = Object.fromEntries(c.sync.coursesSummary().map(([cancha, n]) => [cancha, n.total]));
  assert.equal(resumen['Palermo GC'], 10, 'reparar sí las lista');
  assert.equal(resumen['Cañuelas'], 1);

  c.setCheckboxes(new Set(['Palermo GC']), true);
  applyRepair();
  await new Promise(r => setTimeout(r, 0));
  await c.sync.flushPending();

  assert.equal(c.store.loadRounds().length, 1, 'en la app queda 1 sola ronda');
  assert.equal(c.store.loadRounds()[0].course_name, 'Cañuelas', 'y es Cañuelas');

  const enServidor = rowsOf(b, 'rounds').map(r => r.course_name);
  assert.deepEqual(enServidor, ['Cañuelas'], 'en el servidor también quedó sólo Cañuelas');
  assert.equal(rowsOf(b, 'holes').length, 18, 'los hoyos de Palermo se borraron del servidor');

  await c.sync.syncFromServer();
  assert.equal(c.store.loadRounds().length, 1, 'Palermo NO vuelve con el sync');
  assert.equal(c.sync.queueGet().length, 0, 'la cola quedó vacía');
});

test('F) borrado a mano en el servidor: reconcile lo resucita (por diseño)', async () => {
  const b = makeBackend();
  const c = makeClient(b);
  const uid = c.store.getUserId();

  const r = { round_id: 'r-x', user_id: uid, date: 'x', course_name: 'Palermo GC', tees: 'Blancos', total_score: 90 };
  c.store.saveRounds([r]);
  await c.sync.postToSheets('addRound', r);
  assert.equal(rowsOf(b, 'rounds').length, 1, 'está en el servidor');

  // Lo borrás a mano directamente en la base.
  b.d1.db.prepare("DELETE FROM rounds WHERE round_id = 'r-x'").run();
  assert.equal(rowsOf(b, 'rounds').length, 0, 'lo borraste a mano');

  await c.sync.syncFromServer();
  assert.equal(rowsOf(b, 'rounds').length, 1, 'volvió: sigue en el celular, así que reconcile lo sube de nuevo');

  // La forma correcta: borrar desde la app.
  c.setCheckboxes(new Set(['Palermo GC']), true);
  applyRepair();
  await new Promise(res => setTimeout(res, 0));
  await c.sync.flushPending();
  assert.equal(rowsOf(b, 'rounds').length, 0, 'borrado desde la app: se va de los dos lados');

  await c.sync.syncFromServer();
  assert.equal(rowsOf(b, 'rounds').length, 0, 'y ahora sí no vuelve');
});
