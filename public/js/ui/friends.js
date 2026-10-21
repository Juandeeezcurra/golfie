// Pantalla de amigos: lista, ficha individual (historial + estadísticas +
// handicap sugerido) y acceso a la tarjeta de cualquier ronda que jugaron
// con vos.
import { app } from '../context.js';
import { state } from '../state.js';
import { uuid, jsStr, attrText, formatDate } from '../util.js';
import { formatDiff } from '../core/stats.js';
import { provisionalHandicapIndex } from '../core/insights.js';
import { listFriends, findFriend, friendRounds, friendRoundCount, saveFriend } from '../friends.js';
import { renderInsightsSections } from './home.js';
import { showModal } from './modal.js';
import { showToast } from './toast.js';
import { goTo } from './router.js';
import { viewRound, switchDashboardPlayer } from './dashboard.js';

let viewedFriendId = null;

export function renderFriendsList() {
  const el = document.getElementById('friends-list');
  if (!el) return;
  const friends = listFriends();
  if (!friends.length) {
    el.innerHTML = `<div class="empty-state"><div class="empty-icon">🏌️</div>Todavía no agregaste amigos.<br>Tocá + para sumar al primero.</div>`;
    return;
  }
  el.innerHTML = friends.map(f => {
    const played = friendRoundCount(f.player_id);
    const hcp = provisionalHandicapIndex(friendRounds(f.player_id));
    return `<div class="friend-card" onclick="viewFriend('${jsStr(f.player_id)}')">
      <div class="friend-avatar">${attrText((f.name || '?').trim().slice(0, 1).toUpperCase())}</div>
      <div class="friend-main">
        <div class="friend-name">${attrText(f.name)}</div>
        <div class="friend-sub">${played} ${played === 1 ? 'ronda' : 'rondas'} con vos${hcp.value !== null ? ' · HCP ' + (hcp.provisional ? '~' : '') + hcp.value.toFixed(1) + (hcp.provisional ? ' ⚠️' : '') : ''}</div>
      </div>
      <div class="friend-chevron">›</div>
    </div>`;
  }).join('');
}

function friendModalHtml(friend) {
  return `<label class="label" for="friend-name">Nombre</label><input class="input" id="friend-name" maxlength="48" autocomplete="off" placeholder="Nombre" value="${attrText(friend?.name || '')}">
    <label class="label" for="friend-hcp" style="margin-top:12px;">Handicap Index</label><input class="input" id="friend-hcp" type="number" min="-10" max="54" step="0.1" placeholder="Opcional" value="${friend?.handicap_index != null && friend.handicap_index !== '' ? friend.handicap_index : ''}">`;
}

export function showAddFriend() {
  showModal({
    title: 'Agregar amigo',
    html: friendModalHtml(null),
    confirmText: 'GUARDAR',
    safe: true,
    onConfirm: () => {
      const name = document.getElementById('friend-name')?.value.trim();
      const rawHcp = document.getElementById('friend-hcp')?.value.trim();
      const hcp = rawHcp === '' ? null : Number(rawHcp);
      if (!name || (hcp !== null && (!Number.isFinite(hcp) || hcp < -10 || hcp > 54))) {
        showToast('Revisá el nombre y el handicap');
        return;
      }
      saveFriend({ player_id: uuid().replace(/^r-/, 'p-'), name, handicap_index: hcp });
      showToast('Amigo agregado');
      renderFriendsList();
    },
  });
}

function editFriend(playerId) {
  const friend = findFriend(playerId);
  if (!friend) return;
  showModal({
    title: 'Editar amigo',
    html: friendModalHtml(friend),
    confirmText: 'GUARDAR',
    safe: true,
    onConfirm: () => {
      const name = document.getElementById('friend-name')?.value.trim();
      const rawHcp = document.getElementById('friend-hcp')?.value.trim();
      const hcp = rawHcp === '' ? null : Number(rawHcp);
      if (!name || (hcp !== null && (!Number.isFinite(hcp) || hcp < -10 || hcp > 54))) {
        showToast('Revisá el nombre y el handicap');
        return;
      }
      saveFriend({ ...friend, name, handicap_index: hcp });
      showToast('Guardado');
      renderFriendDetailScreen();
    },
  });
}

export function applySuggestedHandicap(playerId, value) {
  const friend = findFriend(playerId);
  if (!friend) return;
  saveFriend({ ...friend, handicap_index: value });
  showToast('Handicap actualizado a ' + value.toFixed(1));
  renderFriendDetailScreen();
}

