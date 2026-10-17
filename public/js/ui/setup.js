import { app } from '../context.js';
import { state } from '../state.js';
import { uuid, jsStr, attrText } from '../util.js';
import { loadCatalog, searchCourses, findCourse } from '../catalog.js';
import { teeById, defaultTee, teeColorOf, coursePar, hasStrokeIndex } from '../core/courses.js';
import { showToast } from './toast.js';
import { goTo } from './router.js';
import { initHoleTracker } from './tracker.js';
import { showModal } from './modal.js';
import { playingHandicap } from '../core/handicap.js';

// Tees por defecto para una cancha que no está en el catálogo: se mantiene
// el comportamiento viejo de elegir un color a mano.
const FALLBACK_TEES = [
  { tee_id: 'negros', label: 'Negros', color: '#2a2a2a' },
  { tee_id: 'azules', label: 'Azules', color: '#3b82f6' },
  { tee_id: 'blancos', label: 'Blancos', color: '#e5e5e5' },
  { tee_id: 'amarillos', label: 'Amarillos', color: '#fbbf24' },
];

// Cancha del catálogo elegida para la próxima ronda (null = texto libre).
let selected = null;
let selectedPlayerIds = new Set(['me']);
let scrambleTeams = new Map();

export function selectedCourse() {
  return selected;
}

export function loadCoursesIntoState() {
  state.courses = app.store.listCourses();
  loadCatalog().then(() => renderTees());
  renderTees();
}

export function prefillHcp() {
  const rounds = app.store.loadRounds().filter(r => r.hcp_index !== '' && r.hcp_index != null);
  const hcpEl = document.getElementById('hcp-input');
  if (rounds.length && hcpEl && !hcpEl.value) hcpEl.value = rounds[0].hcp_index;
  renderRoundPlayers();
}

export function renderRoundPlayers() {
  const el = document.getElementById('round-players-list');
  if (!el) return;
  const meHcp = document.getElementById('hcp-input')?.value ?? '';
  const people = [{ player_id: 'me', name: 'Yo', handicap_index: meHcp === '' ? null : Number(meHcp) }, ...app.store.loadPlayers()];
  const format = document.getElementById('format-input')?.value || 'stroke';
  const selectedIds = [...new Set(['me', ...selectedPlayerIds])];
  selectedIds.forEach((id, i) => { if (!scrambleTeams.has(id)) scrambleTeams.set(id, i < 2 ? 'A' : 'B'); });
  const hint = document.getElementById('players-hint');
  if (hint) hint.textContent = format === 'scramble'
    ? 'Scramble requiere 4 jugadores. Cada equipo tiene 2; tocá el equipo para reasignarlo. Sin handicap cargado, se compara gross.'
    : 'El handicap de cada jugador se usa para calcular el neto por hoyo.';
  el.innerHTML = people.map(p => {
    const active = selectedPlayerIds.has(p.player_id);
    const hcp = p.handicap_index == null || p.handicap_index === '' ? 'HCP —' : `HCP ${Number(p.handicap_index).toFixed(1)}`;
    const team = scrambleTeams.get(p.player_id) || 'B';
    return `<div class="round-player-row"><button type="button" class="round-player-option ${active ? 'active' : ''}" aria-pressed="${active}"
      onclick="toggleRoundPlayer('${jsStr(p.player_id)}')"><span>${attrText(p.name)}</span><span class="round-player-hcp">${attrText(hcp)}</span></button>
      ${format === 'scramble' && active ? `<button type="button" class="scramble-team-btn team-${team.toLowerCase()}" onclick="toggleScrambleTeam('${jsStr(p.player_id)}')">Equipo ${team}</button>` : ''}</div>`;
  }).join('');
}

export function toggleRoundPlayer(playerId) {
  if (playerId === 'me') return;
  if (selectedPlayerIds.has(playerId)) selectedPlayerIds.delete(playerId);
  else {
    if (document.getElementById('format-input')?.value === 'scramble' && new Set(['me', ...selectedPlayerIds]).size >= 4) {
      showToast('Scramble admite 4 jugadores en dos parejas'); return;
    }
    selectedPlayerIds.add(playerId);
  }
  const ids = [...new Set(['me', ...selectedPlayerIds])];
  ids.forEach((id, i) => { if (!scrambleTeams.has(id)) scrambleTeams.set(id, i < 2 ? 'A' : 'B'); });
  renderRoundPlayers();
}

