import { app } from '../context.js';
import { state } from '../state.js';
import { runningScore, formatDiff } from '../core/stats.js';
import { findCourse } from '../catalog.js';
import { holeInfo, coursePar, hasStrokeIndex } from '../core/courses.js';
import { strokesReceived, playingHandicap } from '../core/handicap.js';
import { roundStandings } from '../core/standings.js';
import { scrambleTeamHandicap } from '../core/formats.js';
import { attrText } from '../util.js';
import { showToast } from './toast.js';
import { showModal } from './modal.js';
import { goTo } from './router.js';

let currentScore = 4, currentPutts = 2, currentPenalties = 0, currentPar = 4;
let toggles = { fairway: false, gir: false, updown: false, sandsave: false };

function roundHoleCount() {
  return Number(state.currentRound && state.currentRound.course_holes_count) || 18;
}

// Al terminar de corregir un hoyo, quien abrió la edición decide a dónde volver
// (el dashboard se registra acá; evita que tracker importe dashboard).
let onEditDone = () => goTo('dashboard');
export function setEditDoneHandler(fn) { onEditDone = fn; }

// Corregir un hoyo de una ronda ya terminada: abre el tracker en ese hoyo y,
// al guardar, vuelve a la tarjeta con los totales recalculados.
export function startHoleEdit(holeNumber, playerId) {
  state.currentHole = holeNumber;
  state.currentPlayerId = playerId || 'me';
  state.holes = app.store.loadHoles(state.currentRound.round_id, state.currentPlayerId);
  initHoleTracker({ editing: true });
  goTo('hole-tracker');
}

export function initHoleTracker({ editing = false } = {}) {
  state.editing = editing;
  const round = state.currentRound;
  const course = currentCourse();
  const par = coursePar(course, round?.tee_id, roundHoleCount()) || round?.par_total;
  const allowance = ['stableford', 'points420'].includes(round?.format) ? 0.95 : 1;
  const profiles = new Map(app.store.loadPlayers().map(p => [p.player_id, p]));
  if (!state.roundPlayers.length) state.roundPlayers = [{ round_id: round?.round_id, player_id: 'me', name: 'Yo', handicap_index: round?.hcp_index }];
  state.roundPlayers = state.roundPlayers.map(p => {
    const profileHcp = profiles.get(p.player_id)?.handicap_index;
    const hcp = p.handicap_index != null && p.handicap_index !== '' ? p.handicap_index
      : profileHcp != null && profileHcp !== '' ? profileHcp : p.player_id === 'me' ? round?.hcp_index : null;
    const storedPlaying = p.playing_handicap;
    const playing = storedPlaying != null && storedPlaying !== '' ? Number(storedPlaying) : (hcp != null && hcp !== '' && par
      ? playingHandicap(hcp, round.course_rating, round.slope_rating, par, allowance, round.course_holes_count || 18)
      : null);
    return { ...p, name: p.name || profiles.get(p.player_id)?.name || 'Jugador', handicap_index: hcp, playing_handicap: playing };
  });
  if (round?.round_id && !state.editing) app.store.saveRoundPlayers(round.round_id, state.roundPlayers);
  if (!state.currentPlayerId || !state.roundPlayers.some(p => p.player_id === state.currentPlayerId)) state.currentPlayerId = state.roundPlayers[0].player_id;
  state.holes = app.store.loadHoles(state.currentRound.round_id, state.currentPlayerId);
  loadHoleState();
  renderHole();
}

function activePlayer() { return state.roundPlayers.find(p => p.player_id === state.currentPlayerId) || state.roundPlayers[0]; }

function scrambleUnits() {
  const teams = new Map();
  state.roundPlayers.forEach(p => {
    const teamId = p.team_id || p.player_id;
    if (!teams.has(teamId)) teams.set(teamId, []);
    teams.get(teamId).push(p);
  });
  return [...teams.values()];
}

function activeScrambleUnit() {
  return scrambleUnits().find(team => team.some(p => p.player_id === state.currentPlayerId)) || [];
}

