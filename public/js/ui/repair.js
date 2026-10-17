// Pantallas de mantenimiento: estado de la cola, rondas sin identificar,
// subidas que esperan aprobación, y el diagnóstico de conexión.
import { app } from '../context.js';
import { attrText } from '../util.js';
import { showModal } from './modal.js';
import { showToast } from './toast.js';
import { renderHome } from './home.js';

// ---------- LÍNEAS DE ESTADO DEL HOME ----------

export function renderPending() {
  const el = document.getElementById('pending-status');
  if (!el) return;
  const n = app.sync.queueGet().length;
  el.textContent = n ? '⟳ ' + n + (n === 1 ? ' cambio sin subir' : ' cambios sin subir') + ' · tocá para reintentar' : '';
}

export function renderCleanup() {
  const el = document.getElementById('cleanup-status');
  if (!el) return;
  const n = app.sync.orphanRounds().length;
  el.textContent = n ? '⚠ ' + n + (n === 1 ? ' ronda sin identificar' : ' rondas sin identificar') + ' · tocá para revisar' : '';
}

export function renderHold() {
  const el = document.getElementById('hold-status');
  if (!el) return;
  const n = (app.store.loadFromLS('reconcile_hold') || []).length;
  el.textContent = n ? '⚠ ' + n + ' registros esperando para subir · tocá para revisar' : '';
}

export function renderStatusLines() {
  renderPending();
  renderCleanup();
  renderHold();
}

export function clearQueue() {
  app.sync.clearQueue();
}

// ---------- REPARAR DATOS ----------

export function showRepair() {
  const cola = app.sync.queueGet();
  const porTipo = {};
  cola.forEach(it => porTipo[it.endpoint] = (porTipo[it.endpoint] || 0) + 1);
  const colaTxt = cola.length
    ? Object.entries(porTipo).map(([k, v]) => k + ' ×' + v).join(' · ')
    : 'vacía';

  const filas = app.sync.coursesSummary().map(([cancha, n]) =>
    '<label style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.08);">'
    + '<input type="checkbox" class="repair-course" data-course="' + attrText(cancha) + '" style="width:18px;height:18px;flex:none;">'
    + '<span style="flex:1;">' + cancha + '</span>'
    + '<span style="opacity:.5;font-size:12px;">' + n.total + (n.orphan ? ' · ' + n.orphan + ' sin dueño' : '') + '</span></label>').join('');

  const box = 'background:rgba(255,255,255,.05);border-radius:8px;padding:10px;margin-bottom:14px;font-family:monospace;font-size:12px;line-height:1.6;';
  const lastError = app.sync.getLastSyncError();

  showModal({
    title: 'Reparar datos',
    html: '<div style="' + box + '" id="diag-net">Probando conexión...</div>'
      + '<div style="' + box + '">Cola: ' + colaTxt
      + (lastError ? '<br>Último error: ' + lastError : '')
      + '<br><span onclick="clearQueue()" style="color:#fbbf24;cursor:pointer;text-decoration:underline;">vaciar la cola</span></div>'
      + '<div style="margin-bottom:10px;"><b>Marcá las canchas a borrar.</b> Se van del celular y del servidor.</div>'
      + '<div style="max-height:32vh;overflow:auto;">' + filas + '</div>',
    confirmText: 'BORRAR MARCADAS',
    onConfirm: applyRepair,
  });

  app.sync.diagnose().then(lineas => {
    const el = document.getElementById('diag-net');
    if (el) el.innerHTML = lineas.join('<br>');
  });
}

export function applyRepair() {
  const borrar = new Set();
  document.querySelectorAll('.repair-course').forEach(cb => {
    if (cb.checked) borrar.add(cb.dataset.course);
  });
  if (!borrar.size) { showToast('No marcaste ninguna cancha'); return; }

  const quedan = [];
  let n = 0;
  app.store.loadRounds().forEach(r => {
    if (!borrar.has(r.course_name || '—')) { quedan.push(r); return; }
    app.sync.purgeQueueForRound(r.round_id);
    app.store.removeRoundData(r.round_id);
    app.sync.postToSheets('deleteRound', { round_id: r.round_id });
    n++;
  });

  app.store.saveRounds(quedan);
  app.store.saveToLS('courses', (app.store.loadFromLS('courses') || []).filter(c => !borrar.has(c.name)));
  renderHome(); renderPending(); renderCleanup();
  showToast(n + (n === 1 ? ' ronda borrada' : ' rondas borradas'), 3000);
}