export function toggleScrambleTeam(playerId) {
  scrambleTeams.set(playerId, scrambleTeams.get(playerId) === 'A' ? 'B' : 'A');
  renderRoundPlayers();
}

export function addFriend() {
  if (document.getElementById('format-input')?.value === 'scramble' && new Set(['me', ...selectedPlayerIds]).size >= 4) {
    showToast('Scramble admite 4 jugadores en dos parejas'); return;
  }
  showModal({
    title: 'Agregar amigo',
    html: `<label class="label" for="friend-name">Nombre</label><input class="input" id="friend-name" maxlength="48" autocomplete="off" placeholder="Nombre">
      <label class="label" for="friend-hcp" style="margin-top:12px;">Handicap Index</label><input class="input" id="friend-hcp" type="number" min="-10" max="54" step="0.1" placeholder="Opcional">`,
    confirmText: 'GUARDAR JUGADOR',
    safe: true,
    onConfirm: () => {
      const name = document.getElementById('friend-name')?.value.trim();
      const rawHcp = document.getElementById('friend-hcp')?.value.trim();
      const hcp = rawHcp === '' ? null : Number(rawHcp);
      if (!name || (hcp !== null && (!Number.isFinite(hcp) || hcp < -10 || hcp > 54))) {
        showToast('Revisá el nombre y el handicap');
        return;
      }
      const player = { player_id: uuid().replace(/^r-/, 'p-'), name, handicap_index: hcp };
      app.store.savePlayerToLS(player);
      selectedPlayerIds.add(player.player_id);
      app.sync.postToSheets('savePlayer', player);
      renderRoundPlayers();
      showToast('Jugador guardado');
    },
  });
}

// ---------- BUSCADOR DE CANCHAS ----------

export function filterCourses(val) {
  const list = document.getElementById('autocomplete-list');
  if (!list) return;

  const query = String(val || '').trim();
  const fromCatalog = searchCourses(query).slice(0, 12);

  // Canchas escritas a mano en rondas pasadas que no estén en el catálogo.
  const catalogNames = new Set(fromCatalog.map(c => c.name.toLowerCase()));
  const fromHistory = (state.courses || [])
    .filter(c => c.name && !catalogNames.has(c.name.toLowerCase()))
    .filter(c => !query || c.name.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 4);

  if (!fromCatalog.length && !fromHistory.length) { list.style.display = 'none'; return; }

  const catalogRows = fromCatalog.map(c => {
    const par = coursePar(c);
    const sub = [c.city, par ? 'Par ' + par : null, hasStrokeIndex(c) ? null : 'sin stroke index']
      .filter(Boolean).join(' · ');
    return `<div class="autocomplete-item" onclick="pickCatalogCourse('${jsStr(c.course_id)}')">
      <div class="ac-main">${attrText(c.name)}${hasStrokeIndex(c) ? '<span class="ac-badge">✓</span>' : ''}</div>
      <div class="autocomplete-sub">${attrText(sub)}</div>
    </div>`;
  }).join('');

  const historyRows = fromHistory.map(c =>
    `<div class="autocomplete-item" onclick="pickFreeCourse('${jsStr(c.name)}','${jsStr(c.tees || '')}','${jsStr(c.slope || '')}','${jsStr(c.rating || '')}')">
      <div class="ac-main">${attrText(c.name)}</div>
      <div class="autocomplete-sub">De tus rondas · Slope ${attrText(c.slope || '—')} · Rating ${attrText(c.rating || '—')}</div>
    </div>`).join('');

  list.style.display = 'block';
  list.innerHTML = catalogRows + historyRows;
}

