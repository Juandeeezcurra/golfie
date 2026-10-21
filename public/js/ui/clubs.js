import { app } from '../context.js';
import { state, CLUBS, TAGS } from '../state.js';
import { jsStr } from '../util.js';
import { roundTotals } from '../core/stats.js';
import { goTo } from './router.js';
import { showToast } from './toast.js';
import { renderDashboard, setDashboardOrigin } from './dashboard.js';

// true mientras se corrigen los palos de una ronda ya terminada.
let editingClubs = false;

// Refleja state.clubFeedback en los botones: sin esto, al abrir la pantalla
// para otra ronda quedaban marcados los semáforos y tags de la anterior.
export function renderClubFeedbackUI() {
  CLUBS.forEach(club => {
    const key = club.replace(/\s/g, '_');
    const fb = state.clubFeedback[club];
    const tags = fb && Array.isArray(fb.tags) ? fb.tags : [];
    document.querySelectorAll(`#club-${key} .sem-btn`).forEach(b =>
      b.classList.toggle('active', !!(fb && fb.rating && b.classList.contains(fb.rating))));
    document.querySelectorAll(`#tags-${key} .tag`).forEach(t =>
      t.classList.toggle('active', tags.includes(t.textContent.trim())));
  });
  const btn = document.getElementById('club-finish-btn');
  if (btn) btn.textContent = editingClubs ? 'GUARDAR PALOS →' : 'FINALIZAR RONDA →';
}

export function editClubs() {
  editingClubs = true;
  goTo('club-feedback');
}

export function clubBack() {
  if (editingClubs) { editingClubs = false; goTo('dashboard'); }
  else goTo('hole-tracker');
}

function saveClubEdits() {
  const round = state.currentRound;
  app.store.saveClubs(round.round_id, state.clubFeedback);
  // Se manda también lo que quedó sin calificar, para que borrar un semáforo
  // llegue al servidor.
  Object.entries(state.clubFeedback).forEach(([club, fb]) => {
    app.sync.postToSheets('addClubFeedback', {
      round_id: round.round_id,
      club,
      rating: fb.rating || '',
      tags: (fb.tags || []).join(','),
    });
  });
  editingClubs = false;
  renderDashboard(round, Object.values(app.store.loadHoles(round.round_id)));
  goTo('dashboard');
  showToast('Palos guardados ✓');
}

export function initClubFeedback() {
  const list = document.getElementById('clubs-list');
  if (!list) return;
  list.innerHTML = CLUBS.map(club => `
    <div class="club-row" id="club-${club.replace(/\s/g, '_')}">
      <div class="club-name-row">
        <div class="club-name">${club}</div>
        <div class="semaforo">
          <div class="sem-btn verde" onclick="setSemaforo('${jsStr(club)}','verde',this)"></div>
          <div class="sem-btn amarillo" onclick="setSemaforo('${jsStr(club)}','amarillo',this)"></div>
          <div class="sem-btn rojo" onclick="setSemaforo('${jsStr(club)}','rojo',this)"></div>
        </div>
      </div>
      <div class="tags-wrap" id="tags-${club.replace(/\s/g, '_')}">
        ${TAGS.map(tag => `<div class="tag" onclick="toggleTag('${jsStr(club)}','${jsStr(tag)}',this)">${tag}</div>`).join('')}
      </div>
    </div>
  `).join('');
}

export function setSemaforo(club, color, el) {
  if (!state.clubFeedback[club]) state.clubFeedback[club] = { rating: null, tags: [] };
  const prev = state.clubFeedback[club].rating;
  state.clubFeedback[club].rating = prev === color ? null : color;
  const row = document.getElementById('club-' + club.replace(/\s/g, '_'));
  row.querySelectorAll('.sem-btn').forEach(b => b.classList.remove('active'));
  if (state.clubFeedback[club].rating) el.classList.add('active');
}

export function toggleTag(club, tag, el) {
  if (!state.clubFeedback[club]) state.clubFeedback[club] = { rating: null, tags: [] };
  const tags = state.clubFeedback[club].tags;
  const idx = tags.indexOf(tag);
  if (idx >= 0) { tags.splice(idx, 1); el.classList.remove('active'); }
  else { tags.push(tag); el.classList.add('active'); }
}

export function finishRound() {
  if (editingClubs) { saveClubEdits(); return; }
  const roundId = state.currentRound.round_id;
  const holesMap = app.store.loadHoles(roundId, 'me');
  const holes = Object.values(holesMap);
  state.currentPlayerId = 'me';
  state.holes = holesMap;
  const totals = roundTotals(holes);

  // Terminar la ronda es una acción explícita: "jugué hasta acá y quiero
  // cerrarla", sea hoyo 9, 14 o 18. Antes se comparaba contra el target
  // original (18 salvo que se hubiera elegido 9 de antemano) y una ronda
  // cortada a mitad de la vuelta quedaba "en curso" para siempre aunque el
  // jugador tocara "Finalizar ronda". Ahora el total de hoyos de la ronda
  // pasa a ser lo que efectivamente se jugó.
  const roundUpdate = {
    ...state.currentRound,
    ...totals,
    course_holes_count: holes.length,
    completed: true,
  };

  state.currentRound = roundUpdate;
  app.store.saveRoundToLS(roundUpdate);
  app.store.saveClubs(roundUpdate.round_id, state.clubFeedback);

  Object.entries(state.clubFeedback).forEach(([club, fb]) => {
    if (fb.rating || fb.tags.length) {
      app.sync.postToSheets('addClubFeedback', {
        round_id: state.currentRound.round_id,
        club,
        rating: fb.rating,
        tags: fb.tags.join(','),
      });
    }
  });

  app.sync.postToSheets('updateRound', roundUpdate);
  renderDashboard(roundUpdate, holes);
  setDashboardOrigin('home');
  goTo('dashboard');
}
