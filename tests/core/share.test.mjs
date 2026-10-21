import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShareModel, shareOptions } from '../../public/js/core/share.js';

const holes = (base, n = 18) => Object.fromEntries(Array.from({ length: n }, (_, i) => [i + 1, {
  hole_number: i + 1, par: 4, score: 4 + base, putts: 2, fairway_hit: true, green_in_regulation: false,
  penalties: 0, up_and_down: false, sand_save: false,
}]));
const round = { round_id: 'r1', course_name: 'Olivos', date: '2026-10-18', tees: 'Blancos', course_holes_count: 18, format: 'stroke' };
const players = [{ player_id: 'me', name: 'Yo' }, { player_id: 'p-pinte', name: 'Pinte' }];
const holesByPlayer = { me: holes(1), 'p-pinte': holes(2) };

test('opciones: todos más cada jugador', () => {
  assert.deepEqual(shareOptions({ round, players }).map(o => o.key), ['all', 'me', 'p-pinte']);
});

test('una ronda de un solo jugador no ofrece "todos"', () => {
  assert.deepEqual(shareOptions({ round, players: [players[0]] }).map(o => o.key), ['me']);
});

test('el nombre propio se puede cambiar', () => {
  const [, me] = shareOptions({ round, players, names: { me: 'Juan' } });
  assert.equal(me.label, 'Juan');
});

test('todos: una fila por jugador, con posiciones', () => {
  const m = buildShareModel({ round, players, holesByPlayer });
  assert.equal(m.mode, 'group');
  assert.equal(m.rows.length, 2);
  assert.equal(m.standings.rows[0].name, 'Yo');
  assert.equal(m.standings.rows[0].value, 90);
  assert.equal(m.standings.label, 'Golpes');
});

test('sólo Pinte: modelo individual con sus golpes y sin tabla de posiciones', () => {
  const m = buildShareModel({ round, players, holesByPlayer, selection: 'p-pinte' });
  assert.equal(m.mode, 'single');
  assert.equal(m.rows[0].name, 'Pinte');
  assert.equal(m.rows[0].total.score, 108);
  assert.equal(m.rows[0].diff, 36);
  assert.equal(m.standings, null);
});

test('las posiciones respetan el formato', () => {
  const m = buildShareModel({ round: { ...round, format: 'stableford' }, players, holesByPlayer });
  assert.equal(m.standings.label, 'Puntos');
  assert.equal(m.formatLabel, 'Stableford');
});

test('scramble: filas por equipo, nombres cortos y posiciones por equipo', () => {
  const four = [
    { player_id: 'me', name: 'Yo', team_id: 'A' }, { player_id: 'p-ana', name: 'Ana', team_id: 'A' },
    { player_id: 'p-pinte', name: 'Pinte', team_id: 'B' }, { player_id: 'p-leo', name: 'Leo', team_id: 'B' },
  ];
  const by = { me: holes(1), 'p-ana': holes(1), 'p-pinte': holes(2), 'p-leo': holes(2) };
  const r = { ...round, format: 'scramble' };
  assert.deepEqual(shareOptions({ round: r, players: four }).map(o => o.key), ['all', 'team:A', 'team:B']);
  const m = buildShareModel({ round: r, players: four, holesByPlayer: by });
  assert.equal(m.rows.length, 2);
  assert.deepEqual(m.rows.map(x => x.short).sort(), ['Equipo A', 'Equipo B']);
  assert.equal(m.standings.label, 'Golpes equipo');
  const only = buildShareModel({ round: r, players: four, holesByPlayer: by, selection: 'team:B' });
  assert.equal(only.rows.length, 1);
  assert.equal(only.rows[0].total.score, 108);
});

test('una ronda de 9 hoyos sólo llena la ida', () => {
  const m = buildShareModel({ round: { ...round, course_holes_count: 9 }, players: [players[0]], holesByPlayer: { me: holes(0, 9) } });
  assert.equal(m.holesCount, 9);
  assert.equal(m.rows[0].back.played, 0);
  assert.equal(m.rows[0].front.score, 36);
});
