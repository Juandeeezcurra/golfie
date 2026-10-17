// Regresiones de sincronización: escrituras perdidas, la carrera al vaciar la
// cola, juego sin señal, POST no confirmable, aislamiento entre usuarios y
// borrado. Portado del harness viejo (Sheets) al stack actual (Worker + D1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackend, makeClient, rowsOf } from './harness.mjs';

// Deja una ronda completa SÓLO en el celular (lo que pasó con Cañuelas).
function seedLocal(client, name, rid) {
  const r = {
    round_id: rid, user_id: client.store.getUserId(), date: new Date().toISOString(),
    course_name: name, tees: 'Blancos', slope_rating: 130, course_rating: 71,
    total_score: 90, par_total: 72, total_putts: 34, holes_played: 18, completed: true,
  };
  client.store.saveRoundToLS(r);
  const holes = {};
  for (let i = 1; i <= 18; i++) {
    holes[i] = {
      round_id: rid, hole_number: i, par: 4, score: 5, putts: 2,
      fairway_hit: true, green_in_regulation: false, penalties: 0, up_and_down: false, sand_save: false,
    };
  }
  client.store.saveHoles(rid, holes);
  client.store.saveClubs(rid, { Driver: { rating: 'bien', tags: ['Recto'] } });
  return r;
}

test('1) ronda normal: todo llega al servidor', async () => {
  const b = makeBackend();
  const c = makeClient(b);
  const rid = 'r-ok-1';
  const r = { round_id: rid, date: '2026-08-20', course_name: 'Olivos', tees: 'Blancos', slope_rating: 130, course_rating: 71 };

  await c.sync.postToSheets('addRound', r);
  for (let i = 1; i <= 3; i++) {
    await c.sync.postToSheets('addHole', { round_id: rid, hole_number: i, par: 4, score: 5, putts: 2 });
  }
  await c.sync.postToSheets('updateRound', { ...r, total_score: 88, holes_played: 3, completed: true });

  assert.equal(rowsOf(b, 'rounds').length, 1, 'la ronda está en rounds');
  assert.equal(rowsOf(b, 'holes').length, 3, 'los 3 hoyos están en holes');
  assert.equal(rowsOf(b, 'rounds')[0].total_score, 88, 'el score final se guardó');
  assert.equal(c.sync.queueGet().length, 0, 'la cola quedó vacía');
});

test('2) ronda que quedó sólo en el celular: reconcile la sube', async () => {
  const b = makeBackend();
  const c = makeClient(b);
  seedLocal(c, 'Cañuelas', 'r-canuelas');

  assert.equal(rowsOf(b, 'rounds').length, 0, 'arranca ausente del servidor');
  await c.sync.syncFromServer();

  const rounds = rowsOf(b, 'rounds');
  assert.equal(rounds.length, 1);
  assert.equal(rounds[0].course_name, 'Cañuelas', 'reconcile la subió');
  assert.equal(rounds[0].total_score, 90, 'con el score correcto');
  assert.equal(rowsOf(b, 'holes').length, 18, 'los 18 hoyos también subieron');
  assert.equal(rowsOf(b, 'club_feedback').length, 1, 'el feedback de palos también');
  assert.equal(c.sync.queueGet().length, 0, 'la cola quedó vacía');
});

test('3) reconciliar de nuevo no duplica nada', async () => {
  const b = makeBackend();
  const c = makeClient(b);
  seedLocal(c, 'Cañuelas', 'r-canuelas');

  await c.sync.syncFromServer();
  await c.sync.syncFromServer();
  await c.sync.syncFromServer();

  assert.equal(rowsOf(b, 'rounds').length, 1, 'sigue habiendo 1 sola ronda');
  assert.equal(rowsOf(b, 'holes').length, 18, 'siguen siendo 18 hoyos');
  assert.equal(rowsOf(b, 'club_feedback').length, 1, 'sigue habiendo 1 feedback');
});

