import { app } from '../context.js';
import { state } from '../state.js';
import { formatDate, jsStr, attrText } from '../util.js';
import { holeClass, displayStats } from '../core/stats.js';
import { differential } from '../core/handicap.js';
import { playingHandicap, strokesReceived } from '../core/handicap.js';
import { scorecardSections } from '../core/scorecard.js';
import { findCourse } from '../catalog.js';
import { holeInfo, hasStrokeIndex } from '../core/courses.js';
import { scrambleTeamHandicap } from '../core/formats.js';
import { roundStandings } from '../core/standings.js';
import { goTo } from './router.js';
import { initHoleTracker } from './tracker.js';

export function renderDashboard(round, holes) {
  if (!holes || !holes.length) return;
  const totalPar = holes.reduce((a, h) => a + h.par, 0);
  const diff = round.total_score - totalPar;
  const diffStr = diff > 0 ? '+' + diff : diff === 0 ? 'E' : String(diff);

  const { fairwayPct, girPct, avgPutts } = displayStats(holes);
  const isScramble = round.format === 'scramble';
  const me = state.roundPlayers.find(p => p.player_id === 'me');
  const myTeam = isScramble ? state.roundPlayers.filter(p => p.team_id === me?.team_id) : [];
  const scrambleHcp = state.roundPlayers.length === 4 && state.roundPlayers.every(p => p.playing_handicap != null) && myTeam.length === 2
    ? scrambleTeamHandicap(myTeam.map(p => p.playing_handicap)) : null;
  const scoreTitle = isScramble
    ? `Scramble · Equipo ${me?.team_id || 'A'} · ${myTeam.map(p => p.name).join(' + ')}`
    : 'Score Final';
  const scrambleRows = isScramble
    ? roundStandings('scramble', state.roundPlayers,
      Object.fromEntries(state.roundPlayers.map(p => [p.player_id, app.store.loadHoles(round.round_id, p.player_id)])),
      Number(round.course_holes_count) || 18)
    : [];

  const holesCount = Number(round.course_holes_count) || 18;
  const hcpDiffRaw = !isScramble && round.completed && holes.length === holesCount && holesCount === 18
    ? differential(round.total_score, round.course_rating, round.slope_rating) : null;
  const hcpDiff = hcpDiffRaw === null ? null : hcpDiffRaw.toFixed(1);
  const course = round.course_id ? findCourse(round.course_id) : null;
  const teePar = round.par_total || (course?.tees?.find(t => t.tee_id === round.tee_id)?.par);
  const playingHcp = isScramble ? scrambleHcp
    : holes.length === holesCount && round.hcp_index !== '' && round.hcp_index != null && round.course_rating && round.slope_rating && teePar
    ? playingHandicap(round.hcp_index, round.course_rating, round.slope_rating, teePar, 1, holesCount)
    : null;
  const cardHoles = holes.map(h => {
    if (h.stroke_index != null || h.hole_length != null || !course) return h;
    const info = holeInfo(course, h.hole_number, round.tee_id);
    return info ? { ...h, stroke_index: info.si, hole_length: info.length } : h;
  });
  const card = scorecardSections(cardHoles, playingHcp, holesCount);
  const units = course?.units === 'yards' ? 'yds' : course ? 'm' : '';

  const bestClub = Object.entries(state.clubFeedback).find(([_, f]) => f.rating === 'verde');
  const worstClub = Object.entries(state.clubFeedback).find(([_, f]) => f.rating === 'rojo');

  document.getElementById('dashboard-content').innerHTML = `
    <div class="dash-hero">
      <div style="font-size:13px; color:var(--muted); letter-spacing:2px; text-transform:uppercase;">${attrText(scoreTitle)}</div>
      <div style="display:flex; align-items:baseline; justify-content:center; gap:10px;">
        <div class="dash-score">${round.total_score}</div>
        <div style="font-family:var(--font-display); font-size:36px; color:var(--muted); line-height:1;">${diffStr}</div>
      </div>
      <div class="dash-course">${attrText(round.course_name || '')}</div>
      <div class="dash-date">${formatDate(round.date)} · ${attrText(round.tees || '')}</div>
    </div>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-val green">${avgPutts}</div>
        <div class="stat-lbl">${isScramble ? 'Putts equipo / hoyo' : 'Putts / hoyo'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-val">${girPct}%</div>
        <div class="stat-lbl">${isScramble ? 'GIR equipo' : 'GIR'}</div>
      </div>
      ${fairwayPct !== null ? `<div class="stat-card"><div class="stat-val">${fairwayPct}%</div><div class="stat-lbl">${isScramble ? 'Fairways equipo' : 'Fairways'}</div></div>` : ''}
      ${hcpDiff ? `<div class="stat-card"><div class="stat-val">${hcpDiff}</div><div class="stat-lbl">HCP Diferencial</div></div>` : ''}
    </div>

    ${isScramble ? `<div class="section-title">Resultado por equipos</div>
      <div class="live-standings">${scrambleRows.map(team => `<div class="live-standing">
        <div class="live-standing-name">${attrText(team.name)}</div>
        <div class="live-standing-value">${team.value}</div>
        <div class="live-standing-name">${scrambleHcp != null && state.roundPlayers.every(p => p.playing_handicap != null) && hasStrokeIndex(course) ? 'Neto equipo' : 'Golpes equipo'} · ${team.played} hoyos</div>
      </div>`).join('')}</div>` : ''}

    <div class="section-title">Tarjeta</div>
    <div class="scorecard-wrap">
      <table class="scorecard-table">
        <thead><tr><th>Hoyo</th><th>Par</th><th>SI</th>${units ? '<th>Largo</th>' : ''}<th>Golpes</th>${card.hasNet ? '<th>Neto</th>' : ''}<th>Putts</th></tr></thead>
        <tbody>
          ${card.holes.map(h => {
            const si = Number(h.stroke_index || h.si);
            const strokes = card.hasNet && Number.isInteger(si) ? strokesReceived(playingHcp, si, holesCount) : null;
            const net = strokes === null ? null : Number(h.score) - strokes;
            return `<tr><td>${h.hole_number}</td><td>${h.par}</td><td>${Number.isInteger(si) ? si : '—'}</td>${units ? `<td>${h.hole_length ?? ''}</td>` : ''}<td class="scorecell ${holeClass(h.score, h.par)}">${h.score}</td>${card.hasNet ? `<td>${net ?? '—'}</td>` : ''}<td>${h.putts ?? '—'}</td></tr>`;
          }).join('')}
          <tr class="scorecard-total"><td>Ida</td><td>${card.front.par || '—'}</td><td>·</td>${units ? '<td>·</td>' : ''}<td>${card.front.holes.length ? card.front.score : '—'}</td>${card.hasNet ? `<td>${card.front.holes.length ? card.front.net : '—'}</td>` : ''}<td>${card.front.holes.length ? card.front.putts : '—'}</td></tr>
          ${holesCount > 9 ? `<tr class="scorecard-total"><td>Vuelta</td><td>${card.back.par || '—'}</td><td>·</td>${units ? '<td>·</td>' : ''}<td>${card.back.holes.length ? card.back.score : '—'}</td>${card.hasNet ? `<td>${card.back.holes.length ? card.back.net : '—'}</td>` : ''}<td>${card.back.holes.length ? card.back.putts : '—'}</td></tr>` : ''}
          <tr class="scorecard-total scorecard-grand"><td>Total</td><td>${card.total.par}</td><td>·</td>${units ? '<td>·</td>' : ''}<td>${card.total.score}</td>${card.hasNet ? `<td>${card.total.net}</td>` : ''}<td>${card.total.putts}</td></tr>
        </tbody>
      </table>
    </div>
    <div class="section-title">Resultado por hoyo</div>
    <div class="holes-grid">
      ${holes.slice().sort((a, b) => a.hole_number - b.hole_number).map(h =>
        `<div class="hole-card ${holeClass(h.score, h.par)}">
          <div class="hc-num">Hoyo ${h.hole_number}</div>
          <div class="hc-score-wrap"><div class="hc-score">${h.score}</div></div>
          <div class="hc-par">Par ${h.par}</div>
        </div>`
      ).join('')}
    </div>

    ${Object.keys(state.clubFeedback).length ? `
      <div class="section-title" style="margin-top:24px;">Palos</div>
      <div class="club-feedback-summary">
        ${Object.entries(state.clubFeedback).filter(([_, f]) => f.rating || f.tags.length).map(([club, fb]) => `
          <div class="club-feedback-row">
              <div class="cf-name">${attrText(club)}</div>
            <div class="cf-right">
              <div class="cf-dot" style="background:${fb.rating === 'verde' ? 'var(--green)' : fb.rating === 'amarillo' ? 'var(--yellow)' : fb.rating === 'rojo' ? 'var(--red)' : 'var(--border)'}"></div>
              <div class="cf-tags-small">${fb.tags.slice(0, 2).map(attrText).join(' · ')}</div>
            </div>
          </div>
        `).join('')}
      </div>
    ` : ''}

    ${bestClub || worstClub ? `
      <div class="section-title" style="margin-top:24px;">Highlights</div>
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
        ${bestClub ? `<div class="stat-card"><div style="font-size:11px;color:var(--green);letter-spacing:1px;margin-bottom:4px;">MEJOR PALO</div><div style="font-size:16px;font-weight:500;">${attrText(bestClub[0])}</div></div>` : ''}
        ${worstClub ? `<div class="stat-card"><div style="font-size:11px;color:var(--red);letter-spacing:1px;margin-bottom:4px;">A TRABAJAR</div><div style="font-size:16px;font-weight:500;">${attrText(worstClub[0])}</div></div>` : ''}
      </div>
    ` : ''}

    <button class="cta-btn" style="margin-top:32px;" onclick="goTo('new-round')">+ Nueva Ronda</button>
    <button class="secondary-btn" style="margin-top:10px;" onclick="exportRoundCSV('${jsStr(round.round_id)}')">Descargar tarjeta CSV</button>
    <button class="secondary-btn" style="margin-top:10px;" onclick="switchTab('history')">Ver historial</button>
  `;
}

