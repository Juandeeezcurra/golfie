// ============================================================
// GOLFIE — AGREGACIÓN DE ESTADÍSTICAS
// ============================================================
// Puro: recibe hoyos, devuelve números. Sin DOM ni storage.
// ============================================================

// Clase visual de un hoyo según score vs par (maneja los glifos de la scorecard).
export function holeClass(score, par) {
  const d = score - par;
  if (d <= -2) return 'eagle';
  if (d === -1) return 'birdie';
  if (d === 0) return 'par';
  if (d === 1) return 'bogey';
  if (d === 2) return 'double';
  return 'triple';
}

// Un hoyo cuenta como oportunidad de fairway sólo si se registró true/false.
// Ojo: en los hoyos guardados localmente un par 3 es `null`, pero los que
// vuelven del servidor llegan como '' (celda vacía). Por eso se chequea contra
// los dos valores válidos en vez de "distinto de null".
export function isFairwayOpportunity(hole) {
  return hole.fairway_hit === true || hole.fairway_hit === false;
}

// Totales que se persisten al terminar la ronda.
export function roundTotals(holes) {
  const list = holes || [];
  return {
    total_score: list.reduce((a, h) => a + h.score, 0),
    par_total: list.reduce((a, h) => a + h.par, 0),
    total_putts: list.reduce((a, h) => a + h.putts, 0),
    fairways_hit: list.filter(h => h.fairway_hit === true).length,
    // Histórico: al guardar se usa `!== null` porque los hoyos recién jugados
    // guardan null en los par 3. No se unifica con isFairwayOpportunity() para
    // no cambiar los totales ya guardados de rondas viejas.
    fairway_holes: list.filter(h => h.fairway_hit !== null).length,
    greens_in_regulation: list.filter(h => h.green_in_regulation).length,
    holes_played: list.length,
  };
}

// Acumulado de la ronda en curso: sólo cuenta los hoyos ya cargados, así que
// el "vs par" es contra el par de ESOS hoyos, no contra el par de la cancha.
export function runningScore(holes) {
  const played = (holes || []).filter(h => h && Number(h.score) > 0);
  const score = played.reduce((a, h) => a + Number(h.score), 0);
  const par = played.reduce((a, h) => a + (Number(h.par) || 0), 0);
  return { played: played.length, score, par, diff: score - par };
}

// Formatea una diferencia contra el par: +3 / E / -2.
export function formatDiff(diff) {
  return diff > 0 ? '+' + diff : diff === 0 ? 'E' : String(diff);
}

// Porcentajes para mostrar (no se persisten).
export function displayStats(holes) {
  const list = holes || [];
  if (!list.length) return null;
  const fairwayHoles = list.filter(isFairwayOpportunity);
  return {
    fairwayPct: fairwayHoles.length
      ? Math.round(fairwayHoles.filter(h => h.fairway_hit).length / fairwayHoles.length * 100)
      : null,
    girPct: Math.round(list.filter(h => h.green_in_regulation).length / list.length * 100),
    avgPutts: (list.reduce((a, h) => a + h.putts, 0) / list.length).toFixed(1),
  };
}
