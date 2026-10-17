// Filas viejas sin dueño: se adoptan A MANO, nunca solas.
// Adoptar por ausencia de dueño fue un bug real con daño real: las rondas de
// otra persona también están sin dueño.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackend, makeClient, rowsOf, seedServerRow } from './harness.mjs';
import { applyCleanup } from '../../public/js/ui/repair.js';

test('9) filas sin dueño: nadie las firma solo, y se adoptan a mano', async () => {
  const b = makeBackend();
  const c = makeClient(b);

  // Dos rondas viejas en el servidor, de antes de que existiera el user_id.
  seedServerRow(b, 'rounds', {
    round_id: 'r-vieja', date: '2026-05-01', course_name: 'Olivos', tees: 'Blancos',
    slope_rating: 130, course_rating: 71, total_score: 85, par_total: 72,
    total_putts: 32, fairways_hit: 8, greens_in_regulation: 6, holes_played: 18,
    completed: 1, user_id: '',
  });
  seedServerRow(b, 'rounds', {
    round_id: 'r-palermo', date: '2026-05-02', course_name: 'Palermo GC', tees: 'Rojos',
    slope_rating: 120, course_rating: 70, total_score: 99, par_total: 72,
    total_putts: 40, fairways_hit: 2, greens_in_regulation: 1, holes_played: 18,
    completed: 1, user_id: '',
  });

  // El celular tiene las dos: la tuya vieja y una de Palermo que entró por el
  // sync viejo, las dos sin user_id.
  c.store.saveRounds([
    { round_id: 'r-vieja', date: '2026-05-01', course_name: 'Olivos', tees: 'Blancos', total_score: 85, holes_played: 18, completed: true },
    { round_id: 'r-palermo', date: '2026-05-02', course_name: 'Palermo GC', tees: 'Rojos', total_score: 99, holes_played: 18, completed: true },
  ]);

  await c.sync.syncFromServer();

  assert.equal(c.sync.queueGet().length, 0, 'el sync no encoló nada por su cuenta');
  assert.ok(rowsOf(b, 'rounds').every(r => !r.user_id), 'ninguna fila del servidor se firmó sola');
  assert.equal(c.sync.orphanRounds().length, 2, 'las 2 quedan marcadas como sin identificar');

  // Ahora decide el usuario: Olivos es suya, Palermo no.
  c.setCheckboxes(new Set(['Olivos']));
  applyCleanup();
  await new Promise(r => setTimeout(r, 0));
  await c.sync.flushPending();

  const filas = rowsOf(b, 'rounds');
  const vieja = filas.find(r => r.round_id === 'r-vieja');
  assert.equal(filas.length, 1, 'en el servidor quedó 1 sola fila');
  assert.ok(vieja, 'y es la de Olivos');
  assert.equal(vieja.user_id, c.store.getUserId(), 'Olivos quedó firmada como tuya, sin duplicarse');
  assert.ok(!filas.find(r => r.round_id === 'r-palermo'), 'la de Palermo GC se borró del servidor');

  await c.sync.syncFromServer();
  const enApp = c.store.loadRounds().map(r => r.course_name);
  assert.deepEqual(enApp, ['Olivos'], 'en la app queda sólo Olivos');
  assert.equal(c.sync.orphanRounds().length, 0, 'no quedan rondas sin identificar');
});