test('4) carrera: guardar hoyos en paralelo no pierde ninguno', async () => {
  const b = makeBackend();
  const c = makeClient(b);
  const rid = 'r-race';
  await c.sync.postToSheets('addRound', { round_id: rid, date: 'x', course_name: 'Jockey', tees: 'Azules' });

  // 18 postToSheets sin await entre sí: es el patrón exacto de saveHole().
  await Promise.all(Array.from({ length: 18 }, (_, i) =>
    c.sync.postToSheets('addHole', { round_id: rid, hole_number: i + 1, par: 4, score: 4, putts: 2 })));
  await c.sync.flushPending();

  assert.equal(rowsOf(b, 'holes').length, 18, 'llegaron los 18 hoyos, sin perder ninguno');
  assert.equal(c.sync.queueGet().length, 0, 'la cola quedó vacía');
});

test('5) sin señal: nada se pierde, se recupera al volver', async () => {
  const b = makeBackend();
  const c = makeClient(b, { online: false });
  const rid = 'r-offline';

  await c.sync.postToSheets('addRound', { round_id: rid, date: 'x', course_name: 'Cañuelas', tees: 'Blancos' });
  for (let i = 1; i <= 18; i++) {
    await c.sync.postToSheets('addHole', { round_id: rid, hole_number: i, par: 4, score: 5, putts: 2 });
  }

  assert.equal(rowsOf(b, 'rounds').length, 0, 'sin red no llegó nada');
  assert.equal(c.sync.queueGet().length, 19, 'los 19 cambios quedaron en la cola');

  c.net.offline = false;                 // vuelve la señal
  await c.sync.flushPending();

  assert.equal(rowsOf(b, 'rounds').length, 1, 'al volver la señal subió la ronda');
  assert.equal(rowsOf(b, 'holes').length, 18, 'y los 18 hoyos');
  assert.equal(c.sync.queueGet().length, 0, 'la cola se vació recién ahora');
});

test('6) POST que el navegador no deja leer: no se da por guardado', async () => {
  const b = makeBackend();
  const c = makeClient(b, { readable: false });
  const rid = 'r-cors';

  await c.sync.postToSheets('addRound', { round_id: rid, date: 'x', course_name: 'Pilar', tees: 'Blancos' });

  assert.equal(rowsOf(b, 'rounds').length, 1, 'el dato igual llegó');
  assert.equal(c.sync.queueGet().length, 1, 'queda en la cola porque no hubo confirmación');

  c.net.readable = true;
  await c.sync.syncFromServer();

  assert.equal(c.sync.queueGet().length, 0, 'el sync confirma que ya está y limpia la cola');
  assert.equal(rowsOf(b, 'rounds').length, 1, 'sin duplicar la fila');
});

test('7) aislamiento entre usuarios', async () => {
  const b = makeBackend();
  const yo = makeClient(b);
  const otro = makeClient(b);

  await yo.sync.postToSheets('addRound', { round_id: 'r-mia', date: 'x', course_name: 'Olivos', tees: 'Blancos' });
  await otro.sync.postToSheets('addRound', { round_id: 'r-suya', date: 'x', course_name: 'Palermo GC', tees: 'Rojos' });

  await yo.sync.syncFromServer();

  const mias = yo.store.loadRounds().map(r => r.course_name);
  assert.deepEqual(mias, ['Olivos'], 'sólo veo la mía, no la de Palermo GC');
  assert.equal(rowsOf(b, 'rounds').length, 2, 'las dos siguen guardadas en el servidor');
});

test('8) borrar una ronda la saca del servidor y no vuelve', async () => {
  const b = makeBackend();
  const c = makeClient(b);
  seedLocal(c, 'Cañuelas', 'r-del');
  await c.sync.syncFromServer();
  assert.equal(rowsOf(b, 'rounds').length, 1, 'la ronda está en el servidor');

  await c.sync.postToSheets('deleteRound', { round_id: 'r-del' });
  c.store.saveRounds(c.store.loadRounds().filter(r => r.round_id !== 'r-del'));
  c.store.removeRoundData('r-del');

  assert.equal(rowsOf(b, 'rounds').length, 0, 'se borró del servidor');
  assert.equal(rowsOf(b, 'holes').length, 0, 'sus hoyos también');

  await c.sync.syncFromServer();
  assert.equal(c.store.loadRounds().length, 0, 'y no volvió con el próximo sync');
});
