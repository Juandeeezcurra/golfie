// ============================================================
// GOLFIE — ANÁLISIS DE JUEGO
// ============================================================
// Puro: recibe rondas y hoyos, devuelve números. Sin DOM ni storage, así que
// se puede testear de verdad.
//
// Varias de estas métricas usan datos que la app venía guardando desde
// siempre y nunca mostraba (penales, up & down, sand saves).
// ============================================================

import { holeClass } from './stats.js';
import { calcHandicapIndex } from './handicap.js';

// Una ronda cuenta para estadísticas si está terminada y tiene score y par.
export function completedRounds(rounds) {
  return (rounds || []).filter(r => r.completed && r.format !== 'scramble' && r.total_score && r.par_total);
}

// Últimas rondas en orden cronológico (la más vieja primero), para graficar.
export function scoreTrend(rounds, limit = 10) {
  return completedRounds(rounds)
    .slice(0, limit)
    .map(r => ({
      date: r.date,
      course: r.course_name || '—',
      score: r.total_score,
      diff: r.total_score - r.par_total,
    }))
    .reverse();
}

// Cuántos birdies, pares, bogeys… sobre todos los hoyos jugados.
export function scoringDistribution(holes) {
  const out = { eagle: 0, birdie: 0, par: 0, bogey: 0, double: 0, triple: 0, total: 0 };
  (holes || []).forEach(h => {
    const score = Number(h && h.score), par = Number(h && h.par);
    if (!score || !par) return;
    out[holeClass(score, par)]++;
    out.total++;
  });
  return out;
}

// Rendimiento separado por par 3 / par 4 / par 5: dónde perdés los golpes.
export function byParType(holes) {
  const acc = {};
  (holes || []).forEach(h => {
    const par = Number(h && h.par), score = Number(h && h.score);
    if (!par || !score) return;
    const slot = acc[par] = acc[par] || { par, holes: 0, strokes: 0 };
    slot.holes++;
    slot.strokes += score;
  });
  return Object.values(acc)
    .sort((a, b) => a.par - b.par)
    .map(x => ({ par: x.par, holes: x.holes, avg: x.strokes / x.holes, vsPar: x.strokes / x.holes - x.par }));
}

// Resumen por cancha: cuántas veces jugaste, tu mejor score y el promedio.
export function byCourse(rounds) {
  const acc = {};
  completedRounds(rounds).forEach(r => {
    const name = r.course_name || '—';
    const diff = r.total_score - r.par_total;
    const c = acc[name] = acc[name] || { course: name, played: 0, best: null, bestDiff: Infinity, sumDiff: 0 };
    c.played++;
    c.sumDiff += diff;
    if (diff < c.bestDiff) { c.bestDiff = diff; c.best = r.total_score; }
  });
  return Object.values(acc)
    .map(c => ({ course: c.course, played: c.played, best: c.best, bestDiff: c.bestDiff, avgDiff: c.sumDiff / c.played }))
    .sort((a, b) => b.played - a.played || a.avgDiff - b.avgDiff);
}

// Handicap index actual. A propósito NO devuelve una comparación contra el
// índice de hace N rondas: la fórmula WHS promedia distinta cantidad de
// diferenciales y aplica distinto ajuste según cuántas rondas haya, así que
// comparar un índice de 8 rondas con uno de 3 da una diferencia que es puro
// artefacto del cálculo, no juego. Para la forma está scoringForm().
export function handicapIndexNow(rounds) {
  const done = completedRounds(rounds);
  const current = calcHandicapIndex(done);
  return { current: current === null ? null : Number(current), rounds: done.length };
}

// Forma reciente: promedio contra el par de las últimas `window` rondas vs
// las anteriores. Es un promedio, así que se puede comparar aunque las
// muestras tengan distinto tamaño.
export function scoringForm(rounds, window = 5) {
  const done = completedRounds(rounds);
  const avg = list => list.reduce((a, r) => a + (r.total_score - r.par_total), 0) / list.length;
  const recent = done.slice(0, window);
  const previous = done.slice(window);
  if (!recent.length || !previous.length) {
    return { recent: recent.length ? avg(recent) : null, previous: null, delta: null, recentN: recent.length, previousN: 0 };
  }
  const r = avg(recent), p = avg(previous);
  return { recent: r, previous: p, delta: r - p, recentN: recent.length, previousN: previous.length };
}

// Juego corto y errores: datos que se venían guardando sin mostrarse nunca.
//
// El scrambling se mide sobre los greens ERRADOS, no sobre todos los hoyos:
// si pegaste el green en regulación no hubo nada que salvar. Con el
// denominador equivocado el número queda artificialmente bajo.
export function shortGame(holes) {
  const list = (holes || []).filter(Boolean);
  const missedGreens = list.filter(h => h.green_in_regulation !== true).length;
  const upDowns = list.filter(h => h.up_and_down === true).length;
  return {
    penalties: list.reduce((a, h) => a + (Number(h.penalties) || 0), 0),
    upDowns,
    sandSaves: list.filter(h => h.sand_save === true).length,
    holes: list.length,
    missedGreens,
    scramblingPct: missedGreens ? Math.round(upDowns / missedGreens * 100) : null,
  };
}

// Promedios de la bolsa: putts por hoyo, fairways y GIR sobre TODOS los hoyos
// jugados (no el promedio de los promedios por ronda, que pondera mal una
// ronda de 9 hoyos igual que una de 18).
export function playAverages(holes) {
  const list = (holes || []).filter(h => h && Number(h.score));
  if (!list.length) return null;
  const withPutts = list.filter(h => Number.isFinite(Number(h.putts)));
  const fairwayTries = list.filter(h => h.fairway_hit === true || h.fairway_hit === false);
  return {
    holes: list.length,
    putts: withPutts.length ? withPutts.reduce((a, h) => a + Number(h.putts), 0) / withPutts.length : null,
    fairwayPct: fairwayTries.length
      ? Math.round(fairwayTries.filter(h => h.fairway_hit === true).length / fairwayTries.length * 100)
      : null,
    girPct: Math.round(list.filter(h => h.green_in_regulation === true).length / list.length * 100),
  };
}
