import test from 'node:test';
import assert from 'node:assert/strict';
import {
  completedRounds, scoreTrend, scoringDistribution, byParType,
  byCourse, byCourseNine, handicapIndexNow, provisionalHandicapIndex, scoringForm, shortGame, playAverages,
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

test('por cancha separa rondas de 9 y de 18 hoyos', () => {
  const rounds = [
    round('2026-01-01', 'Boulogne', 44, 35, { course_holes_count: 9 }),
    round('2026-02-01', 'Newman', 90),
    round('2026-03-01', 'Boulogne', 46, 35, { course_holes_count: 9 }),
  ];
  assert.deepEqual(byCourse(rounds, 18).map(c => c.course), ['Newman']);
  const [bou] = byCourse(rounds, 9);
  assert.equal(bou.played, 2);
  assert.equal(bou.avgDiff, 10);
});

test('mejor ida y mejor vuelta se miden por mitad, sólo en rondas de 18', () => {
  const nine = (from, score) => Array.from({ length: 9 }, (_, i) => ({ hole_number: from + i, par: 4, score }));
  const r1 = round('2026-01-01', 'Newman', 90, 72, { round_id: 'a' });
  const r2 = round('2026-02-01', 'Newman', 80, 72, { round_id: 'b' });
  const holes = { a: [...nine(1, 5), ...nine(10, 5)], b: [...nine(1, 4), ...nine(10, 5)] };
  const holesOf = r => holes[r.round_id];
  const [front] = byCourseNine([r1, r2], 'front', holesOf);
  assert.equal(front.best, 36);
  assert.equal(front.bestDiff, 0);
  assert.equal(front.avgDiff, 4.5);
  const [back] = byCourseNine([r1, r2], 'back', holesOf);
  assert.equal(back.best, 45);
  assert.equal(back.played, 2);
  // media vuelta incompleta no cuenta
  assert.deepEqual(byCourseNine([r1], 'back', () => nine(10, 5).slice(0, 8)), []);
});

test('handicap provisorio: una sola ronda ya da una estimación', () => {
  const h = provisionalHandicapIndex([round('2026-01-01', 'X', 90, 72, { slope_rating: 113, course_rating: 72 })]);
  assert.equal(h.value, 18);
  assert.equal(h.provisional, true);
  assert.equal(h.rounds, 1);
  assert.equal(h.approx, false);
});

test('handicap provisorio: cancha de 9 sin rating usa el par y duplica', () => {
  const r = round('2026-01-01', 'Boulogne', 44, 35, { course_holes_count: 9, slope_rating: '', course_rating: '' });
  const h = provisionalHandicapIndex([r]);
  assert.equal(h.value, 18, '(44 - 35) * 2');
  assert.equal(h.approx, true);
});

test('con 3 o más rondas el provisorio es el índice real', () => {
  const rounds = [90, 91, 92].map((s, i) => round('2026-01-0' + (i + 1), 'X', s));
  const h = provisionalHandicapIndex(rounds);
  assert.equal(h.provisional, false);
});

test('3 putts se cuentan en el juego corto', () => {
  const sg = shortGame([hole(4, 5, { putts: 3 }), hole(4, 4, { putts: 2 }), hole(3, 5, { putts: 4 }), hole(4, 4, { putts: '' })]);
  assert.equal(sg.threePutts, 2);
});

test('búnkers: cuenta los marcados y los sand saves de rondas viejas', () => {
  const sg = shortGame([
    hole(4, 4, { bunker: true, sand_save: true }),
    hole(4, 6, { bunker: true, sand_save: false }),
    hole(4, 4, { sand_save: true }),          // ronda vieja: sin campo bunker
    hole(4, 4, { bunker: false }),
  ]);
  assert.equal(sg.bunkers, 3);
  assert.equal(sg.sandSaves, 2);
});

test('rondas pasadas a mano: lo que no se cargó no cuenta como cero', () => {
  const sinDatos = [{ par: 4, score: 5 }, { par: 3, score: 4 }, { par: 5, score: 6, putts: '', green_in_regulation: '' }];
  const avg = playAverages(sinDatos);
  assert.equal(avg.putts, null, 'sin putts cargados no hay promedio');
  assert.equal(avg.girPct, null, 'sin GIR cargado no hay porcentaje');
  const sg = shortGame(sinDatos);
  assert.equal(sg.missedGreens, 0);
  assert.equal(sg.scramblingPct, null);
  assert.equal(sg.threePutts, 0);
});

test('mezclar hoyos con y sin datos usa sólo los que tienen dato', () => {
  const mezcla = [hole(4, 4, { putts: 3, green_in_regulation: true }), { par: 4, score: 5 }];
  const avg = playAverages(mezcla);
  assert.equal(avg.putts, 3);
  assert.equal(avg.girPct, 100);
});

test('por cancha agrupa por largo: de 10 a 18 hoyos y de 1 a 9, sin perder las rondas de 6 o 14', () => {
  const rounds = [
    round('2026-01-01', 'Olivos', 80, 66, { course_holes_count: 14 }),
    round('2026-02-01', 'Olivos', 90),
    round('2026-03-01', 'Olivos', 30, 24, { course_holes_count: 6 }),
    round('2026-04-01', 'Olivos', 44, 35, { course_holes_count: 9 }),
  ];
  assert.equal(byCourse(rounds, 18)[0].played, 2, '14 y 18 hoyos');
  assert.equal(byCourse(rounds, 9)[0].played, 2, '6 y 9 hoyos');
});
