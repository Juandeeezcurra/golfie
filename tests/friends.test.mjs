// La capa de datos de amigos (public/js/friends.js) lee directo de app.store,
// así que se arma un store falso en memoria en vez de mockear cada función.
import test from 'node:test';
import assert from 'node:assert/strict';
import { app } from '../public/js/context.js';
import { createStore } from '../public/js/store.js';
import { listFriends, friendRounds, friendAllHoles, friendRoundCount, saveFriend } from '../public/js/friends.js';

function fakeStorage() {
  const map = new Map();
  return { getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, String(v)), removeItem: k => map.delete(k) };
}

function setup() {
  app.store = createStore(fakeStorage());
  app.sync = { postToSheets: () => {} };   // no hace falta red para estos tests
  return app.store;
}

const hole = (n, par, score, extra = {}) => ({ hole_number: n, par, score, putts: 2, ...extra });

test('friendRounds recalcula LOS TOTALES DEL AMIGO, no los de la ronda (que son de "me")', () => {
  const store = setup();
  const round = { round_id: 'r-1', date: '2026-10-20', course_name: 'Bulogne', course_holes_count: 9, total_score: 44, par_total: 35, completed: true };
  store.saveRoundToLS(round);
  store.saveRoundPlayers('r-1', [
    { round_id: 'r-1', player_id: 'me', name: 'Yo' },
    { round_id: 'r-1', player_id: 'p-pinte', name: 'Pinte', handicap_index: 25 },
  ]);
  // "me" hizo 44, Pinte hizo 54 — el total de la ronda (44) es el de "me".
  const meHoles = Array.from({ length: 9 }, (_, i) => hole(i + 1, 4, 5));
  const pinteHoles = Array.from({ length: 9 }, (_, i) => hole(i + 1, 4, 6));
  store.saveHoles('r-1', Object.fromEntries(meHoles.map(h => [h.hole_number, h])), 'me');
  store.saveHoles('r-1', Object.fromEntries(pinteHoles.map(h => [h.hole_number, h])), 'p-pinte');

  const [pinteRound] = friendRounds('p-pinte');
  assert.equal(pinteRound.total_score, 54, 'usa los golpes de Pinte, no los 44 de la ronda');
  assert.equal(pinteRound.par_total, 36);
  assert.equal(pinteRound.hcp_index, 25, 'toma el handicap guardado en round_players, no el de la ronda');
  assert.equal(pinteRound.completed, true);
});

test('un jugador que no participó en la ronda no aparece en su historial', () => {
  const store = setup();
  store.saveRoundToLS({ round_id: 'r-1', date: '2026-10-20', course_name: 'X', completed: true, total_score: 90, par_total: 72 });
  store.saveRoundPlayers('r-1', [{ round_id: 'r-1', player_id: 'me', name: 'Yo' }]);
  store.saveHoles('r-1', { 1: hole(1, 4, 5) }, 'me');

  assert.deepEqual(friendRounds('p-nadie-lo-sumo'), []);
  assert.equal(friendRoundCount('p-nadie-lo-sumo'), 0);
});

test('una ronda incompleta del amigo (menos hoyos que el total) no se cuenta como terminada', () => {
  const store = setup();
  store.saveRoundToLS({ round_id: 'r-1', date: '2026-10-20', course_name: 'X', course_holes_count: 18, completed: false });
  store.saveRoundPlayers('r-1', [
    { round_id: 'r-1', player_id: 'me', name: 'Yo' },
    { round_id: 'r-1', player_id: 'p-pinte', name: 'Pinte' },
  ]);
  // Pinte sólo llegó a cargar 9 de 18.
  store.saveHoles('r-1', Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, hole(i + 1, 4, 5)])), 'p-pinte');

  const [pinteRound] = friendRounds('p-pinte');
  assert.equal(pinteRound.completed, false, 'con 9 de 18 hoyos no está terminada');
  assert.equal(pinteRound.holes_played, 9);
});

test('friendAllHoles junta los hoyos de todas sus rondas', () => {
  const store = setup();
  ['r-1', 'r-2'].forEach(rid => {
    store.saveRoundToLS({ round_id: rid, date: '2026-10-20', course_name: 'X', course_holes_count: 9, completed: true, total_score: 40, par_total: 36 });
    store.saveRoundPlayers(rid, [{ round_id: rid, player_id: 'p-pinte', name: 'Pinte' }]);
    store.saveHoles(rid, Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 1, hole(i + 1, 4, 5)])), 'p-pinte');
  });
  assert.equal(friendAllHoles('p-pinte').length, 18);
});

test('saveFriend crea y después actualiza el mismo jugador, sin duplicarlo', () => {
  setup();
  saveFriend({ player_id: 'p-pinte', name: 'Pinte', handicap_index: 30 });
  saveFriend({ player_id: 'p-pinte', name: 'Pinte', handicap_index: 25 });
  const friends = listFriends();
  assert.equal(friends.length, 1);
  assert.equal(friends[0].handicap_index, 25);
});
