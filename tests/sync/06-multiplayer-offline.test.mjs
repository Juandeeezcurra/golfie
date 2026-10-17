import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBackend, makeClient, rowsOf } from './harness.mjs';

test('scores Scramble de cuatro jugadores quedan locales offline y se reconcilian sin duplicados', async () => {
  const backend = makeBackend();
  const client = makeClient(backend, { online: false });
  const round = {
    round_id: 'r-scramble-offline', user_id: client.store.getUserId(), date: '2026-10-16',
    course_name: 'Jockey Azul', tees: 'Blancos', format: 'scramble', course_holes_count: 18,
    course_rating: 72, slope_rating: 113,
  };
  const players = [
    { player_id: 'p1', name: 'Ana', handicap_index: 10, team_id: 'A', playing_handicap: 10 },
    { player_id: 'p2', name: 'Bruno', handicap_index: 20, team_id: 'A', playing_handicap: 20 },
    { player_id: 'p3', name: 'Caro', handicap_index: 4, team_id: 'B', playing_handicap: 4 },
    { player_id: 'p4', name: 'Dante', handicap_index: 16, team_id: 'B', playing_handicap: 16 },
  ].map(p => ({ ...p, round_id: round.round_id }));

  client.store.saveRoundToLS(round);
  client.store.saveRoundPlayers(round.round_id, players);
  for (const player of players) {
    client.store.savePlayerToLS(player);
    client.store.saveHoles(round.round_id, {
      1: { round_id: round.round_id, player_id: player.player_id, hole_number: 1, par: 4, score: player.team_id === 'A' ? 5 : 4, putts: 2, stroke_index: 1 },
    }, player.player_id);
    await client.sync.postToSheets('savePlayer', player);
    await client.sync.postToSheets('addRoundPlayer', player);
    await client.sync.postToSheets('addHole', { round_id: round.round_id, player_id: player.player_id, hole_number: 1, par: 4, score: player.team_id === 'A' ? 5 : 4, putts: 2, stroke_index: 1 });
  }
  await client.sync.postToSheets('addRound', round);

  assert.equal(rowsOf(backend, 'rounds').length, 0);
  assert.equal(rowsOf(backend, 'holes').length, 0);
  assert.equal(client.store.loadHoles(round.round_id, 'p4')[1].score, 4, 'el score del cuarto jugador sigue guardado local');

  client.net.offline = false;
  await client.sync.syncFromServer();
  await client.sync.syncFromServer();

  assert.equal(rowsOf(backend, 'rounds').length, 1);
  assert.equal(rowsOf(backend, 'players').length, 4);
  assert.equal(rowsOf(backend, 'round_players').length, 4);
  assert.equal(rowsOf(backend, 'holes').length, 4, 'cada tarjeta de jugador llega una vez');
  assert.equal(client.sync.queueGet().length, 0);
});
