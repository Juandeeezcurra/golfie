import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPastRound } from '../../public/js/core/past-round.js';
import { roundTotals, displayStats } from '../../public/js/core/stats.js';

const base = { roundId: 'r-1', userId: 'u-test123456', course: 'Olivos', date: '2026-05-10' };
const pars = Array.from({ length: 18 }, (_, i) => [4, 3, 5][i % 3]);
const scores = pars.map(p => String(p + 1));
const upTo = n => scores.map((s, i) => (i < n ? s : ''));

test('arma la ronda con totales y hoyos sólo con par y golpes', () => {
  const { round, holes, error } = buildPastRound({ ...base, pars, scores });
  assert.equal(error, undefined);
  assert.equal(holes.length, 18);
  assert.deepEqual(Object.keys(holes[0]).sort(), ['hole_number', 'par', 'player_id', 'round_id', 'score']);
  assert.equal(round.total_score, pars.reduce((a, p) => a + p + 1, 0));
  assert.equal(round.par_total, pars.reduce((a, p) => a + p, 0));
  assert.equal(round.completed, true);
  assert.equal(round.slope_rating, '', 'sin slope ni rating: no entra al handicap');
  assert.equal(round.total_putts, '');
  assert.equal(round.format, 'stroke');
});

test('se puede jugar cualquier cantidad de hoyos: 6, 14, 9 o 18', () => {
  for (const n of [1, 6, 9, 14, 18]) {
    const r = buildPastRound({ ...base, pars, scores: upTo(n) });
    assert.equal(r.error, undefined, `${n} hoyos`);
    assert.equal(r.holes.length, n);
    assert.equal(r.round.course_holes_count, n);
    assert.equal(r.round.holes_played, n);
    assert.equal(r.round.par_total, pars.slice(0, n).reduce((a, p) => a + p, 0), 'el par es el de los hoyos jugados');
  }
});

test('no se pueden dejar hoyos vacíos en el medio', () => {
  const gap = upTo(10).map((s, i) => (i === 4 ? '' : s));
  assert.match(buildPastRound({ ...base, pars, scores: gap }).error, /hoyo 5/);
  assert.match(buildPastRound({ ...base, pars, scores: upTo(0) }).error, /al menos un hoyo/);
});

test('valida cancha, fecha, scores y pares con mensajes claros', () => {
  assert.match(buildPastRound({ ...base, course: ' ', pars, scores }).error, /cancha/);
  assert.match(buildPastRound({ ...base, date: '', pars, scores }).error, /fecha/);
    assert.match(buildPastRound({ ...base, pars, scores: scores.map((s, i) => (i === 2 ? '0' : s)) }).error, /score del hoyo 3/);
  assert.match(buildPastRound({ ...base, pars: pars.map((p, i) => (i === 0 ? 9 : p)), scores }).error, /par del hoyo 1/);
});

test('los totales y estadísticas de la ronda no se rompen sin putts ni GIR', () => {
  const { holes } = buildPastRound({ ...base, pars, scores });
  const totals = roundTotals(holes);
  assert.ok(Number.isFinite(totals.total_putts));
  const stats = displayStats(holes);
  assert.equal(stats.avgPutts, null);
  assert.equal(stats.girPct, null);
});
