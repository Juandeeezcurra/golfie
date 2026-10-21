// ============================================================
// GOLFIE — RONDA PASADA CARGADA A MANO
// ============================================================
// Puro: arma la ronda y sus hoyos a partir de lo que se tipea (cancha, fecha,
// par y golpes por hoyo). No se piden putts, greens ni slope: esos datos no
// se inventan. Los hoyos quedan sólo con par y golpes, y las estadísticas que
// necesitan lo demás (putts, GIR) los ignoran en vez de contarlos como cero.
// Sin slope ni rating la ronda no entra al cálculo del handicap index.
// ============================================================

const MAX_SCORE = 20;

// Devuelve { round, holes } o { error } con el motivo en castellano.
// Los hoyos jugados son los que tienen score, desde el 1 en adelante y sin
// saltos: se puede haber jugado 6, 14 o 18. Los de después se dejan vacíos.
export function buildPastRound({ roundId, userId, course, date, pars, scores }) {
  const name = String(course || '').trim();
  if (!name) return { error: 'Escribí el nombre de la cancha' };
  const when = new Date(String(date || '') + 'T12:00:00');
  if (!date || Number.isNaN(when.getTime())) return { error: 'Elegí la fecha' };

  const filled = n => String(scores[n - 1] ?? '').trim() !== '';
  let count = 0;
  while (count < 18 && filled(count + 1)) count++;
  if (!count) return { error: 'Cargá los golpes de al menos un hoyo' };
  for (let n = count + 2; n <= 18; n++) {
    if (filled(n)) return { error: `Falta el score del hoyo ${count + 1}` };
  }

  const holes = [];
  for (let n = 1; n <= count; n++) {
    const score = Number(scores[n - 1]);
    if (!Number.isInteger(score) || score < 1 || score > MAX_SCORE) return { error: `Revisá el score del hoyo ${n}` };
    const par = Number(pars[n - 1]);
    if (![3, 4, 5, 6].includes(par)) return { error: `Revisá el par del hoyo ${n}` };
    holes.push({ round_id: roundId, player_id: 'me', hole_number: n, par, score });
  }

  const round = {
    round_id: roundId,
    user_id: userId,
    date: when.toISOString(),
    course_name: name,
    tees: '',
    course_id: '',
    tee_id: '',
    course_holes_count: count,
    format: 'stroke',
    slope_rating: '',
    course_rating: '',
    hcp_index: null,
    weather: '',
    total_score: holes.reduce((a, h) => a + h.score, 0),
    par_total: holes.reduce((a, h) => a + h.par, 0),
    total_putts: '',
    fairways_hit: '',
    greens_in_regulation: '',
    holes_played: count,
    completed: true,
  };
  return { round, holes };
}