// ---------- RONDAS SIN IDENTIFICAR ----------

export function showCleanup() {
  const orphans = app.sync.orphanRounds();
  if (!orphans.length) { showToast('No hay rondas sin identificar'); return; }

  const porCancha = {};
  orphans.forEach(r => {
    const c = r.course_name || '—';
    (porCancha[c] = porCancha[c] || []).push(r);
  });

  const filas = Object.entries(porCancha)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([cancha, rs]) =>
      '<label style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(255,255,255,.08);">'
      + '<input type="checkbox" class="cleanup-course" data-course="' + attrText(cancha) + '" style="width:18px;height:18px;flex:none;">'
      + '<span style="flex:1;">' + cancha + '</span>'
      + '<span style="opacity:.5;font-size:12px;">' + rs.length + '</span></label>').join('');

  showModal({
    title: 'Rondas sin identificar',
    html: '<div style="margin-bottom:12px;">Quedaron en el celular sin dueño: o son tuyas de antes del código, o se colaron de otra persona por el sync viejo.</div>'
      + '<div style="margin-bottom:12px;"><b>Marcá las canchas donde jugaste vos.</b> Las que dejes sin marcar se borran del celular y del servidor.</div>'
      + '<div style="max-height:38vh;overflow:auto;">' + filas + '</div>',
    confirmText: 'APLICAR',
    onConfirm: applyCleanup,
  });
}

export function applyCleanup() {
  const mias = new Set();
  document.querySelectorAll('.cleanup-course').forEach(cb => {
    if (cb.checked) mias.add(cb.dataset.course);
  });

  const uid = app.store.getUserId();
  const quedan = [];
  let adoptadas = 0, borradas = 0;

  app.store.loadRounds().forEach(r => {
    if (String(r.user_id || '').trim() === uid) { quedan.push(r); return; }

    if (mias.has(r.course_name || '—')) {
      r.user_id = uid;
      quedan.push(r);
      adoptadas++;
      return;
    }

    app.sync.purgeQueueForRound(r.round_id);
    app.store.removeRoundData(r.round_id);
    app.sync.postToSheets('deleteRound', { round_id: r.round_id });   // por si ya se había subido
    borradas++;
  });

  app.store.saveRounds(quedan);
  renderHome(); renderCleanup(); renderPending();
  showToast(adoptadas + ' adoptadas · ' + borradas + ' borradas', 3000);
  app.sync.syncFromServer();
}

// ---------- SUBIDAS EN ESPERA ----------

export function showHold() {
  const hold = app.store.loadFromLS('reconcile_hold') || [];
  if (!hold.length) { showToast('No hay nada esperando'); return; }

  const porCancha = {};
  const rounds = {};
  app.store.loadRounds().forEach(r => rounds[String(r.round_id)] = r);
  hold.forEach(h => {
    const r = rounds[String((h.data || {}).round_id)];
    const c = (r && r.course_name) || '—';
    porCancha[c] = (porCancha[c] || 0) + 1;
  });

  const filas = Object.entries(porCancha).sort((a, b) => b[1] - a[1])
    .map(([c, n]) => '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid rgba(255,255,255,.08);"><span>' + c + '</span><span style="opacity:.5;">' + n + '</span></div>').join('');

  showModal({
    title: 'Revisar antes de subir',
    html: '<div style="margin-bottom:12px;">Hay <b>' + hold.length + ' registros</b> en el celular que no están en el servidor. Es normal al recuperar rondas viejas, pero si ves canchas que no jugaste, no las subas: borralas desde <b>Reparar datos</b>.</div>'
      + '<div style="max-height:34vh;overflow:auto;margin-bottom:12px;">' + filas + '</div>',
    confirmText: 'SUBIR TODO',
    safe: true,
    onConfirm: applyHold,
  });
}

export function applyHold() {
  const hold = app.store.loadFromLS('reconcile_hold') || [];
  hold.forEach(h => app.sync.enqueue(h.endpoint, h.data));
  app.store.saveToLS('reconcile_hold', []);
  renderHold(); renderPending();
  showToast('Subiendo ' + hold.length + ' registros', 3000);
  app.sync.flushPending();
}
