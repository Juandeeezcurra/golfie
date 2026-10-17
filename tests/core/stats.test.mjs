import test from 'node:test';
import assert from 'node:assert/strict';
import { runningScore, formatDiff, holeClass, roundTotals, displayStats } from '../../public/js/core/stats.js';

const hole = (n, par, score, extra = {}) => ({
  hole_number: n, par, score, putts: 2,
  fairway_hit: par > 3 ? true : null, green_in_regulation: false,
  penalties: 0, up_and_down: false, sand_save: false, ...extra,
});

test('acumulado: compara contra el par de los hoyos jugados, no el de la cancha', () => {
  // 3 hoyos par 4 con 5 golpes cada uno: +3 contra par 12, no contra par 72.
  const r = runningScore([hole(1, 4, 5), hole(2, 4, 5), hole(3, 4, 5)]);
  assert.equal(r.played, 3);
  assert.equal(r.score, 15);
  assert.equal(r.par, 12);
  assert.equal(r.diff, 3);
});

test('acumulado: sin hoyos cargados no rompe', () => {
  assert.deepEqual(runningScore([]), { played: 0, score: 0, par: 0, diff: 0 });
  assert.deepEqual(runningScore(undefined), { played: 0, score: 0, par: 0, diff: 0 });
});

test('acumulado: ignora hoyos sin score todavía', () => {
  const r = runningScore([hole(1, 4, 5), { hole_number: 2, par: 4, score: null }]);
  assert.equal(r.played, 1);
  assert.equal(r.score, 5);
});

test('formatDiff usa E para el par', () => {
  assert.equal(formatDiff(0), 'E');
  assert.equal(formatDiff(3), '+3');
  assert.equal(formatDiff(-2), '-2');
});

test('holeClass cubre de eagle a triple', () => {
  assert.equal(holeClass(2, 4), 'eagle');
  assert.equal(holeClass(1, 4), 'eagle');   // hole in one en par 4
  assert.equal(holeClass(3, 4), 'birdie');
  assert.equal(holeClass(4, 4), 'par');
  assert.equal(holeClass(5, 4), 'bogey');
  assert.equal(holeClass(6, 4), 'double');
  assert.equal(holeClass(8, 4), 'triple');
});

test('roundTotals no cuenta los par 3 como oportunidad de fairway', () => {
  const holes = [hole(1, 4, 5), hole(2, 3, 3), hole(3, 5, 6)];
  const t = roundTotals(holes);
  assert.equal(t.total_score, 14);
  assert.equal(t.par_total, 12);
  assert.equal(t.holes_played, 3);
  assert.equal(t.fairways_hit, 2);
  assert.equal(t.fairway_holes, 2, 'el par 3 queda fuera del denominador');
});

test('displayStats trata el fairway vacío del servidor igual que el null local', () => {
  // Un par 3 que volvió del servidor llega con '' en vez de null.
  const holes = [hole(1, 4, 5), { ...hole(2, 3, 3), fairway_hit: '' }];
  const s = displayStats(holes);
  assert.equal(s.fairwayPct, 100, 'una de una, el par 3 no cuenta');
});
