// ============================================================
// GOLFIE — PERFILES Y AMIGOS (pantallas)
// ============================================================
// Vive dentro de la pestaña Amigos: tu perfil, solicitudes, búsqueda por
// usuario y la ficha de cada amigo conectado (resumen + últimas rondas).
// ============================================================

import { jsStr, attrText, formatDate } from '../util.js';
import { formatDiff } from '../core/stats.js';
import { buildShareModel } from '../core/share.js';
import { apiGet, apiPost, cachedSocial, clearSocialCache, refreshSocial, friendlyError } from '../social.js';
import { renderInsightsSections } from './home.js';
import { showRoundImage } from './share.js';
import { showModal } from './modal.js';
import { showToast } from './toast.js';
import { goTo, switchTab } from './router.js';

let viewedUsername = null;
let viewedData = null;
let searchTimer = null;

const initial = p => attrText((p.display_name || p.username || '?').trim().slice(0, 1).toUpperCase());

// Foto si la tiene, y si no la inicial. `big` es la versión de la ficha.
function avatarHtml(p, big = false) {
  const cls = 'friend-avatar' + (big ? ' avatar-lg' : '');
  return p && p.avatar
    ? `<img class="${cls}" src="${attrText(p.avatar)}" alt="">`
    : `<div class="${cls}">${initial(p || {})}</div>`;
}

// ---------- FOTO DE PERFIL ----------
// Se achica en el teléfono a un cuadrado de 192px (JPEG): pesa ~10 KB, entra
// en la base sin problema y se ve nítida en los círculos de la app.
const AVATAR_SIZE = 192;
let pendingAvatar;   // undefined = sin cambios · '' = quitar · 'data:…' = foto nueva