export function viewRound(round_id) {
  const round = app.store.loadRounds().find(r => r.round_id === round_id);
  if (!round) return;
  const savedHoles = app.store.loadHoles(round_id);
  state.currentRound = round;
  state.clubFeedback = app.store.loadClubs(round_id);
  state.roundPlayers = app.store.loadRoundPlayers(round_id);
  if (!state.roundPlayers.length) state.roundPlayers = [{ round_id, player_id: 'me', name: 'Yo', handicap_index: round.hcp_index }];

  if (!round.completed) {
    const holeCount = Number(round.course_holes_count) || 18;
    let next = null;
    for (let n = 1; n <= holeCount && !next; n++) {
      const p = state.roundPlayers.find(player => !app.store.loadHoles(round_id, player.player_id)[n]);
      if (p) next = { hole: n, player_id: p.player_id };
    }
    state.currentHole = next?.hole || holeCount;
    state.currentPlayerId = next?.player_id || state.roundPlayers[0].player_id;
    state.holes = app.store.loadHoles(round_id, state.currentPlayerId);
    initHoleTracker();
    goTo('hole-tracker');
    return;
  }

  renderDashboard(round, Object.values(savedHoles));
  goTo('dashboard');
}

export function exportRoundCSV(round_id) {
  const round = app.store.loadRounds().find(r => r.round_id === round_id);
  if (!round) return;
  const holes = Object.values(app.store.loadHoles(round_id)).sort((a, b) => a.hole_number - b.hole_number);
  const course = round.course_id ? findCourse(round.course_id) : null;
  const count = Number(round.course_holes_count) || 18;
  const players = app.store.loadRoundPlayers(round_id);
  const me = players.find(p => p.player_id === 'me');
  const team = round.format === 'scramble' ? players.filter(p => p.team_id === me?.team_id) : [];
  const hcp = round.format === 'scramble'
    ? players.length === 4 && players.every(p => p.playing_handicap != null) && team.length === 2 ? scrambleTeamHandicap(team.map(p => p.playing_handicap)) : null
    : holes.length === count && round.hcp_index !== '' && round.hcp_index != null && round.course_rating && round.slope_rating && round.par_total
      ? playingHandicap(round.hcp_index, round.course_rating, round.slope_rating, round.par_total, 1, count)
      : null;
  const teamName = `Equipo ${me?.team_id || 'A'} (${team.map(p => p.name).join(' + ')})`;
  const rows = [
    [ ...(round.format === 'scramble' ? ['Equipo'] : []), 'Fecha', 'Cancha', 'Tees', 'Hoyo', 'Par', 'SI', 'Distancia', 'Golpes', 'Neto', 'Putts', 'Penales'],
    ...holes.map(h => {
      const info = course && (h.stroke_index == null || h.hole_length == null) ? holeInfo(course, h.hole_number, round.tee_id) : null;
      const si = h.stroke_index ?? info?.si;
      const length = h.hole_length ?? info?.length;
      const strokes = hcp !== null && si != null ? strokesReceived(hcp, si, count) : null;
      const net = strokes === null ? '' : Number(h.score) - strokes;
      return [ ...(round.format === 'scramble' ? [teamName] : []), round.date, round.course_name, round.tees, h.hole_number, h.par, si ?? '', length ?? '', h.score, net, h.putts ?? '', h.penalties ?? ''];
    }),
  ];
  const csv = '\uFEFF' + rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `golfie-${String(round.date || '').slice(0, 10)}-${(round.course_name || 'ronda').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
