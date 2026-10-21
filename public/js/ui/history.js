import { app } from '../context.js';
import { state } from '../state.js';
import { roundCardHTML, renderHome } from './home.js';
import { showModal } from './modal.js';
import { switchTab } from './router.js';

export function renderHistory() {
  const rounds = app.store.loadRounds();
  const container = document.getElementById('all-rounds');
  const sub = document.getElementById('history-sub');
  if (!rounds.length) {
    sub.textContent = '';
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⛳</div>Todavía no jugaste ninguna ronda.</div>`;
    return;
  }
  sub.textContent = rounds.length + (rounds.length === 1 ? ' ronda' : ' rondas');
  container.innerHTML = rounds.map(r => roundCardHTML(r)).join('');
}

export function deleteCurrentRound() {
  if (state.currentRound) deleteRound(state.currentRound.round_id);
}

export function deleteRound(round_id) {
  showModal({
    title: 'Borrar Ronda',
    body: '¿Querés borrar esta ronda? No se puede deshacer.',
    confirmText: 'BORRAR',
    onConfirm: () => {
      const rounds = app.store.loadRounds().filter(r => r.round_id !== round_id);
      app.store.saveRounds(rounds);
      app.store.removeRoundData(round_id);
      // Sin esto el borrado era sólo local y el próximo sync la traía de vuelta.
      app.sync.postToSheets('deleteRound', { round_id });
      renderHome();
      // Se borra desde la tarjeta de la ronda; al terminar se vuelve al historial.
      switchTab('history');
    },
  });
}