// Elegir una cancha del catálogo: trae tees, par, slope y rating reales.
export function pickCatalogCourse(courseId) {
  const course = findCourse(courseId);
  if (!course) return;
  selected = course;

  document.getElementById('course-input').value = course.name;
  document.getElementById('course-id-input').value = course.course_id;
  document.getElementById('autocomplete-list').style.display = 'none';

  const tee = defaultTee(course);
  renderTees();
  document.getElementById('slope-input').value = '';
  document.getElementById('rating-input').value = '';
  if (tee) selectTeeById(tee.tee_id);
  renderCourseMeta();
}

// Cancha escrita a mano (o de una ronda vieja): comportamiento de siempre.
export function pickFreeCourse(name, tees, slope, rating) {
  selected = null;
  document.getElementById('course-input').value = name;
  document.getElementById('course-id-input').value = '';
  document.getElementById('tee-id-input').value = '';
  document.getElementById('tees-input').value = '';
  document.getElementById('slope-input').value = slope;
  document.getElementById('rating-input').value = rating;
  document.getElementById('autocomplete-list').style.display = 'none';
  renderTees();
  if (tees) {
    const match = document.querySelector(`.tee-btn[data-tee="${CSS.escape(tees)}"]`);
    if (match) selectTee(match);
    else document.getElementById('tees-input').value = tees;
  }
  renderCourseMeta();
}

// ---------- TEES ----------

export function renderTees() {
  const wrap = document.getElementById('tees-selector');
  if (!wrap) return;
  const tees = selected && selected.tees && selected.tees.length ? selected.tees : FALLBACK_TEES;
  const units = selected ? (selected.units === 'yards' ? 'yds' : 'm') : '';

  wrap.classList.toggle('tees-detailed', !!selected);
  wrap.innerHTML = tees.map(t => `
    <button type="button" class="tee-btn" data-tee="${attrText(t.label)}" data-tee-id="${attrText(t.tee_id)}"
            onclick="selectTee(this)" style="--tb:${teeColorOf(t)};">
      <div class="tee-ball" style="background:${teeColorOf(t)};border:2px solid rgba(255,255,255,.35);"></div>
      <span>${attrText(t.label)}</span>
      ${t.length ? `<small>${t.length} ${units}</small>` : ''}
    </button>`).join('');
}

