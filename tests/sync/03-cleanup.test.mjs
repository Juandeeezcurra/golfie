// Rondas ajenas ya guardadas en el celular: no se adoptan solas, la cola
// envenenada se purga, y lo que se descarta se borra de los dos lados.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackend, makeClient, rowsOf } from './harness.mjs';
import { applyCleanup } from '../../public/js/ui/repair.js';

// Reproduce el estado real del celular: rondas ajenas y propias, todas sin
// user_id, ya guardadas por los syncs viejos.
function seedEstadoReal(c) {
  const rounds = [];
  const mk = (rid, cancha) => {
    rounds.push({
      round_id: rid, date: '2026-08-20', course_name: cancha, tees: 'Blancos',
      slope_rating: 130, course_rating: 71, total_score: 90, par_total: 72,
      holes_played: 18, completed: true,
    });
    const holes = {};
    for (let i = 1; i <= 18; i++) holes[i] = { round_id: rid, hole_number: i, par: 4, score: 5, putts: 2 };
    c.store.saveHoles(rid, holes);
  };
  for (let i = 0; i < 10; i++) mk('r-palermo-' + i, 'Palermo GC');   // ajenas
  mk('r-mia-1', 'Olivos');                                           // tuya, vieja
  mk('r-mia-2', 'Cañuelas');                                         // tuya, vieja
  c.store.saveRounds(rounds);
}

test('A) reconcile no adopta rondas sin dueño', async () => {
  const b = makeBackend();
  const c = makeClient(b);
  seedEstadoReal(c);

  await c.sync.syncFromServer();

  assert.equal(c.sync.queueGet().length, 0, 'no encoló nada (antes eran 200+ ítems)');
  assert.equal(rowsOf(b, 'rounds').length, 0, 'no subió ninguna Palermo al servidor');
});

test('B) la cola envenenada se purga al arrancar', async () => {
  const b = makeBackend();
  const c = makeClient(b);
  seedEstadoReal(c);

  // Los 228 pendientes que dejó la versión anterior.
  const cola = [];
  c.store.loadRounds().forEach(r => {
    cola.push({ id: 'q' + cola.length, endpoint: 'addRound', data: { ...r, user_id: c.store.getUserId() }, ts: 1 });
    for (let i = 1; i <= 18; i++) {
      cola.push({
        id: 'q' + cola.length, endpoint: 'addHole',
        data: { round_id: r.round_id, hole_number: i, par: 4, score: 5, putts: 2, user_id: c.store.getUserId() }, ts: 1,
      });
    }
  });
  c.store.saveToLS('pending_sync', cola);

  assert.equal(c.sync.queueGet().length, 228, 'arranca con 228 pendientes');
  const sacados = c.sync.purgeOrphanQueue();
  assert.equal(sacados, 228, 'purgeOrphanQueue sacó los 228 de rondas sin dueño');
  assert.equal(c.sync.queueGet().length, 0, 'la cola quedó vacía sin subir nada');
  assert.equal(rowsOf(b, 'rounds').length, 0, 'el servidor quedó limpio');
});

test('C) limpieza: marco Olivos y Cañuelas como mías, Palermo no', async () => {
  const b = makeBackend();
  const c = makeClient(b);
  seedEstadoReal(c);

  assert.equal(c.sync.orphanRounds().length, 12, 'detecta las 12 rondas sin identificar');

  c.setCheckboxes(new Set(['Olivos', 'Cañuelas']));
  applyCleanup();
  await new Promise(r => setTimeout(r, 0));
  await c.sync.flushPending();

  const nombres = c.store.loadRounds().map(r => r.course_name).sort();
  assert.equal(nombres.length, 2, 'quedan 2 rondas en la app: ' + nombres.join(', '));
  assert.ok(!nombres.includes('Palermo GC'), 'Palermo GC desapareció de la app');
  assert.equal(c.sync.orphanRounds().length, 0, 'ya no hay rondas sin identificar');

  const enServidor = rowsOf(b, 'rounds').map(r => r.course_name).sort();
  assert.equal(enServidor.length, 2, 'al servidor subieron sólo las tuyas: ' + enServidor.join(', '));
  assert.ok(!enServidor.includes('Palermo GC'));
  assert.equal(rowsOf(b, 'holes').length, 36, 'con sus 36 hoyos (18 x 2)');

  await c.sync.syncFromServer();
  const despues = c.store.loadRounds().map(r => r.course_name).sort();
  assert.equal(despues.length, 2, 'y Palermo no vuelve con el sync');
  assert.ok(!despues.includes('Palermo GC'));
});

test('D) Palermo ya subida al servidor se borra también de ahí', async () => {
  const b = makeBackend();
  const c = makeClient(b);
  seedEstadoReal(c);

  // El daño ya hecho: Palermo subida con tu código.
  for (const r of c.store.loadRounds().filter(r => r.course_name === 'Palermo GC')) {
    await c.sync.postToSheets('addRound', r);
  }
  assert.equal(rowsOf(b, 'rounds').length, 10, 'el servidor tiene las 10 Palermo firmadas con tu código');

  c.setCheckboxes(new Set(['Olivos', 'Cañuelas']));
  applyCleanup();
  await new Promise(r => setTimeout(r, 0));
  await c.sync.flushPending();

  const enServidor = rowsOf(b, 'rounds').map(r => r.course_name);
  assert.ok(!enServidor.includes('Palermo GC'), 'se borraron del servidor');
  assert.equal(enServidor.length, 2, 'y quedaron sólo las tuyas');
});