async function resizeToAvatar(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#1e1e1e';
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
    return canvas.toDataURL('image/jpeg', 0.82);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function paintAvatarPreview() {
  const box = document.getElementById('sp-avatar-preview');
  if (!box) return;
  const mine = (cachedSocial() || {}).profile || {};
  const name = (document.getElementById('sp-name') || {}).value || mine.display_name || mine.username || '?';
  const current = pendingAvatar !== undefined ? pendingAvatar : mine.avatar || '';
  box.innerHTML = avatarHtml({ avatar: current, display_name: name }, true);
  const remove = document.getElementById('sp-avatar-remove');
  if (remove) remove.style.display = current ? 'inline' : 'none';
}

export async function pickProfilePhoto(input) {
  const file = input.files && input.files[0];
  if (!file) return;
  try {
    pendingAvatar = await resizeToAvatar(file);
    paintAvatarPreview();
  } catch (e) {
    showToast('No pudimos leer esa foto');
  }
  input.value = '';
}

export function clearProfilePhoto() {
  pendingAvatar = '';
  paintAvatarPreview();
}

// ---------- BLOQUE EN LA PESTAÑA AMIGOS ----------

function personRow(p, actions = '', onclick = '') {
  return `<div class="friend-card ${onclick ? '' : 'static'}" ${onclick ? `onclick="${onclick}"` : ''}>
    ${avatarHtml(p)}
    <div class="friend-main">
      <div class="friend-name">${attrText(p.display_name)}</div>
      <div class="friend-sub">@${attrText(p.username)}</div>
    </div>
    ${actions || (onclick ? '<div class="friend-chevron">›</div>' : '')}
  </div>`;
}

function paintSocial(el, social, note) {
  if (!social || !social.profile) {
    el.innerHTML = `<div class="social-cta">
      <div class="social-cta-title">Conectate con tus amigos</div>
      <div class="social-cta-text">Creá tu perfil y buscá a tus amigos por su usuario. Cuando acepten, se ven el handicap, las stats y las últimas rondas.</div>
      <button type="button" class="cta-btn social-cta-btn" onclick="showProfileForm()">Crear mi perfil</button>
    </div>`;
    return;
  }
  const { profile, friends, incoming, outgoing } = social;
  const reqBtns = u => `<div class="req-actions">
      <button type="button" class="req-btn yes" onclick="event.stopPropagation();answerRequest('${jsStr(u)}', true)" aria-label="Aceptar">✓</button>
      <button type="button" class="req-btn no" onclick="event.stopPropagation();answerRequest('${jsStr(u)}', false)" aria-label="Rechazar">✕</button>
    </div>`;
  el.innerHTML = `
    ${note ? `<div class="social-note">${attrText(note)}</div>` : ''}
    <div class="social-me">
      ${avatarHtml(profile)}
      <div class="friend-main">
        <div class="friend-name">${attrText(profile.display_name)}</div>
        <div class="friend-sub">@${attrText(profile.username)}</div>
      </div>
      <button type="button" class="link-btn" onclick="showProfileForm()">Editar</button>
    </div>
    ${incoming.length ? `<div class="section-title social-title">Solicitudes</div>
      ${incoming.map(p => personRow(p, reqBtns(p.username))).join('')}` : ''}
    <div class="section-title social-title">En Golfie</div>
    ${friends.length
      ? friends.map(p => personRow(p, '', `viewSocialFriend('${jsStr(p.username)}')`)).join('')
      : `<div class="empty-state" style="padding:20px 10px;">Todavía no tenés amigos conectados.<br>Buscalos por su usuario.</div>`}
    <button type="button" class="secondary-btn" style="margin-top:0;" onclick="showSearchFriends()">Buscar amigos</button>
    ${outgoing.length ? `<div class="section-title social-title">Enviadas</div>
      ${outgoing.map(p => personRow(p, `<button type="button" class="link-btn" onclick="removeConnection('${jsStr(p.username)}', true)">Cancelar</button>`)).join('')}` : ''}`;
}

export function updateFriendsBadge(social) {
  const badge = document.getElementById('friends-badge');
  if (!badge) return;
  const n = social && social.incoming ? social.incoming.length : 0;
  badge.textContent = n > 9 ? '9+' : String(n);
  badge.style.display = n ? 'flex' : 'none';
}

export async function renderSocialBlock() {
  const el = document.getElementById('social-block');
  if (!el) return;
  paintSocial(el, cachedSocial());
  try {
    const social = await refreshSocial();
    paintSocial(el, social);
    updateFriendsBadge(social);
  } catch (e) {
    if (cachedSocial() && cachedSocial().profile) paintSocial(el, cachedSocial(), 'Sin conexión: se muestra lo último guardado.');
  }
}

// Actualiza el globito de solicitudes sin abrir la pestaña (al arrancar y al volver a la app).
export async function refreshFriendsBadge() {
  const cached = cachedSocial();
  if (!cached || !cached.profile) return;
  try { updateFriendsBadge(await refreshSocial()); } catch { updateFriendsBadge(cached); }
}

// ---------- PERFIL ----------

export function showProfileForm(prefill) {
  const mine = (cachedSocial() || {}).profile;
  const v = prefill || mine || {};
  if (!prefill) pendingAvatar = undefined;   // al reabrir tras un error se conserva la foto elegida
  showModal({
    title: mine ? 'Tu perfil' : 'Crear perfil',
    html: `<div class="avatar-pick">
        <div id="sp-avatar-preview"></div>
        <div class="avatar-pick-actions">
          <button type="button" class="secondary-btn" style="margin:0;padding:10px 16px;font-size:14px;" onclick="document.getElementById('sp-photo').click()">Elegir foto</button>
          <button type="button" id="sp-avatar-remove" class="link-btn" style="padding:6px 2px;" onclick="clearProfilePhoto()">Quitar foto</button>
        </div>
        <input type="file" id="sp-photo" accept="image/*" hidden onchange="pickProfilePhoto(this)">
      </div>
      <label class="label" for="sp-username">Usuario</label>
      <input class="input" id="sp-username" maxlength="20" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="juan_golf" value="${attrText(v.username || '')}">
      <div class="form-hint" style="margin-top:6px;">De 3 a 20 letras, números o guión bajo. Tus amigos te buscan por este usuario.</div>
      <label class="label" for="sp-name">Nombre</label>
      <input class="input" id="sp-name" maxlength="30" autocomplete="off" placeholder="Cómo te ven tus amigos" value="${attrText(v.display_name || '')}">
      <div class="form-hint" style="margin-top:8px;">Sólo los amigos que aceptes ven tu handicap, tus stats y tus últimas rondas. Tu código y tus palos son privados.</div>
      ${mine ? `<button type="button" class="danger-btn" style="margin-top:14px;" onclick="dropProfile()">Eliminar mi perfil</button>` : ''}`,
    confirmText: 'GUARDAR',
    safe: true,
    onConfirm: async () => {
      const username = document.getElementById('sp-username').value.trim();
      const display_name = document.getElementById('sp-name').value.trim();
      const payload = { username, display_name };
      if (pendingAvatar !== undefined) payload.avatar = pendingAvatar;
      try {
        await apiPost('saveProfile', payload);
        pendingAvatar = undefined;
        showToast(mine ? 'Perfil guardado' : 'Perfil creado ✓');
        renderSocialBlock();
      } catch (e) {
        showToast(friendlyError(e), 3500);
        showProfileForm({ username, display_name });
      }
    },
  });
  paintAvatarPreview();
}

export function dropProfile() {
  showModal({
    title: 'Eliminar perfil',
    body: 'Dejás de ser visible y se cortan todas tus conexiones. Tus rondas no se borran.',
    confirmText: 'ELIMINAR',
    onConfirm: async () => {
      try {
        await apiPost('deleteProfile');
        clearSocialCache();
        updateFriendsBadge(null);
        showToast('Perfil eliminado');
        renderSocialBlock();
      } catch (e) { showToast(friendlyError(e), 3500); }
    },
  });
}

// ---------- BUSCAR ----------

export function showSearchFriends() {
  showModal({
    title: 'Buscar amigos',
    html: `<input class="input" id="sf-q" maxlength="20" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="Usuario de tu amigo" oninput="runSearch(this.value)">
      <div id="sf-results" class="sf-results"><div class="form-hint" style="margin-top:10px;">Escribí al menos 3 letras de su usuario.</div></div>`,
    confirmText: 'CERRAR',
    safe: true,
    onConfirm: () => {},
  });
}

function relationButton(p) {
  const u = jsStr(p.username);
  if (p.relation === 'friends') return '<span class="sf-state">Amigos ✓</span>';
  if (p.relation === 'sent') return '<span class="sf-state">Enviada</span>';
  if (p.relation === 'received') return `<button type="button" class="req-btn yes wide" onclick="answerRequest('${u}', true)">Aceptar</button>`;
  return `<button type="button" class="req-btn yes wide" onclick="sendRequest('${u}')">Agregar</button>`;
}

async function searchNow(query) {
  const box = document.getElementById('sf-results');
  if (!box) return;
  const q = String(query || '').trim().replace(/^@/, '');
  if (q.length < 3) {
    box.innerHTML = '<div class="form-hint" style="margin-top:10px;">Escribí al menos 3 letras de su usuario.</div>';
    return;
  }
  try {
    const found = await apiGet('searchProfiles', { q });
    // Si mientras tanto siguió escribiendo, esta respuesta ya quedó vieja.
    const input = document.getElementById('sf-q');
    if (input && input.value.trim().replace(/^@/, '') !== q) return;
    box.innerHTML = found.length
      ? found.map(p => `<div class="sf-row">
          ${avatarHtml(p)}
          <div class="friend-main"><div class="friend-name">${attrText(p.display_name)}</div><div class="friend-sub">@${attrText(p.username)}</div></div>
          ${relationButton(p)}
        </div>`).join('')
      : '<div class="form-hint" style="margin-top:10px;">No encontramos a nadie con ese usuario.</div>';
  } catch (e) {
    box.innerHTML = `<div class="form-hint" style="margin-top:10px;">${attrText(friendlyError(e))}</div>`;
  }
}

export function runSearch(value) {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => searchNow(value), 300);
}

