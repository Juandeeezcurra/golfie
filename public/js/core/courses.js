// ============================================================
// GOLFIE — CANCHAS
// ============================================================
// Puro: la forma de una cancha y cómo consultarla. Sin DOM ni fetch.
//
// Formato de una cancha (ver public/data/courses.json):
// {
//   course_id, name, club, city,
//   units: 'meters' | 'yards',
//   source, verified_at, confidence: 'high' | 'medium' | 'low',
//   tees: [{ tee_id, label, color, length, par, rating, slope }],
//   holes: [{ hole, par, si, lengths: { <tee_id>: number } }]
// }
//
// `si` es el stroke index: el ranking de dificultad 1-18 que define en qué
// hoyos se reciben golpes de handicap. Es el dato más delicado del archivo:
// si está mal, los partidos con handicap se reparten mal.
// ============================================================

export const TEE_COLORS = {
  negros: '#2a2a2a',
  azules: '#3b82f6',
  blancos: '#e5e5e5',
  amarillos: '#fbbf24',
  rojos: '#f87171',
  verdes: '#4ade80',
};

export function teeColorOf(tee) {
  if (!tee) return '#737373';
  if (tee.color) return tee.color;
  return TEE_COLORS[String(tee.tee_id || '').toLowerCase()] || '#737373';
}

export function teeById(course, teeId) {
  if (!course || !course.tees) return null;
  return course.tees.find(t => t.tee_id === teeId) || null;
}

export function defaultTee(course) {
  if (!course || !course.tees || !course.tees.length) return null;
  // Blancos es el tee más jugado en los clubes argentinos; si no está, el
  // primero que tenga el archivo.
  return teeById(course, 'blancos') || course.tees[0];
}

export function holeInfo(course, holeNumber, teeId) {
  if (!course || !course.holes) return null;
  const hole = course.holes.find(h => Number(h.hole) === Number(holeNumber));
  if (!hole) return null;
  const lengths = hole.lengths || {};
  const length = teeId && lengths[teeId] != null ? lengths[teeId] : null;
  return { hole: hole.hole, par: hole.par, si: hole.si == null ? null : hole.si, length };
}

export function coursePar(course, teeId) {
  const tee = teeId ? teeById(course, teeId) : null;
  if (tee && tee.par) return tee.par;
  if (!course || !course.holes) return null;
  const pars = course.holes.map(h => Number(h.par)).filter(Boolean);
  return pars.length ? pars.reduce((a, b) => a + b, 0) : null;
}

// ¿Tiene stroke index completo? Sin esto no se pueden repartir los golpes.
export function hasStrokeIndex(course) {
  if (!course || !course.holes || !course.holes.length) return false;
  const sis = course.holes.map(h => h.si).filter(v => v != null);
  if (sis.length !== course.holes.length) return false;
  return new Set(sis).size === sis.length;
}

// ---------- VALIDACIÓN ----------
// La usan los tests sobre los archivos reales: datos sacados de internet
// vienen con errores, y un stroke index repetido o un par 7 tienen que
// explotar en el commit, no en la cancha.
export function validateCourse(course) {
  const problems = [];
  const id = (course && course.course_id) || '(sin course_id)';
  const push = msg => problems.push(`${id}: ${msg}`);

  if (!course || typeof course !== 'object') return ['cancha no es un objeto'];
  for (const field of ['course_id', 'name', 'units']) {
    if (!course[field]) push(`falta "${field}"`);
  }
  if (course.units && !['meters', 'yards'].includes(course.units)) {
    push(`units debe ser meters o yards, no "${course.units}"`);
  }
  if (!['high', 'medium', 'low'].includes(course.confidence)) {
    push('confidence debe ser high, medium o low');
  }

  const tees = course.tees || [];
  if (!tees.length) push('no tiene tees');
  const teeIds = new Set();
  tees.forEach(t => {
    if (!t.tee_id) push('un tee no tiene tee_id');
    if (teeIds.has(t.tee_id)) push(`tee repetido: ${t.tee_id}`);
    teeIds.add(t.tee_id);
    if (t.slope != null && (t.slope < 55 || t.slope > 155)) push(`slope fuera de rango en ${t.tee_id}: ${t.slope}`);
    if (t.rating != null && (t.rating < 55 || t.rating > 85)) push(`course rating fuera de rango en ${t.tee_id}: ${t.rating}`);
  });

  const holes = course.holes || [];
  const expected = course.holes_count || 18;
  if (holes.length !== expected) push(`tiene ${holes.length} hoyos, se esperaban ${expected}`);

  const numbers = holes.map(h => Number(h.hole));
  for (let i = 1; i <= expected; i++) {
    if (!numbers.includes(i)) push(`falta el hoyo ${i}`);
  }

  holes.forEach(h => {
    if (![3, 4, 5, 6].includes(Number(h.par))) push(`par inválido en el hoyo ${h.hole}: ${h.par}`);
    Object.keys(h.lengths || {}).forEach(teeId => {
      if (!teeIds.has(teeId)) push(`el hoyo ${h.hole} tiene largo para un tee inexistente: ${teeId}`);
    });
  });

  // El stroke index es opcional (puede no haberse encontrado), pero si está,
  // tiene que ser una permutación completa de 1..N sin repetidos.
  const sis = holes.map(h => h.si).filter(v => v != null);
  if (sis.length) {
    if (sis.length !== holes.length) {
      push(`stroke index incompleto: ${sis.length} de ${holes.length} hoyos`);
    }
    const dupes = sis.filter((v, i) => sis.indexOf(v) !== i);
    if (dupes.length) push(`stroke index repetido: ${[...new Set(dupes)].join(', ')}`);
    const outOfRange = sis.filter(v => v < 1 || v > holes.length);
    if (outOfRange.length) push(`stroke index fuera de rango: ${outOfRange.join(', ')}`);
  }

  return problems;
}
