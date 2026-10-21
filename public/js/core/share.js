// ============================================================
// GOLFIE — MODELO DE LA IMAGEN PARA COMPARTIR
// ============================================================
// Puro: arma los datos que lleva la imagen (filas por jugador o equipo,
// tarjeta, stats, posiciones). El dibujo en canvas vive en ui/share.js.
// ============================================================

import { roundStandings } from './standings.js';
import { playAverages, scoringDistribution, shortGame } from './insights.js';

export const FORMAT_LABELS = {
  stroke: 'Medal play',
  stableford: 'Stableford',
  points420: '4-2-0',
  match: 'Match play',
  scramble: 'Scramble',
};

const sum = (list, pick) => list.reduce((a, x) => a + (Number(pick(x)) || 0), 0);

function rowFromHoles({ key, name, short, holes }) {
  const list = Object.values(holes || {})
    .filter(h => h && Number(h.hole_number) > 0 && Number(h.score) > 0)
    .sort((a, b) => Number(a.hole_number) - Number(b.hole_number));
  const half = (from, to) => {
    const part = list.filter(h => Number(h.hole_number) >= from && Number(h.hole_number) <= to);
    return { played: part.length, score: sum(part, h => h.score), par: sum(part, h => h.par) };
  };
  const total = { played: list.length, score: sum(list, h => h.score), par: sum(list, h => h.par) };
  const avg = playAverages(list);
  return {
    key,
    name,
    short: short || name,
    scores: Object.fromEntries(list.map(h => [Number(h.hole_number), Number(h.score)])),
    pars: Object.fromEntries(list.map(h => [Number(h.hole_number), Number(h.par)])),
    front: half(1, 9),
    back: half(10, 18),
    total,
    diff: total.score - total.par,
    stats: {
      putts: avg && avg.putts !== null ? avg.putts : null,
      girPct: avg ? avg.girPct : null,
      fairwayPct: avg ? avg.fairwayPct : null,
      threePutts: shortGame(list).threePutts,
      dist: scoringDistribution(list),
    },
  };
}

// Qué se puede elegir para compartir: todo el grupo o cada jugador / equipo.
export function shareOptions({ round, players, names = {} }) {
  const list = players && players.length ? players : [{ player_id: 'me', name: 'Yo' }];
  const label = p => (p.player_id === 'me' ? names.me || p.name || 'Yo' : p.name || 'Jugador');
  if (round.format === 'scramble') {
    const teams = new Map();
    list.forEach(p => {
      const id = p.team_id || p.player_id;
      if (!teams.has(id)) teams.set(id, []);
      teams.get(id).push(label(p));
    });
    const out = teams.size > 1 ? [{ key: 'all', label: 'Los dos equipos' }] : [];
    teams.forEach((members, id) => out.push({ key: 'team:' + id, label: `Equipo ${id} · ${members.join(' + ')}` }));
    return out;
  }
  const out = list.length > 1 ? [{ key: 'all', label: 'Todos los jugadores' }] : [];
  list.forEach(p => out.push({ key: p.player_id, label: label(p) }));
  return out;
}

// selection: 'all' | player_id | 'team:<id>'
export function buildShareModel({ round, players, holesByPlayer, selection = 'all', names = {}, hasNet = false }) {
  const list = players && players.length ? players : [{ player_id: 'me', name: 'Yo' }];
  const format = round.format || 'stroke';
  const holesCount = Number(round.course_holes_count) || 18;
  const nameOf = p => (p.player_id === 'me' ? names.me || p.name || 'Yo' : p.name || 'Jugador');

  let rows;
  let standings = null;
  const named = list.map(p => ({ ...p, name: nameOf(p) }));

  if (format === 'scramble') {
    const teams = roundStandings('scramble', named, holesByPlayer, holesCount);
    rows = teams.map(t => rowFromHoles({ key: 'team:' + t.team_id, name: t.name, short: `Equipo ${t.team_id}`, holes: t.holes }));
    if (selection !== 'all') rows = rows.filter(r => r.key === selection);
    if (selection === 'all' && teams.length > 1) {
      standings = {
        label: hasNet ? 'Neto equipo' : 'Golpes equipo',
        rows: teams.map(t => ({ name: t.name, value: t.value, played: t.played })),
      };
    }
  } else {
    rows = named.map(p => rowFromHoles({ key: p.player_id, name: p.name, holes: holesByPlayer[p.player_id] }));
    if (selection !== 'all') rows = rows.filter(r => r.key === selection);
    if (selection === 'all' && named.length > 1) {
      const ranked = roundStandings(format, named, holesByPlayer, holesCount);
      standings = {
        label: format === 'match' ? 'Match' : ['stableford', 'points420'].includes(format) ? 'Puntos' : hasNet ? 'Neto' : 'Golpes',
        rows: ranked.map(p => ({ name: p.name, value: p.value ?? '—', played: p.played })),
      };
    }
  }

  // El par por hoyo sale de cualquier fila que lo tenga.
  const pars = {};
  rows.forEach(r => Object.entries(r.pars).forEach(([n, par]) => { if (!pars[n]) pars[n] = par; }));

  return {
    courseName: round.course_name || '',
    date: round.date,
    tees: round.tees || '',
    format,
    formatLabel: FORMAT_LABELS[format] || '',
    holesCount,
    pars,
    rows,
    standings,
    mode: rows.length === 1 ? 'single' : 'group',
  };
}
