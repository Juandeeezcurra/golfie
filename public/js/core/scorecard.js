// Construcción de tarjetas para la vuelta y el resumen de ronda.
import { netScore, strokesReceived } from './handicap.js';

export function scorecardSections(holes, playingHcp = null, courseHoles = 18) {
  const handicapHoles = Number(courseHoles) === 9 ? 9 : 18;
  const ordered = (holes || []).filter(h => h && Number(h.hole_number) > 0)
    .slice().sort((a, b) => Number(a.hole_number) - Number(b.hole_number));
  const out = ordered.filter(h => Number(h.hole_number) <= 9);
  const back = ordered.filter(h => Number(h.hole_number) >= 10);
  const sum = list => list.reduce((acc, h) => {
    const par = Number(h.par) || 0, score = Number(h.score) || 0;
    const si = Number(h.stroke_index || h.si);
    const strokes = playingHcp !== null && Number.isInteger(si)
      ? strokesReceived(playingHcp, si, handicapHoles) : null;
    acc.par += par;
    acc.score += score;
    acc.putts += Number(h.putts) || 0;
    if (strokes !== null) acc.net += netScore(score, playingHcp, si, handicapHoles);
    return acc;
  }, { par: 0, score: 0, putts: 0, net: 0 });
  return {
    holes: ordered,
    front: { holes: out, ...sum(out) },
    back: { holes: back, ...sum(back) },
    total: { holes: ordered, ...sum(ordered) },
    hasBack: back.length > 0,
    hasNet: playingHcp !== null && ordered.some(h => Number.isInteger(Number(h.stroke_index || h.si))),
  };
}
