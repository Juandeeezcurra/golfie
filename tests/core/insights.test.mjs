import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completedRounds, scoreTrend, scoringDistribution, byParType,
  byCourse, handicapIndexNow, scoringForm, shortGame, playAverages,
} from '../../public/js/core/insights.js';

const round = (date, course, score, par = 72, extra = {}) => ({
  round_id: 'r-' + date, date, course_name: course,
  total_score: score, par_total: par, completed: true,
  slope_rating: 113, course_rating: 72, ...extra,
});

const hole = (par, score, extra = {}) => ({
  par, score, putts: 2, fairway_hit: par > 3 ? true : null,
  green_in_regulation: false, penalties: 0, up_and_down: false, sand_save: false, ...extra,
});

test('sólo cuentan las rondas terminadas y con score', () => {
  const rounds = [
    round('2026-01-01', 'A', 90),
    { ...round('2026-01-02', 'B', 88), completed: false },
    { ...round('2026-01-03', 'C', null) },
  ];
  assert.equal(completedRounds(rounds).length, 1);
});

test('la tendencia va de la más vieja a la más nueva', () => {
  // La app guarda las rondas de la más nueva a la más vieja.
  const rounds = [round('2026-03-01', 'C', 95), round('2026-02-01', 'B', 90), round('2026-01-01', 'A', 92)];
  const t = scoreTrend(rounds);
  assert.deepEqual(t.map(p => p.course), ['A', 'B', 'C']);
  assert.equal(t[0].diff, 20);
});

test('distribución de resultados', () => {
  const d = scoringDistribution([hole(4, 3), hole(4, 4), hole(4, 5), hole(4, 6), hole(3, 1)]);
  assert.equal(d.birdie, 1);
  assert.equal(d.par, 1);
  assert.equal(d.bogey, 1);
  assert.equal(d.double, 1);
  assert.equal(d.eagle, 1);
  assert.equal(d.total, 5);
});

test('por tipo de hoyo separa par 3, 4 y 5', () => {
  const rows = byParType([hole(3, 4), hole(3, 4), hole(4, 5), hole(5, 6)]);
  const par3 = rows.find(r => r.par === 3);
  assert.equal(par3.holes, 2);
  assert.equal(par3.avg, 4);
  assert.equal(par3.vsPar, 1);
});

test('por cancha: cuenta rondas, mejor score y promedio', () => {
  const rounds = [
    round('2026-01-01', 'Newman', 90),
    round('2026-02-01', 'Newman', 96),
    round('2026-03-01', 'Bulogne', 99, 70),
  ];
  const [newman, bulogne] = byCourse(rounds);
  assert.equal(newman.course, 'Newman');
  assert.equal(newman.played, 2);
  assert.equal(newman.best, 90, 'el mejor es el de menor diferencia contra el par');
  assert.equal(newman.avgDiff, 21);
  assert.equal(bulogne.bestDiff, 29);
});

test('el handicap no inventa una comparación entre muestras distintas', () => {
  // Con 8 rondas el índice promedia 2 diferenciales sin ajuste; con 3
  // promedia 1 y resta 2.0. Compararlos daría una "mejora" que es puro
  // artefacto de la fórmula, así que handicapIndexNow no devuelve delta.
  const rounds = Array.from({ length: 8 }, (_, i) => round('2026-0' + (i + 1) + '-01', 'X', 90 + i));
  const h = handicapIndexNow(rounds);
  assert.equal(h.rounds, 8);
  assert.ok(h.current > 0);
  assert.ok(!('delta' in h), 'no debe exponer un delta engañoso');
});

test('la forma compara promedios, que sí son comparables', () => {
  const recientes = Array.from({ length: 5 }, (_, i) => round('2026-1' + i + '-01', 'X', 85));  // +13
  const viejas = Array.from({ length: 3 }, (_, i) => round('2026-0' + i + '-01', 'X', 95));     // +23
  const f = scoringForm([...recientes, ...viejas]);
  assert.equal(f.recentN, 5);
  assert.equal(f.previousN, 3);
  assert.equal(f.recent, 13);
  assert.equal(f.previous, 23);
  assert.equal(f.delta, -10, 'negativo = está jugando mejor');
});

test('sin rondas previas no hay comparación de forma', () => {
  const f = scoringForm([round('2026-01-01', 'X', 90)]);
  assert.equal(f.delta, null);
  assert.equal(f.previous, null);
});

test('scrambling se mide sobre los greens errados, no sobre todos los hoyos', () => {
  const holes = [
    hole(4, 4, { green_in_regulation: true }),                      // green pegado: no aplica
    hole(4, 4, { green_in_regulation: false, up_and_down: true }),  // errado y salvado
    hole(4, 5, { green_in_regulation: false }),                     // errado y no salvado
  ];
  const sg = shortGame(holes);
  assert.equal(sg.missedGreens, 2);
  assert.equal(sg.upDowns, 1);
  assert.equal(sg.scramblingPct, 50, 'una salvada en dos greens errados');
});

test('promedios de juego: los par 3 no entran en el denominador de fairways', () => {
  const avg = playAverages([hole(4, 5), hole(3, 3), hole(4, 4, { fairway_hit: false })]);
  assert.equal(avg.holes, 3);
  assert.equal(avg.fairwayPct, 50, 'uno de dos intentos, el par 3 no cuenta');
  assert.equal(avg.putts, 2);
});

test('sin hoyos, los promedios no explotan', () => {
  assert.equal(playAverages([]), null);
  assert.equal(scoringDistribution([]).total, 0);
  assert.deepEqual(byParType([]), []);
});
