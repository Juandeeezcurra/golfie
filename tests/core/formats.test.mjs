import test from 'node:test';
import assert from 'node:assert/strict';
import { scrambleTeamHandicap } from '../../public/js/core/formats.js';
import { roundStandings } from '../../public/js/core/standings.js';

const players = [
  { player_id: 'p1', name: 'Ada', team_id: 'A', playing_handicap: 10 },
  { player_id: 'p2', name: 'Beto', team_id: 'A', playing_handicap: 20 },
  { player_id: 'p3', name: 'Cami', team_id: 'B', playing_handicap: 4 },
  { player_id: 'p4', name: 'Dani', team_id: 'B', playing_handicap: 16 },
];

test('Scramble combina 35% del handicap menor y 15% del mayor', () => {
  assert.equal(scrambleTeamHandicap([10, 20]), 7);
  assert.equal(scrambleTeamHandicap([4, 16]), 4);
  assert.equal(scrambleTeamHandicap([4]), null);
});

test('Scramble calcula y ordena el neto por equipo usando el stroke index', () => {
  const holes = Object.fromEntries(players.map(p => [p.player_id, {
    1: { hole_number: 1, par: 4, score: p.team_id === 'A' ? 5 : 4, stroke_index: 1 },
  }]));
  const rows = roundStandings('scramble', players, holes, 18, 1);
  assert.deepEqual(rows.map(r => r.team_id), ['B', 'A']);
  assert.equal(rows[0].value, 3);
  assert.equal(rows[1].value, 4);
  assert.equal(rows[1].name, 'Equipo A · Ada + Beto');
});

test('si falta el handicap de una persona, ambos equipos se comparan gross', () => {
  const incomplete = players.map(p => p.player_id === 'p4' ? { ...p, playing_handicap: null } : p);
  const holes = Object.fromEntries(incomplete.map(p => [p.player_id, {
    1: { hole_number: 1, par: 4, score: p.team_id === 'A' ? 5 : 4, stroke_index: 1 },
  }]));
  const rows = roundStandings('scramble', incomplete, holes, 18, 1);
  assert.deepEqual(rows.map(r => r.value), [4, 5]);
});