function renderLiveStandings() {
  const el = document.getElementById('live-standings');
  if (!el || !state.currentRound) return;
  if (state.roundPlayers.length < 2) { el.innerHTML = ''; return; }
  // El ojito tapa el acumulado propio en el score-strip; sin esto, el mismo
  // número se seguía viendo acá al lado (resultado en vivo entre jugadores),
  // que es el otro lugar donde aparecía el score "tapado".
  const hidden = isScoreHidden();
  const maps = Object.fromEntries(state.roundPlayers.map(p => [p.player_id, app.store.loadHoles(state.currentRound.round_id, p.player_id)]));
  const rows = roundStandings(state.currentRound.format || 'stroke', state.roundPlayers, maps, roundHoleCount(), state.currentHole);
  const hasNet = state.roundPlayers.every(p => p.playing_handicap != null) && hasStrokeIndex(currentCourse());
  const label = state.currentRound.format === 'scramble' ? (hasNet ? 'Neto equipo' : 'Golpes equipo')
    : state.currentRound.format === 'match' ? 'Match'
    : ['stableford', 'points420'].includes(state.currentRound.format) ? 'Puntos'
      : hasNet ? 'Neto' : 'Golpes';
  el.innerHTML = rows.map(p => `<div class="live-standing ${(state.currentRound.format === 'scramble' ? p.member_ids?.includes(state.currentPlayerId) : p.player_id === state.currentPlayerId) ? 'active' : ''}">
    <div class="live-standing-name">${attrText(p.name || 'Jugador')}</div>
    <div class="live-standing-value">${hidden ? '••' : (p.value ?? '—')}</div><div class="live-standing-name">${label}</div></div>`).join('');
}

// Datos de la cancha para el hoyo actual (par, stroke index, largo).
// Null si la ronda no se jugó sobre una cancha del catálogo.
function currentCourse() {
  const round = state.currentRound;
  if (!round || !round.course_id) return null;
  return findCourse(round.course_id);
}

function currentHoleInfo() {
  const round = state.currentRound;
  const course = currentCourse();
  if (!round || !course) return null;
  const info = holeInfo(course, state.currentHole, round.tee_id, roundHoleCount());
  return info ? { ...info, units: course.units === 'yards' ? 'yds' : 'm' } : null;
}

function currentPlayingHandicap() {
  if (state.currentRound?.format === 'scramble') {
    const team = activeScrambleUnit();
    return state.roundPlayers.length === 4 && state.roundPlayers.every(p => p.playing_handicap != null) && team.length === 2
      ? scrambleTeamHandicap(team.map(p => p.playing_handicap)) : null;
  }
  const player = activePlayer();
  if (player?.playing_handicap == null) return null;
  return Number(player.playing_handicap);
}

export function loadHoleState() {
  const saved = state.holes[state.currentHole];
  if (saved) {
    currentPar = saved.par || 4;
    currentScore = saved.score || currentPar;
    currentPutts = saved.putts || 2;
    currentPenalties = saved.penalties || 0;
    toggles.fairway = saved.fairway_hit || false;
    toggles.gir = saved.green_in_regulation || false;
    toggles.updown = saved.up_and_down || false;
    toggles.sandsave = saved.sand_save || false;
  } else {
    // Con cancha del catálogo el par viene cargado: uno menos que tocar por
    // hoyo, y el score arranca en par en vez de en 4 siempre.
    const info = currentHoleInfo();
    currentPar = info && info.par ? info.par : 4;
    currentScore = currentPar;
    currentPutts = 2;
    currentPenalties = 0;
    toggles = { fairway: false, gir: false, updown: false, sandsave: false };
  }
}

// ---------- SCORE ACUMULADO ----------
// Se puede tapar con el ojito: ver cómo venís a mitad de ronda condiciona
// cómo jugás los hoyos que faltan. La preferencia se recuerda entre rondas.
const HIDE_SCORE_KEY = 'hide_score';

const EYE_OPEN = '<svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF = '<svg viewBox="0 0 24 24"><path d="M17.9 17.9A10.1 10.1 0 0112 19c-7 0-11-7-11-7a18.4 18.4 0 015.1-5.9m3.2-1.6A10.1 10.1 0 0112 5c7 0 11 7 11 7a18.5 18.5 0 01-2.2 3.2M1 1l22 22"/></svg>';

export function isScoreHidden() {
  return !!app.store.loadFromLS(HIDE_SCORE_KEY);
}

export function toggleScoreVisibility() {
  app.store.saveToLS(HIDE_SCORE_KEY, !isScoreHidden());
  renderRunningScore();
}

export function renderRunningScore() {
  const strip = document.getElementById('score-strip');
  const valEl = document.getElementById('running-score');
  const diffEl = document.getElementById('running-diff');
  const eyeEl = document.getElementById('eye-btn');
  if (!strip || !valEl || !diffEl || !eyeEl) return;

  const hidden = isScoreHidden();
  eyeEl.innerHTML = hidden ? EYE_OFF : EYE_OPEN;
  strip.classList.toggle('hidden-score', hidden);

  const { played, score, diff } = runningScore(Object.values(state.holes));
  const holesTxt = played + (played === 1 ? ' hoyo' : ' hoyos');

  if (hidden) {
    valEl.textContent = '••';
    diffEl.textContent = played ? holesTxt : '';
    return;
  }

  if (!played) {
    valEl.textContent = '—';
    diffEl.textContent = 'Sin hoyos cargados';
    return;
  }

  valEl.textContent = score;
  diffEl.textContent = formatDiff(diff) + ' · ' + holesTxt;
}