export function viewFriend(playerId) {
  viewedFriendId = playerId;
  goTo('friend-detail');
}

function friendRoundCardHTML(r) {
  const hasTotal = r.total_score !== null && r.total_score !== undefined && r.total_score !== '';
  const diff = hasTotal ? r.total_score - r.par_total : null;
  return `<div class="round-card" onclick="viewFriendRound('${jsStr(r.round_id)}')">
    <div class="round-card-left">
      <div class="course">${attrText(r.course_name || '—')}</div>
      <div class="date">${formatDate(r.date)}${r.holes_played ? ` · ${r.holes_played} ${r.holes_played === 1 ? 'hoyo' : 'hoyos'}` : ''}</div>
    </div>
    <div class="round-card-right">
      ${hasTotal && r.completed
        ? `<div class="score-cell"><div class="score-big">${r.total_score}</div><div class="score-label">${formatDiff(diff)}</div></div>`
        : `<span style="font-size:11px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;">En curso</span>`}
    </div>
  </div>`;
}

export function renderFriendDetailScreen() {
  const friend = findFriend(viewedFriendId);
  if (!friend) { goTo('friends'); return; }

  document.getElementById('friend-detail-name').textContent = friend.name;
  const rounds = friendRounds(viewedFriendId);
  const done = rounds.filter(r => r.completed);
  const holes = done.flatMap(r => r._holes);
  const suggested = provisionalHandicapIndex(rounds);

  document.getElementById('friend-detail-hcp').textContent =
    friend.handicap_index != null && friend.handicap_index !== '' ? 'HCP ' + Number(friend.handicap_index).toFixed(1)
    : suggested.value !== null ? `HCP ${suggested.provisional ? '~' : ''}${suggested.value.toFixed(1)}${suggested.provisional ? ' ⚠️ estimado' : ''}`
    : 'Sin handicap cargado';

  const suggestEl = document.getElementById('friend-suggested-hcp');
  const current = friend.handicap_index != null && friend.handicap_index !== '' ? Number(friend.handicap_index) : null;
  if (suggestEl) {
    suggestEl.innerHTML = suggested.value === null ? '' : (current !== null && Math.abs(current - suggested.value) < 0.05 ? '' : `
      <div class="suggested-hcp-card">
        <div>
          <div class="suggested-hcp-label">${suggested.provisional ? 'Handicap estimado (recién arrancando)' : 'Handicap sugerido por sus últimas rondas'}</div>
          <div class="suggested-hcp-val">${suggested.provisional ? '~' : ''}${suggested.value.toFixed(1)}</div>
          ${suggested.provisional ? `<div class="suggested-hcp-note">Con ${suggested.rounds} ${suggested.rounds === 1 ? 'ronda' : 'rondas'} es sólo una estimación — mejor esperar a tener 3 tarjetas para un número más confiable.${suggested.approx ? ' La cancha no tiene rating cargado, así que se calculó contra el par.' : ''}</div>` : ''}
        </div>
        <button type="button" class="secondary-btn" style="margin:0;width:auto;padding:10px 16px;flex-shrink:0;" onclick="applySuggestedHandicap('${jsStr(friend.player_id)}', ${suggested.value})">Usar este</button>
      </div>`);
  }

  const statsEl = document.getElementById('friend-stats');
  if (statsEl) statsEl.innerHTML = renderInsightsSections(rounds, holes, { scope: 'friend', estimateHcp: true, third: true });

  const listEl = document.getElementById('friend-rounds-list');
  if (listEl) {
    listEl.innerHTML = rounds.length
      ? rounds.map(friendRoundCardHTML).join('')
      : `<div class="empty-state"><div class="empty-icon">⛳</div>Todavía no jugaron ninguna ronda juntos.</div>`;
  }
}

export function editCurrentFriend() {
  if (viewedFriendId) editFriend(viewedFriendId);
}

export function viewFriendRound(round_id) {
  const playerId = viewedFriendId;
  viewRound(round_id);
  // viewRound() va al dashboard sólo si la ronda está terminada; si no,
  // manda al tracker (donde igual se puede elegir con qué tarjeta seguir).
  if (state.currentRound && state.currentRound.round_id === round_id && state.currentRound.completed && playerId) {
    switchDashboardPlayer(playerId);
  }
}
