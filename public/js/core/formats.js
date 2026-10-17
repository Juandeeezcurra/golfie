// Reglas puras para formatos de juego. Reciben resultados netos por hoyo.
import { stablefordPoints } from './handicap.js';

export function stablefordRound(holes) {
  return (holes || []).reduce((sum, h) => sum + (h && h.net != null ? stablefordPoints(h.net, h.par) || 0 : 0), 0);
}

// Puntos 4/2/0 por puesto. Los puntos de los puestos empatados se promedian:
// empate en 1.º => 3 cada uno; en 2.º => 1 cada uno; empate triple => 2.
export function points420(players) {
  const sorted = (players || []).filter(p => Number.isFinite(Number(p.net)))
    .slice().sort((a, b) => Number(a.net) - Number(b.net));
  const award = [4, 2, 0];
  const result = new Map();
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && Number(sorted[end].net) === Number(sorted[start].net)) end++;
    const points = award.slice(start, Math.min(end, award.length))
      .reduce((sum, value) => sum + value, 0) / (end - start);
    sorted.slice(start, end).forEach(p => result.set(p.player_id, points));
    start = end;
  }
  return result;
}

export function matchHole(playerANet, playerBNet) {
  if (!Number.isFinite(Number(playerANet)) || !Number.isFinite(Number(playerBNet))) return null;
  return Math.sign(Number(playerBNet) - Number(playerANet)); // +1 gana A, -1 gana B, 0 empate
}

export function matchStatus(holeResults, totalHoles = 18) {
  let lead = 0, played = 0;
  (holeResults || []).forEach(result => {
    if (result === -1 || result === 1) { lead += result; played++; }
    else if (result === 0) played++;
  });
  const remaining = Math.max(0, totalHoles - played);
  return { lead, played, remaining, closed: Math.abs(lead) > remaining };
}

// Handicap de equipo Scramble de dos jugadores según allowance WHS 35%/15%.
export function scrambleTeamHandicap(handicaps) {
  const valid = (handicaps || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (valid.length !== 2) return null;
  const raw = valid[0] * 0.35 + valid[1] * 0.15;
  return Math.sign(raw) * Math.floor(Math.abs(raw) + 0.5);
}