// Ficha del hoyo: par, largo desde el tee jugado y stroke index.
function renderHoleInfo() {
  const el = document.getElementById('hole-info');
  if (!el) return;
  const info = currentHoleInfo();
  if (!info) { el.innerHTML = ''; return; }
  const bits = [
    info.par ? `Par ${info.par}` : null,
    info.length ? `${info.length} ${info.units}` : null,
    info.si ? `<span class="si-tag" title="Stroke index: ranking de dificultad">SI ${info.si}</span>` : null,
  ].filter(Boolean);
  const playingHcp = currentPlayingHandicap();
  if (info.si && playingHcp !== null) {
    const strokes = strokesReceived(playingHcp, info.si, roundHoleCount());
    if (strokes > 0) bits.push(`<span class="hcp-tag">Recibís ${strokes}</span>`);
    if (strokes < 0) bits.push(`<span class="hcp-tag">Devolvés ${Math.abs(strokes)}</span>`);
  }
  el.innerHTML = bits.join(' · ');
}

export function renderHole() {
  document.getElementById('hole-num-display').textContent = state.currentHole;
  document.getElementById('hole-of').textContent = 'de ' + roundHoleCount();
  renderHoleInfo();
  const player = activePlayer();
  const turn = document.getElementById('player-turn');
  if (turn) turn.textContent = state.currentRound?.format === 'scramble'
    ? `Anotando: Equipo ${player?.team_id || ''} · ${activeScrambleUnit().map(p => p.name).join(' + ')}`
    : state.roundPlayers.length > 1 ? `Anotando: ${player?.name || 'Jugador'}` : '';
  renderLiveStandings();
  document.getElementById('progress-fill').style.width = ((state.currentHole - 1) / roundHoleCount() * 100) + '%';
  document.getElementById('score-display').textContent = currentScore;
  document.getElementById('putts-display').textContent = currentPutts;
  document.getElementById('pen-display').textContent = currentPenalties;
  updateScoreLabel();
  updateParChips();
  updateToggles();
  renderRunningScore();

  // Terminar la ronda es decisión del jugador, no de cuántos hoyos lleva
  // cargados: hay veces que se juegan 14 y no 9 o 18. El botón está
  // disponible siempre que haya al menos un hoyo guardado.
  const holesLogged = Object.keys(state.holes).length;
  document.getElementById('finish-round-btn').style.display = holesLogged >= 1 && !state.editing ? 'block' : 'none';
  document.getElementById('delete-round-btn').style.display = state.editing ? 'none' : 'block';
  document.getElementById('save-hole-btn').textContent = state.editing ? 'GUARDAR CAMBIO →' : 'GUARDAR HOYO →';

  // El fairway sólo aplica a par 4/5.
  document.getElementById('toggle-fairway').style.opacity = currentPar === 3 ? 0.3 : 1;
  document.getElementById('toggle-fairway').style.pointerEvents = currentPar === 3 ? 'none' : 'auto';
}

function updateParChips() {
  [3, 4, 5].forEach(p => {
    document.getElementById('par' + p).classList.toggle('active', currentPar === p);
  });
}

function updateScoreLabel() {
  const diff = currentScore - currentPar;
  const labels = { '-3': 'Albatros 🦅', '−2': 'Eagle 🦅', '-2': 'Eagle 🦅', '-1': 'Birdie 🐦', '0': 'Par', '1': 'Bogey', '2': 'Doble Bogey', '3': 'Triple' };
  const key = String(diff);
  document.getElementById('score-label').textContent = labels[key] || (diff > 0 ? '+' + diff : diff < 0 ? diff : 'Par');
}

function updateToggles() {
  ['fairway', 'gir', 'updown', 'sandsave'].forEach(t => {
    document.getElementById('toggle-' + t).classList.toggle('on', toggles[t]);
  });
}

export function setPar(p) { currentPar = p; currentScore = p; updateParChips(); renderHole(); }
export function changeScore(d) { currentScore = Math.max(1, currentScore + d); document.getElementById('score-display').textContent = currentScore; updateScoreLabel(); }
export function changePutts(d) { currentPutts = Math.max(0, currentPutts + d); document.getElementById('putts-display').textContent = currentPutts; }
export function changePenalties(d) { currentPenalties = Math.max(0, currentPenalties + d); document.getElementById('pen-display').textContent = currentPenalties; }
export function toggleStat(t) { toggles[t] = !toggles[t]; updateToggles(); }

