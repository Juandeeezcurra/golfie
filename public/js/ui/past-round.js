// ============================================================
// GOLFIE — CARGAR UNA RONDA PASADA
// ============================================================
// Pantalla simple para pasar una tarjeta vieja: cancha, fecha, par y golpes
// de cada hoyo. Nada más.
// ============================================================

import { app } from '../context.js';
import { uuid, attrText } from '../util.js';
import { formatDiff } from '../core/stats.js';
import { buildPastRound } from '../core/past-round.js';
import { holeInfo } from '../core/courses.js';
import { allCourses, searchCourses } from '../catalog.js';
import { showToast } from './toast.js';
import { switchTab } from './router.js';

let pars = [];
let scores = [];

const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function resetState() {
  pars = Array(18).fill(4);
  scores = Array(18).fill('');
}

function rowHtml(n) {
  return `${n === 1 ? '<div class="pr-half">Ida</div>' : ''}${n === 10 ? '<div class="pr-half">Vuelta</div>' : ''}
    <div class="pr-row">
      <div class="pr-hole">${n}</div>
      <button type="button" class="pr-par" id="pr-par-${n}" onclick="cyclePastPar(${n})" aria-label="Par del hoyo ${n}">${pars[n - 1]}</button>
      <input class="input pr-score" id="pr-s-${n}" inputmode="numeric" pattern="[0-9]*" maxlength="2" enterkeyhint="${n === 18 ? 'done' : 'next'}"
             autocomplete="off" placeholder="–" value="${attrText(scores[n - 1])}" oninput="pastScoreInput(${n}, this)">
    </div>`;
}

function renderGrid() {
  const grid = document.getElementById('pr-grid');
  if (!grid) return;
  grid.innerHTML = Array.from({ length: 18 }, (_, i) => rowHtml(i + 1)).join('');
  renderTotal();
}

function renderTotal() {
  const el = document.getElementById('pr-total');
  if (!el) return;
  const idx = scores.map((s, i) => (Number(s) ? i : -1)).filter(i => i >= 0);
  if (!idx.length) { el.textContent = 'Cargá los hoyos que jugaste'; return; }
  const total = idx.reduce((a, i) => a + Number(scores[i]), 0);
  const par = idx.reduce((a, i) => a + pars[i], 0);
  el.innerHTML = `<b>${total}</b> <span>${formatDiff(total - par)}</span> · ${idx.length} ${idx.length === 1 ? 'hoyo' : 'hoyos'}`;
}

export function initPastRound() {
  resetState();
  document.getElementById('pr-course').value = '';
  document.getElementById('pr-date').value = todayISO();
  document.getElementById('pr-date').max = todayISO();
  const names = new Set([...app.store.listCourses().map(c => c.name), ...allCourses().map(c => c.name)].filter(Boolean));
  document.getElementById('pr-courses').innerHTML = [...names].map(n => `<option value="${attrText(n)}"></option>`).join('');
  renderGrid();
}

// Si el nombre coincide con una cancha del catálogo, los pares vienen cargados.
export function pastCourseChanged(value) {
  const q = String(value || '').trim().toLowerCase();
  if (q.length < 3) return;
  const course = searchCourses(q).find(c => [c.name, ...(c.aliases || [])].some(n => String(n).toLowerCase() === q));
  if (!course) return;
  const next = pars.slice();
  let changed = false;
  for (let n = 1; n <= 18; n++) {
    const info = holeInfo(course, n, '', 18);
    if (info && info.par && next[n - 1] !== info.par) { next[n - 1] = info.par; changed = true; }
  }
  if (changed) { pars = next; renderGrid(); }
}

export function cyclePastPar(n) {
  pars[n - 1] = pars[n - 1] >= 5 ? 3 : pars[n - 1] + 1;
  const btn = document.getElementById('pr-par-' + n);
  if (btn) btn.textContent = pars[n - 1];
  renderTotal();
}

export function pastScoreInput(n, el) {
  el.value = el.value.replace(/\D/g, '').slice(0, 2);
  scores[n - 1] = el.value;
  renderTotal();
  // Un dígito de 2 a 9 ya es un score completo: se pasa solo al hoyo siguiente.
  // Con "1" se espera, porque puede ser el comienzo de un 10, 11, 12…
  const done = el.value.length === 2 || (el.value.length === 1 && Number(el.value) >= 2);
  if (done && n < 18) {
    const next = document.getElementById('pr-s-' + (n + 1));
    if (next) next.focus();
  }
}

export function savePastRound() {
  const result = buildPastRound({
    roundId: uuid(),
    userId: app.store.getUserId(),
    course: document.getElementById('pr-course').value,
    date: document.getElementById('pr-date').value,
    pars,
    scores,
  });
  if (result.error) { showToast(result.error, 3000); return; }
  const { round, holes } = result;

  app.store.saveCourse({ name: round.course_name, tees: '', slope: '', rating: '' });
  app.store.saveRoundToLS(round);
  app.store.saveHoles(round.round_id, Object.fromEntries(holes.map(h => [h.hole_number, h])), 'me');
  app.store.saveRoundPlayers(round.round_id, [{ round_id: round.round_id, player_id: 'me', name: 'Yo', handicap_index: null, team_id: '', playing_handicap: null }]);

  // En orden y sin esperar a cada una: quedan en la cola y suben en cuanto hay señal.
  app.sync.postToSheets('addRound', round);
  holes.forEach(h => app.sync.postToSheets('addHole', h));
  app.sync.postToSheets('updateRound', round);

  showToast('Ronda guardada ✓');
  switchTab('history');
}
