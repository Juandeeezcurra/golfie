// ============================================================
// GOLFIE — MATEMÁTICA DE HANDICAP
// ============================================================
// Puro: sin DOM, sin localStorage, sin fetch. Lo importa el browser,
// el Worker y los tests de Node por igual.
// ============================================================

// Diferencial de una ronda: cuánto mejor/peor que el campo jugaste,
// normalizado al slope estándar (113).
export function differential(adjustedGross, courseRating, slopeRating) {
  if (!adjustedGross || !courseRating || !slopeRating) return null;
  return (adjustedGross - courseRating) * 113 / slopeRating;
}

function roundTraditional(value, digits = 0) {
  const scale = 10 ** digits;
  const scaled = Math.abs(value) * scale;
  const rounded = Math.floor(scaled + 0.5 + Number.EPSILON);
  return Math.sign(value) * rounded / scale;
}

function finite(value) {
  return value !== '' && value !== null && value !== undefined && Number.isFinite(Number(value));
}

// WHS Course Handicap. For 9 holes, a full Handicap Index is halved and
// rounded to a tenth before applying the 9-hole tee ratings, then the result
// is rounded to a whole number. An 18-hole result stays unrounded until the
// Playing Handicap is calculated.
export function courseHandicap(handicapIndex, courseRating, slopeRating, par, holes = 18) {
  if (![handicapIndex, courseRating, slopeRating, par].every(finite)) return null;
  const count = Number(holes);
  if (count !== 9 && count !== 18) return null;
  const slope = Number(slopeRating), rating = Number(courseRating), teePar = Number(par);
  if (slope <= 0 || teePar <= 0) return null;

  let index = Number(handicapIndex);
  if (count === 9) index = roundTraditional(index / 2, 1);
  const raw = index * (slope / 113) + (rating - teePar);
  return count === 9 ? roundTraditional(raw) : raw;
}

// `allowance` is a ratio: 1 for 100%, 0.95 for 95%, etc.
export function playingHandicap(handicapIndex, courseRating, slopeRating, par, allowance = 1, holes = 18) {
  if (!finite(allowance) || Number(allowance) < 0) return null;
  const course = courseHandicap(handicapIndex, courseRating, slopeRating, par, holes);
  if (course === null) return null;
  return roundTraditional(course * Number(allowance));
}

// Positive strokes are received; negative strokes are given back on the
// hardest holes. SI runs from 1 (hardest) to N and repeats for handicaps
// above N, which also supports plus handicaps symmetrically.
export function strokesReceived(playingHcp, strokeIndex, holes = 18) {
  if (!finite(playingHcp) || !finite(strokeIndex)) return null;
  const count = Number(holes), si = Number(strokeIndex), hcp = Math.trunc(Number(playingHcp));
  if ((count !== 9 && count !== 18) || !Number.isInteger(si) || si < 1 || si > count) return null;
  const magnitude = Math.abs(hcp);
  const strokes = Math.floor(magnitude / count) + (si <= magnitude % count ? 1 : 0);
  return Math.sign(hcp) * strokes;
}

export function netScore(grossScore, playingHcp, strokeIndex, holes = 18) {
  if (!finite(grossScore)) return null;
  const strokes = strokesReceived(playingHcp, strokeIndex, holes);
  return strokes === null ? null : Number(grossScore) - strokes;
}

export function stablefordPoints(net, par) {
  if (!finite(net) || !finite(par) || Number(par) <= 0) return null;
  return Math.max(0, 2 + Number(par) - Number(net));
}

// Cuántos diferenciales se promedian y qué ajuste se aplica, según cuántas
// rondas elegibles haya (tabla WHS).
const WHS_TABLE = [
  [3, 3, 1, -2.0], [4, 4, 1, -1.0], [5, 6, 1, 0], [7, 8, 2, 0], [9, 11, 3, 0],
  [12, 14, 4, 0], [15, 16, 5, 0], [17, 18, 6, 0], [19, 19, 7, 0], [20, 20, 8, 0],
];

// Handicap index a partir de las rondas ya jugadas (las más recientes primero).
// Devuelve string con un decimal, o null si todavía no hay suficientes rondas.
export function calcHandicapIndex(rounds) {
  const eligible = (rounds || [])
    // El differential de 9 hoyos requiere el score esperado WHS y la unión
    // con otra vuelta de 9. Hasta modelar esa unión, excluimos esas vueltas
    // para no inflar el Handicap Index con una vuelta incompleta.
    .filter(r => r.completed && r.format !== 'scramble' && (Number(r.course_holes_count) || 18) === 18 && r.total_score && r.slope_rating && r.course_rating)
    .slice(0, 20);
  if (eligible.length < 3) return null;

  const diffs = eligible
    .map(r => differential(r.total_score, r.course_rating, r.slope_rating))
    .sort((a, b) => a - b);

  const entry = WHS_TABLE.find(([min, max]) => diffs.length >= min && diffs.length <= max);
  if (!entry) return null;

  const [, , numDiffs, adj] = entry;
  const avg = diffs.slice(0, numDiffs).reduce((a, b) => a + b, 0) / numDiffs;
  return Math.max(-10, avg * 0.96 + adj).toFixed(1);
}