export function saveHole() {
  const holeData = {
    round_id: state.currentRound.round_id,
    player_id: state.currentPlayerId || 'me',
    hole_number: state.currentHole,
    par: currentPar,
    score: currentScore,
    putts: currentPutts,
    fairway_hit: currentPar > 3 ? toggles.fairway : null,
    green_in_regulation: toggles.gir,
    penalties: currentPenalties,
    up_and_down: toggles.updown,
    sand_save: toggles.sandsave,
    // Si el hoyo ya estaba guardado se respeta su snapshot de la tarjeta.
    stroke_index: state.holes[state.currentHole]?.stroke_index ?? currentHoleInfo()?.si ?? null,
    hole_length: state.holes[state.currentHole]?.hole_length ?? currentHoleInfo()?.length ?? null,
  };

  const scramble = state.currentRound.format === 'scramble';
  const scoringUnit = scramble ? activeScrambleUnit() : [activePlayer()];
  scoringUnit.forEach(member => {
    const playerHole = { ...holeData, player_id: member.player_id };
    const playerHoles = app.store.loadHoles(state.currentRound.round_id, member.player_id);
    playerHoles[state.currentHole] = playerHole;
    app.store.saveHoles(state.currentRound.round_id, playerHoles, member.player_id);
    app.sync.postToSheets('addHole', playerHole);
  });
  state.holes = app.store.loadHoles(state.currentRound.round_id, state.currentPlayerId || 'me');
  showToast('Hoyo ' + state.currentHole + ' guardado ✓');

  if (state.editing) {
    state.editing = false;
    onEditDone();
    return;
  }

  const nextUnit = scramble
    ? scrambleUnits().find(team => team[0].player_id !== scoringUnit[0]?.player_id && !app.store.loadHoles(state.currentRound.round_id, team[0].player_id)[state.currentHole])
    : null;
  const nextPlayer = scramble ? null : state.roundPlayers.find(p => p.player_id !== state.currentPlayerId
    && !app.store.loadHoles(state.currentRound.round_id, p.player_id)[state.currentHole]);
  if (nextUnit || nextPlayer) {
    state.currentPlayerId = scramble ? nextUnit[0].player_id : nextPlayer.player_id;
    state.holes = app.store.loadHoles(state.currentRound.round_id, state.currentPlayerId);
    loadHoleState();
    renderHole();
  } else if (state.currentHole < roundHoleCount()) {
    state.currentHole++;
    state.currentPlayerId = scramble
      ? scrambleUnits().find(team => !app.store.loadHoles(state.currentRound.round_id, team[0].player_id)[state.currentHole])?.[0].player_id || scrambleUnits()[0][0].player_id
      : state.roundPlayers.find(p => !app.store.loadHoles(state.currentRound.round_id, p.player_id)[state.currentHole])?.player_id || state.roundPlayers[0].player_id;
    state.holes = app.store.loadHoles(state.currentRound.round_id, state.currentPlayerId);
    if (state.currentHole === 10 && !state.holes[10]) {
      showTurnBreak();
      return;
    }
    loadHoleState();
    renderHole();
  } else {
    goTo('club-feedback');
  }
}

function showTurnBreak() {
  const firstNine = Object.values(state.holes).filter(h => Number(h.hole_number) <= 9);
  const score = firstNine.reduce((sum, h) => sum + (Number(h.score) || 0), 0);
  const par = firstNine.reduce((sum, h) => sum + (Number(h.par) || 0), 0);
  const putts = firstNine.reduce((sum, h) => sum + (Number(h.putts) || 0), 0);
  const diff = score - par;
  showModal({
    title: 'Fin de la ida',
    html: `<div class="turn-break-score">${score}<span>${formatDiff(diff)}</span></div>
      <div class="turn-break-sub">9 hoyos · Par ${par} · ${putts} putts</div>
      <div class="turn-break-hint">Tomate un descanso. Cuando estés listo, seguimos con la vuelta.</div>`,
    confirmText: 'SEGUIR AL HOYO 10',
    safe: true,
    onConfirm: () => { loadHoleState(); renderHole(); },
    onCancel: () => { loadHoleState(); renderHole(); },
  });
}

export function prevHole() {
  if (state.currentHole > 1) { state.currentHole--; loadHoleState(); renderHole(); }
}

export function nextHole() {
  if (state.currentHole < roundHoleCount()) { state.currentHole++; loadHoleState(); renderHole(); }
}

export function confirmAbort() {
  if (state.editing) {
    state.editing = false;
    goTo('dashboard');
    return;
  }
  showModal({
    title: 'Salir de la Ronda',
    body: 'Los datos guardados se mantienen. Podés retomar la ronda más tarde.',
    confirmText: 'SALIR',
    safe: true,
    onConfirm: () => goTo('home'),
  });
}
