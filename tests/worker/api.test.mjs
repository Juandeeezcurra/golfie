// Prueba el Worker de Cloudflare (src/index.js + src/db.js) contra un D1
// falso en memoria. Cubre los mismos invariantes que tests/suites/ protege
// para el backend viejo de Apps Script — ver tests/README.md.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, get, post, rowsOf } from './helpers.mjs';

test('ping anuncia v=3 y capacidades para jugadores', async () => {
  const env = makeEnv();
  const out = await get(env, 'ping');
  assert.equal(out.ok, true);
  assert.equal(out.v, 3);
  assert.ok(out.caps.includes('player_holes'));
});

test('addRound inserta, reenviarlo no duplica (upsert)', async () => {
  const env = makeEnv();
  const r = { round_id: 'r-1', date: '2026-08-20', course_name: 'Olivos', tees: 'Blancos', user_id: 'u-aaa' };
  await post(env, 'addRound', r);
  await post(env, 'addRound', r);
  await post(env, 'addRound', r);
  assert.equal(rowsOf(env, 'rounds').length, 1);
});

test('updateRound crea la fila si addRound nunca llegó', async () => {
  const env = makeEnv();
  await post(env, 'updateRound', {
    round_id: 'r-2', date: 'x', course_name: 'Cañuelas', tees: 'Blancos',
    user_id: 'u-aaa', total_score: 88, completed: true,
  });
  const rows = rowsOf(env, 'rounds');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].total_score, 88);
  assert.equal(rows[0].completed, 1);
});

test('getRounds nunca devuelve filas sin dueño', async () => {
  const env = makeEnv();
  // Fila vieja, previa al user_id (simula lo que había en el Sheet migrado).
  env.DB.db.exec(`INSERT INTO rounds (round_id, course_name, user_id) VALUES ('r-vieja', 'Olivos', '')`);
  const out = await get(env, 'getRounds', { user_id: 'u-aaa' });
  assert.deepEqual(out, []);
});

test('aislamiento entre usuarios', async () => {
  const env = makeEnv();
  await post(env, 'addRound', { round_id: 'r-mia', date: 'x', course_name: 'Olivos', user_id: 'u-yo' });
  await post(env, 'addRound', { round_id: 'r-suya', date: 'x', course_name: 'Palermo GC', user_id: 'u-otro' });

  const mias = await get(env, 'getRounds', { user_id: 'u-yo' });
  assert.equal(mias.length, 1);
  assert.equal(mias[0].course_name, 'Olivos');
  assert.equal(rowsOf(env, 'rounds').length, 2, 'las dos siguen guardadas en la base');
});

test('fila sin dueño se adopta al escribir, nunca sola', async () => {
  const env = makeEnv();
  env.DB.db.exec(`INSERT INTO rounds (round_id, course_name, user_id) VALUES ('r-vieja', 'Olivos', '')`);

  // Antes de reclamarla, es invisible.
  assert.deepEqual(await get(env, 'getRounds', { user_id: 'u-aaa' }), []);

  // addRound con el mismo round_id la reclama (upsert, no inserta una 2da fila).
  await post(env, 'addRound', { round_id: 'r-vieja', date: 'x', course_name: 'Olivos', user_id: 'u-aaa' });
  assert.equal(rowsOf(env, 'rounds').length, 1, 'no se duplicó: se adoptó la misma fila');

  const mias = await get(env, 'getRounds', { user_id: 'u-aaa' });
  assert.equal(mias.length, 1);
});

test('addHole upsert por round_id + hole_number', async () => {
  const env = makeEnv();
  const base = { round_id: 'r-1', hole_number: 5, par: 4, score: 5, putts: 2, user_id: 'u-aaa' };
  await post(env, 'addHole', base);
  await post(env, 'addHole', { ...base, score: 4 }); // corrección del mismo hoyo
  const rows = rowsOf(env, 'holes');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].score, 4);
});

test('addHole con fairway_hit null (par 3) no rompe los chequeos true/false', async () => {
  const env = makeEnv();
  await post(env, 'addHole', {
    round_id: 'r-1', hole_number: 3, par: 3, score: 3, putts: 2, fairway_hit: null, user_id: 'u-aaa',
  });
  const [hole] = await get(env, 'getHoles', { user_id: 'u-aaa' });
  assert.notEqual(hole.fairway_hit, true);
  assert.notEqual(hole.fairway_hit, false);
});

test('addClubFeedback upsert por round_id + club', async () => {
  const env = makeEnv();
  const base = { round_id: 'r-1', club: 'Driver', rating: 'bien', tags: 'Recto', user_id: 'u-aaa' };
  await post(env, 'addClubFeedback', base);
  await post(env, 'addClubFeedback', { ...base, tags: 'Recto,Largo' });
  const rows = rowsOf(env, 'club_feedback');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tags, 'Recto,Largo');
});

test('deleteRound sólo borra lo propio, de las 3 tablas', async () => {
  const env = makeEnv();
  await post(env, 'addRound', { round_id: 'r-1', date: 'x', course_name: 'Olivos', user_id: 'u-aaa' });
  await post(env, 'addHole', { round_id: 'r-1', hole_number: 1, par: 4, score: 5, putts: 2, user_id: 'u-aaa' });
  await post(env, 'addClubFeedback', { round_id: 'r-1', club: 'Driver', user_id: 'u-aaa' });

  const otro = await post(env, 'deleteRound', { round_id: 'r-1', user_id: 'u-otro' });
  assert.equal(otro.result.removed, 0, 'otro usuario no puede borrar lo que no es suyo');

  const mio = await post(env, 'deleteRound', { round_id: 'r-1', user_id: 'u-aaa' });
  assert.equal(mio.result.removed, 3, 'borra la ronda + el hoyo + el feedback');
  assert.equal(rowsOf(env, 'rounds').length, 0);
  assert.equal(rowsOf(env, 'holes').length, 0);
  assert.equal(rowsOf(env, 'club_feedback').length, 0);
});

test('acción desconocida no rompe el Worker', async () => {
  const env = makeEnv();
  const out = await post(env, 'borrarTodoElSheet', { round_id: 'x' });
  assert.equal(out.ok, false);
});
