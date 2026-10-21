// Corregir una ronda ya terminada (hoyos, totales, palos) tiene que llegar al
// servidor y no ser pisado por el sync de vuelta, ni siquiera sin señal.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackend, makeClient, rowsOf } from './harness.mjs';

async function uploadedRound(client, rid) {
  const round = {
    round_id: rid, user_id: client.store.getUserId(), date: '2026-10-20T12:00:00Z',
    course_name: 'Olivos', tees: 'Blancos', slope_rating: 130, course_rating: 71,
    total_score: 90, par_total: 72, holes_played: 18, completed: true,
  };
  client.store.saveRoundToLS(round);
  const holes = {};
  for (let i = 1; i <= 18; i++) {
    holes[i] = { round_id: rid, hole_number: i, par: 4, score: 5, putts: 2, fairway_hit: true, green_in_regulation: false, penalties: 0, up_and_down: false, sand_save: false };
  }
  client.store.saveHoles(rid, holes);
  client.store.saveClubs(rid, { Driver: { rating: 'verde', tags: ['Recto'] }, Putter: { rating: 'amarillo', tags: [] } });
  await client.sync.syncFromServer();
  return round;
}

const clubRows = b => Object.fromEntries(rowsOf(b, 'club_feedback').map(r => [r.club, r]));

test('editar un palo y borrar otro llega al servidor', async () => {
  const b = makeBackend();
  const c = makeClient(b);
  await uploadedRound(c, 'r-ed-1');

  c.store.saveClubs('r-ed-1', { Driver: { rating: 'rojo', tags: ['Slice'] }, Putter: { rating: null, tags: [] } });
  for (const club of ['Driver', 'Putter']) {
    const fb = c.store.loadClubs('r-ed-1')[club];
    await c.sync.postToSheets('addClubFeedback', { round_id: 'r-ed-1', club, rating: fb.rating || '', tags: fb.tags.join(',') });
  }
  const rows = clubRows(b);
  assert.equal(rows.Driver.rating, 'rojo');
  assert.equal(rows.Driver.tags, 'Slice');
  assert.ok(!rows.Putter.rating, 'el semáforo borrado también se borra del servidor');
});

test('una corrección de palos hecha sin señal sobrevive al sync y se sube después', async () => {
  const b = makeBackend();
  const c = makeClient(b);
  await uploadedRound(c, 'r-ed-2');

  c.net.offline = true;
  c.store.saveClubs('r-ed-2', { Driver: { rating: 'rojo', tags: ['Slice'] }, Putter: { rating: 'amarillo', tags: [] } });
  await c.sync.postToSheets('addClubFeedback', { round_id: 'r-ed-2', club: 'Driver', rating: 'rojo', tags: 'Slice' });
  assert.equal(c.sync.queueGet().length, 1, 'quedó en cola');

  c.net.offline = false;
  await c.sync.syncFromServer();
  assert.equal(c.store.loadClubs('r-ed-2').Driver.rating, 'rojo', 'el sync no pisó la corrección local');
  assert.equal(clubRows(b).Driver.rating, 'rojo', 'y llegó al servidor');
  assert.equal(c.sync.queueGet().length, 0);
});

test('un hoyo corregido sin señal mantiene el total nuevo después del sync', async () => {
  const b = makeBackend();
  const c = makeClient(b);
  const round = await uploadedRound(c, 'r-ed-3');

  c.net.offline = true;
  const holes = c.store.loadHoles('r-ed-3');
  holes[4] = { ...holes[4], score: 3, putts: 1 };
  c.store.saveHoles('r-ed-3', holes);
  const updated = { ...round, total_score: 88, total_putts: 35 };
  c.store.saveRoundToLS(updated);
  await c.sync.postToSheets('addHole', holes[4]);
  await c.sync.postToSheets('updateRound', updated);

  c.net.offline = false;
  await c.sync.syncFromServer();
  const local = c.store.loadRounds().find(r => r.round_id === 'r-ed-3');
  assert.equal(local.total_score, 88, 'el total local no vuelve a 90');
  assert.equal(rowsOf(b, 'rounds')[0].total_score, 88);
  assert.equal(rowsOf(b, 'holes').find(h => h.hole_number === 4).score, 3);
});
