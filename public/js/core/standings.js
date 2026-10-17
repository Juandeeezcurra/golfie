import { points420, matchHole, matchStatus, scrambleTeamHandicap } from './formats.js';
import { netScore, stablefordPoints } from './handicap.js';

// Calcula posiciones con las tarjetas locales, sin depender de red o DOM.
export function roundStandings(format, players, holesByPlayer, courseHoles = 18, throughHole = courseHoles) {
  if (format === 'scramble') {
    const allHandicapsKnown = (players || []).length === 4 && players.every(p => p.playing_handicap != null);
    const teams = new Map();
    (players || []).forEach(p => {
      const id = p.team_id || p.player_id;
      if (!teams.has(id)) teams.set(id, []);
      teams.get(id).push(p);
    });
    const teamsAreValid = teams.size === 2 && [...teams.values()].every(team => team.length === 2);
    return [...teams.entries()].map(([teamId, members]) => {
      const representative = members[0];
      const holes = holesByPlayer[representative.player_id] || {};
      const handicap = allHandicapsKnown && teamsAreValid
        ? scrambleTeamHandicap(members.map(p => p.playing_handicap)) : null;
      let gross = 0, net = 0, played = 0;
      Object.values(holes).filter(h => Number(h.hole_number) <= throughHole).forEach(h => {
        const score = Number(h.score);
        if (!Number.isFinite(score) || score <= 0) return;
        const adjusted = handicap != null && Number.isInteger(Number(h.stroke_index))
          ? netScore(score, handicap, Number(h.stroke_index), courseHoles) : score;
        gross += score; net += adjusted == null ? score : adjusted; played++;
      });
      const names = members.map(p => p.name || (p.player_id === 'me' ? 'Yo' : 'Jugador')).join(' + ');
      return { player_id: representative.player_id, team_id: teamId, member_ids: members.map(p => p.player_id),
        name: `Equipo ${teamId} · ${names}`, holes, playing_handicap: handicap, gross, net, points: 0, played, value: net };
    }).sort((a, b) => a.value - b.value);
  }

  const rows = (players || []).map(p => ({
    player_id: p.player_id,
    name: p.name || (p.player_id === 'me' ? 'Yo' : 'Jugador'),
    holes: holesByPlayer[p.player_id] || {},
    playing_handicap: p.playing_handicap,
    gross: 0, net: 0, points: 0, played: 0,
  }));
  const holeNumbers = [...new Set(rows.flatMap(p => Object.keys(p.holes).map(Number)))]
    .filter(n => n <= throughHole).sort((a, b) => a - b);
  const matchResults = [];

  holeNumbers.forEach(number => {
    const scores = rows.map(p => {
      const h = p.holes[number];
      if (!h || !Number(h.score)) return { player: p, hole: null, net: null };
      const si = Number(h.stroke_index);
      const adjusted = p.playing_handicap != null && Number.isInteger(si)
        ? netScore(h.score, p.playing_handicap, si, courseHoles) : Number(h.score);
      const net = adjusted == null ? Number(h.score) : adjusted;
      return { player: p, hole: h, net };
    }).filter(x => x.hole);

    scores.forEach(({ player, hole, net }) => {
      player.gross += Number(hole.score);
      player.net += net;
      player.played++;
      if (format === 'stableford') player.points += stablefordPoints(net, Number(hole.par)) || 0;
    });

    if (format === 'points420' && scores.length === rows.length) {
      const awarded = points420(scores.map(x => ({ player_id: x.player.player_id, net: x.net })));
      rows.forEach(p => { p.points += awarded.get(p.player_id) || 0; });
    }
    if (format === 'match' && rows.length === 2) {
      const a = scores.find(x => x.player.player_id === rows[0].player_id);
      const b = scores.find(x => x.player.player_id === rows[1].player_id);
      if (a && b) matchResults.push(matchHole(a.net, b.net));
    }
  });

  if (format === 'match' && rows.length === 2) {
    const status = matchStatus(matchResults, courseHoles);
    rows[0].match = status;
    rows[1].match = { ...status, lead: -status.lead };
    rows[0].value = status.lead === 0 ? 'AS' : `${Math.abs(status.lead)} ${status.lead > 0 ? 'UP' : 'DOWN'}`;
    rows[1].value = status.lead === 0 ? 'AS' : `${Math.abs(status.lead)} ${status.lead > 0 ? 'DOWN' : 'UP'}`;
  } else {
    rows.forEach(p => { p.value = format === 'stableford' || format === 'points420' ? p.points : p.net; });
  }
  if (format === 'match') return rows;
  return rows.sort((a, b) => format === 'stroke' ? a.value - b.value : b.value - a.value);
}