export function selectTee(btn) {
  document.querySelectorAll('.tee-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('tees-input').value = btn.dataset.tee;
  document.getElementById('tee-id-input').value = btn.dataset.teeId || '';

  // Con cancha del catálogo, el slope y el rating salen del tee elegido.
  if (selected) {
    const tee = teeById(selected, btn.dataset.teeId);
    if (tee) {
      document.getElementById('slope-input').value = tee.slope || '';
      document.getElementById('rating-input').value = tee.rating || '';
    }
  }
  renderCourseMeta();
}

function selectTeeById(teeId) {
  const btn = document.querySelector(`.tee-btn[data-tee-id="${CSS.escape(teeId)}"]`);
  if (btn) selectTee(btn);
}

function renderCourseMeta() {
  const el = document.getElementById('course-meta');
  if (!el) return;
  if (!selected) { el.innerHTML = ''; return; }

  const teeId = document.getElementById('tee-id-input').value;
  const tee = teeById(selected, teeId);
  const par = coursePar(selected, teeId);
  const units = selected.units === 'yards' ? 'yds' : 'm';
  const bits = [
    par ? `Par ${par}` : null,
    tee && tee.length ? `${tee.length} ${units}` : null,
    `${selected.holes.length} hoyos`,
  ].filter(Boolean);

  const notices = [];
  if (!hasStrokeIndex(selected)) {
    notices.push('Esta cancha no tiene stroke index cargado: se van a poder anotar los hoyos igual, pero no repartir golpes de handicap.');
  }
  if (selected.confidence && selected.confidence !== 'high') {
    notices.push(`Datos de referencia con confianza ${selected.confidence}: conviene contrastarlos con una tarjeta del club.`);
  }
  if (selected.notes) notices.push(selected.notes);
  const warn = notices.map(note => `<div class="course-warn">${attrText(note)}</div>`).join('');

  el.innerHTML = `<div class="course-meta-row">${bits.join(' · ')}</div>${warn}`;
}

// ---------- INIT ----------

export function initSetup() {
  document.addEventListener('click', e => {
    if (!e.target.closest('.autocomplete-wrap')) {
      const list = document.getElementById('autocomplete-list');
      if (list) list.style.display = 'none';
    }
  });

  // Escribir a mano desarma la selección del catálogo.
  const input = document.getElementById('course-input');
  if (input) {
    input.addEventListener('input', () => {
      if (selected && input.value !== selected.name) {
        selected = null;
        document.getElementById('course-id-input').value = '';
        document.getElementById('tee-id-input').value = '';
        document.getElementById('tees-input').value = '';
        document.getElementById('slope-input').value = '';
        document.getElementById('rating-input').value = '';
        renderTees();
        renderCourseMeta();
      }
    });
  }
  document.getElementById('hcp-input')?.addEventListener('input', renderRoundPlayers);
}

// ---------- EMPEZAR RONDA ----------

export function startRound() {
  const course = document.getElementById('course-input').value.trim();
  if (!course) { showToast('Elegí o escribí una cancha'); return; }

  const courseId = document.getElementById('course-id-input').value || '';
  const teeId = document.getElementById('tee-id-input').value || '';
  const hcpValue = document.getElementById('hcp-input').value.trim();
  const format = document.getElementById('format-input').value || 'stroke';
  const chosen = new Set(['me', ...selectedPlayerIds]);
  const participantIds = [...chosen];
  if (format === 'match' && participantIds.length !== 2) { showToast('Match play requiere 2 jugadores'); return; }
  if (format === 'points420' && participantIds.length !== 3) { showToast('4-2-0 requiere 3 jugadores'); return; }
  if (format === 'scramble' && (participantIds.length !== 4 || ['A', 'B'].some(team => participantIds.filter(id => scrambleTeams.get(id) === team).length !== 2))) {
    showToast('Scramble requiere 4 jugadores, 2 por equipo'); return;
  }

  const roundData = {
    round_id: uuid(),
    user_id: app.store.getUserId(),
    date: new Date().toISOString(),
    course_name: course,
    tees: document.getElementById('tees-input').value,
    course_id: courseId,
    tee_id: teeId,
    course_holes_count: selected && courseId ? selected.holes.length : 18,
    format,
    slope_rating: parseFloat(document.getElementById('slope-input').value) || (courseId ? '' : 113),
    course_rating: parseFloat(document.getElementById('rating-input').value) || (courseId ? '' : 72),
    hcp_index: hcpValue === '' ? null : parseFloat(hcpValue),
    weather: document.getElementById('weather-input').value,
    total_score: null,
    par_total: null,
  };

  app.store.saveCourse({ name: course, tees: roundData.tees, slope: roundData.slope_rating, rating: roundData.course_rating });

  state.currentRound = roundData;
  state.currentHole = 1;
  state.currentPlayerId = 'me';
  state.holes = {};
  state.clubFeedback = {};
  const profiles = new Map(app.store.loadPlayers().map(p => [p.player_id, p]));
  const allowance = format === 'stableford' || format === 'points420' ? 0.95 : 1;
  const participantRows = participantIds.map(playerId => {
    const hcp = playerId === 'me' ? (hcpValue === '' ? null : Number(hcpValue)) : profiles.get(playerId)?.handicap_index;
    const playing = hcp == null || hcp === '' ? null : playingHandicap(hcp, roundData.course_rating, roundData.slope_rating,
      coursePar(selected, teeId) || roundData.par_total, allowance, roundData.course_holes_count);
    const profile = profiles.get(playerId);
    return { round_id: roundData.round_id, player_id: playerId, name: playerId === 'me' ? 'Yo' : profile?.name || 'Jugador', handicap_index: hcp ?? null, team_id: format === 'scramble' ? scrambleTeams.get(playerId) : '', playing_handicap: playing };
  });
  state.roundPlayers = participantRows;
  app.store.saveRoundPlayers(roundData.round_id, participantRows);

  app.store.saveRoundToLS(roundData);
  app.sync.postToSheets('addRound', roundData);
  participantRows.forEach(player => app.sync.postToSheets('addRoundPlayer', player));

  initHoleTracker();
  goTo('hole-tracker');
}