// ---------- SOLICITUDES ----------

export async function sendRequest(username) {
  try {
    const r = await apiPost('requestFriend', { username });
    showToast(r.status === 'friends' ? 'Ya son amigos ✓' : 'Solicitud enviada ✓');
    const input = document.getElementById('sf-q');
    if (input) searchNow(input.value);
    renderSocialBlock();
  } catch (e) { showToast(friendlyError(e), 3500); }
}

export async function answerRequest(username, accept) {
  try {
    await apiPost('respondFriend', { username, accept: !!accept });
    showToast(accept ? 'Ahora son amigos ✓' : 'Solicitud rechazada');
    const input = document.getElementById('sf-q');
    if (input) searchNow(input.value);
    renderSocialBlock();
  } catch (e) { showToast(friendlyError(e), 3500); }
}

export function removeConnection(username, isRequest = false) {
  showModal({
    title: isRequest ? 'Cancelar solicitud' : 'Dejar de ser amigos',
    body: isRequest ? '¿Querés cancelar la solicitud que enviaste?' : 'Dejan de verse el handicap y las rondas. Pueden volver a conectarse cuando quieran.',
    confirmText: isRequest ? 'CANCELAR SOLICITUD' : 'QUITAR',
    onConfirm: async () => {
      try {
        await apiPost('removeFriend', { username });
        showToast(isRequest ? 'Solicitud cancelada' : 'Listo');
        if (!isRequest) switchTab('friends'); else renderSocialBlock();
      } catch (e) { showToast(friendlyError(e), 3500); }
    },
  });
}

// ---------- FICHA DE UN AMIGO ----------

export function viewSocialFriend(username) {
  viewedUsername = username;
  viewedData = null;
  goTo('social-profile');
}

export function removeSocialFriend() {
  if (viewedUsername) removeConnection(viewedUsername, false);
}

function socialRoundCard(r) {
  const diff = r.total_score - r.par_total;
  const holes = r._holes.length || Number(r.course_holes_count) || 0;
  return `<div class="round-card" onclick="viewSocialRound('${jsStr(r.round_id)}')">
    <div class="round-card-left">
      <div class="course">${attrText(r.course_name || '—')}</div>
      <div class="date">${formatDate(r.date)}${holes ? ` · ${holes} ${holes === 1 ? 'hoyo' : 'hoyos'}` : ''}</div>
    </div>
    <div class="round-card-right">
      <div class="score-cell"><div class="score-big">${r.total_score}</div><div class="score-label">${formatDiff(diff)}</div></div>
    </div>
  </div>`;
}

export async function renderSocialProfile() {
  const title = document.getElementById('sp-title');
  const sub = document.getElementById('sp-sub');
  const pic = document.getElementById('sp-avatar');
  const stats = document.getElementById('sp-stats');
  const list = document.getElementById('sp-rounds');
  if (!viewedUsername || !title) { switchTab('friends'); return; }

  const known = ((cachedSocial() || {}).friends || []).find(p => p.username === viewedUsername);
  title.textContent = known ? known.display_name : viewedUsername;
  sub.textContent = '@' + viewedUsername;
  pic.innerHTML = avatarHtml(known || { display_name: viewedUsername }, true);
  stats.innerHTML = '<div class="empty-state">Cargando…</div>';
  list.innerHTML = '';

  try {
    const data = await apiGet('getFriendData', { username: viewedUsername });
    viewedData = data;
    title.textContent = data.profile.display_name;
    pic.innerHTML = avatarHtml(data.profile, true);
    const byRound = {};
    data.holes.forEach(h => { (byRound[h.round_id] = byRound[h.round_id] || []).push(h); });
    const rounds = data.rounds.map(r => ({ ...r, _holes: byRound[r.round_id] || [] }));
    viewedData.rounds = rounds;

    if (!rounds.length) {
      stats.innerHTML = '<div class="empty-state"><div class="empty-icon">⛳</div>Todavía no tiene rondas terminadas.</div>';
      return;
    }
    stats.innerHTML = renderInsightsSections(rounds, rounds.flatMap(r => r._holes), { scope: 'social', estimateHcp: true, third: true });
    list.innerHTML = `<div class="section-title" style="margin-top:24px;">Últimas rondas</div>
      <div class="history-list" style="padding:0;">${rounds.slice(0, 10).map(socialRoundCard).join('')}</div>
      <div class="form-hint" style="margin-top:10px;">Tocá una ronda para ver su tarjeta y compartirla.</div>`;
  } catch (e) {
    stats.innerHTML = `<div class="empty-state">${attrText(friendlyError(e))}</div>`;
  }
}

// La tarjeta de una ronda de un amigo se ve como imagen: se puede compartir igual que las tuyas.
export function viewSocialRound(roundId) {
  if (!viewedData) return;
  const round = viewedData.rounds.find(r => r.round_id === roundId);
  if (!round) return;
  const holesMap = Object.fromEntries(round._holes.map(h => [h.hole_number, h]));
  const model = buildShareModel({
    round,
    players: [{ player_id: 'me', name: viewedData.profile.display_name }],
    holesByPlayer: { me: holesMap },
    selection: 'me',
  });
  showRoundImage({ round, model, showName: true });
}
