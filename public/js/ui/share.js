// ============================================================
// GOLFIE — IMAGEN PARA COMPARTIR
// ============================================================
// Dibuja la ronda en un canvas (tarjeta + stats clave) y la ofrece para
// compartir o guardar. Sin librerías: es canvas 2D a mano, y funciona sin
// señal. El contenido sale de core/share.js; acá sólo se dibuja.
// ============================================================

import { app } from '../context.js';
import { state } from '../state.js';
import { jsStr, attrText } from '../util.js';
import { findCourse } from '../catalog.js';
import { hasStrokeIndex } from '../core/courses.js';
import { holeClass, formatDiff } from '../core/stats.js';
import { buildShareModel, shareOptions } from '../core/share.js';
import { showModal } from './modal.js';
import { showToast } from './toast.js';

const W = 1080;
const PAD = 56;
const INNER = W - PAD * 2;
const C = {
  bg: '#0a0a0a', surface: '#141414', surface2: '#1e1e1e', border: '#2a2a2a',
  green: '#4ade80', yellow: '#fbbf24', red: '#f87171', text: '#f5f5f5', muted: '#8a8a8a',
  gold: '#ffd700', deep: '#dc2626',
};
const DISPLAY = '"Bebas Neue", Impact, sans-serif';
const BODY = '"DM Sans", system-ui, -apple-system, sans-serif';

const NAME_KEY = 'display_name';
let lastUrl = null, lastFile = null, lastTitle = '';

// ---------- DIBUJO ----------

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function card(ctx, x, y, w, h, { fill = C.surface, stroke = C.border, r = 28 } = {}) {
  roundRectPath(ctx, x, y, w, h, r);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.lineWidth = 2; ctx.strokeStyle = stroke; ctx.stroke(); }
}

// Texto que se achica hasta entrar en maxWidth.
function text(ctx, str, x, y, { font = BODY, size = 32, weight = '', color = C.text, align = 'left', baseline = 'alphabetic', maxWidth = null, minSize = 18 } = {}) {
  let s = size;
  ctx.textAlign = align; ctx.textBaseline = baseline; ctx.fillStyle = color;
  ctx.font = `${weight} ${s}px ${font}`.trim();
  if (maxWidth) {
    while (ctx.measureText(str).width > maxWidth && s > minSize) { s -= 2; ctx.font = `${weight} ${s}px ${font}`.trim(); }
    if (ctx.measureText(str).width > maxWidth) {
      let t = String(str);
      while (t.length > 1 && ctx.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
      str = t + '…';
    }
  }
  ctx.fillText(str, x, y);
  return ctx.measureText(str).width;
}

function label(ctx, str, x, y, opts = {}) {
  return text(ctx, String(str).toUpperCase(), x, y, { size: 24, weight: '600', color: C.muted, ...opts });
}

function glyph(ctx, cx, cy, score, par) {
  const cls = holeClass(score, par);
  const stroke = (shape, size, color) => {
    ctx.lineWidth = 3.5; ctx.strokeStyle = color;
    if (shape === 'circle') { ctx.beginPath(); ctx.arc(cx, cy, size / 2, 0, Math.PI * 2); ctx.stroke(); }
    else { roundRectPath(ctx, cx - size / 2, cy - size / 2, size, size, 5); ctx.stroke(); }
  };
  let color = C.text;
  if (cls === 'eagle') { stroke('circle', 56, C.gold); stroke('circle', 44, C.gold); color = C.gold; }
  else if (cls === 'birdie') { stroke('circle', 52, C.green); color = C.green; }
  else if (cls === 'bogey') { stroke('square', 50, C.red); color = C.red; }
  else if (cls === 'double') { stroke('square', 50, C.red); stroke('square', 62, C.red); color = C.red; }
  else if (cls === 'triple') { stroke('square', 40, C.deep); stroke('square', 51, C.deep); stroke('square', 62, C.deep); color = C.deep; }
  text(ctx, String(score), cx, cy + 2, { font: DISPLAY, size: 40, color, align: 'center', baseline: 'middle' });
}

function header(ctx, m, y) {
  text(ctx, 'GOLFIE', PAD, y + 40, { font: DISPLAY, size: 50, color: C.green });
  const date = m.date ? new Date(m.date).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  text(ctx, date, W - PAD, y + 38, { size: 30, color: C.muted, align: 'right' });
  y += 100;
  text(ctx, m.courseName, PAD, y + 76, { font: DISPLAY, size: 100, maxWidth: INNER, minSize: 54 });
  y += 100;
  const meta = [m.tees, `${m.holesCount} hoyos`, m.formatLabel].filter(Boolean).join(' · ');
  text(ctx, meta, PAD, y + 28, { size: 30, color: C.muted });
  return y + 80;
}

function singleBlock(ctx, m, y, showName) {
  const r = m.rows[0];
  if (showName) { text(ctx, r.name, PAD, y + 50, { font: DISPLAY, size: 64, color: C.text, maxWidth: INNER }); y += 78; }
  const scoreW = text(ctx, String(r.total.score), PAD, y + 190, { font: DISPLAY, size: 250, color: C.green });
  text(ctx, formatDiff(r.diff), PAD + scoreW + 28, y + 190, { font: DISPLAY, size: 110, color: C.muted });
  text(ctx, `Par ${r.total.par}`, W - PAD, y + 188, { size: 32, color: C.muted, align: 'right' });
  return y + 250;
}

function tiles(ctx, items, y) {
  const gap = 16, w = (INNER - gap * (items.length - 1)) / items.length, h = 172;
  items.forEach((it, i) => {
    const x = PAD + i * (w + gap);
    card(ctx, x, y, w, h);
    text(ctx, it.value, x + w / 2, y + 100, { font: DISPLAY, size: 84, color: it.color || C.text, align: 'center' });
    label(ctx, it.label, x + w / 2, y + 144, { align: 'center', size: 21, maxWidth: w - 20 });
  });
  return y + h + 40;
}

function distribution(ctx, d, y) {
  if (!d.total) return y;
  const segs = [
    { name: 'Eagles', n: d.eagle, color: C.gold }, { name: 'Birdies', n: d.birdie, color: C.green },
    { name: 'Pares', n: d.par, color: '#3f8f5f' }, { name: 'Bogeys', n: d.bogey, color: C.yellow },
    { name: 'Dobles', n: d.double, color: C.red }, { name: 'Triples+', n: d.triple, color: C.deep },
  ].filter(s => s.n > 0);
  label(ctx, 'Cómo anotó', PAD, y + 24);
  y += 44;
  let x = PAD;
  segs.forEach((s, i) => {
    const w = Math.max(8, (INNER - 4 * (segs.length - 1)) * s.n / d.total);
    roundRectPath(ctx, x, y, w, 30, 15); ctx.fillStyle = s.color; ctx.fill();
    x += w + 4;
  });
  y += 76;
  let lx = PAD;
  segs.forEach(s => {
    ctx.fillStyle = s.color; roundRectPath(ctx, lx, y - 20, 20, 20, 5); ctx.fill();
    const w = text(ctx, `${s.name} ${s.n}`, lx + 30, y, { size: 28, color: C.text });
    lx += 30 + w + 34;
  });
  return y + 56;
}

function standingsBlock(ctx, st, y) {
  label(ctx, `Resultado · ${st.label}`, PAD, y + 24);
  y += 46;
  const rowH = 96;
  card(ctx, PAD, y, INNER, rowH * st.rows.length + 8);
  st.rows.forEach((p, i) => {
    const ry = y + 4 + i * rowH;
    if (i) { ctx.fillStyle = C.border; ctx.fillRect(PAD + 28, ry, INNER - 56, 2); }
    const lead = i === 0;
    text(ctx, String(i + 1), PAD + 54, ry + rowH / 2 + 2, { font: DISPLAY, size: 56, color: lead ? C.green : C.muted, align: 'center', baseline: 'middle' });
    text(ctx, p.name, PAD + 110, ry + rowH / 2 + 2, { size: 36, weight: '600', baseline: 'middle', maxWidth: INNER - 360 });
    text(ctx, String(p.value), W - PAD - 34, ry + rowH / 2 + 4, { font: DISPLAY, size: 66, color: lead ? C.green : C.text, align: 'right', baseline: 'middle' });
  });
  return y + rowH * st.rows.length + 8 + 44;
}

function statsTable(ctx, rows, y) {
  label(ctx, 'Stats', PAD, y + 24);
  y += 46;
  const cols = [['Golpes', r => r.total.score], ['Putts', r => (r.stats.putts === null ? '—' : r.stats.putts.toFixed(1))],
    ['GIR', r => (r.stats.girPct === null ? '—' : r.stats.girPct + '%')], ['Fairways', r => (r.stats.fairwayPct === null ? '—' : r.stats.fairwayPct + '%')]];
  const nameW = 300, colW = (INNER - 40 - nameW) / cols.length, rowH = 84;
  card(ctx, PAD, y, INNER, 64 + rowH * rows.length + 8);
  cols.forEach(([name], i) => label(ctx, name, PAD + 20 + nameW + colW * i + colW / 2, y + 42, { align: 'center', size: 21 }));
  rows.forEach((r, i) => {
    const ry = y + 64 + i * rowH;
    ctx.fillStyle = C.border; ctx.fillRect(PAD + 20, ry, INNER - 40, 2);
    text(ctx, r.name, PAD + 24, ry + rowH / 2 + 2, { size: 32, weight: '600', baseline: 'middle', maxWidth: nameW - 20 });
    cols.forEach(([, get], c) => text(ctx, String(get(r)), PAD + 20 + nameW + colW * c + colW / 2, ry + rowH / 2 + 4, { font: DISPLAY, size: 46, align: 'center', baseline: 'middle' }));
  });
  return y + 64 + rowH * rows.length + 8 + 44;
}

// Media tarjeta (ida o vuelta): hoyo, par y una fila por jugador.
function halfCard(ctx, m, y, from, title, single) {
  label(ctx, title, PAD, y + 24);
  y += 46;
  const labelW = 170, totW = 98, cellW = (INNER - labelW - totW) / 9;
  const headH = 58, parH = 58, rowH = 86, gap = 0;
  const rows = m.rows;
  const totalH = headH + parH + rowH * rows.length + gap;
  card(ctx, PAD, y, INNER, totalH);
  const xOf = i => PAD + labelW + cellW * i;
  // encabezado
  ctx.fillStyle = C.surface2;
  roundRectPath(ctx, PAD + 2, y + 2, INNER - 4, headH, 26); ctx.fill();
  ctx.fillRect(PAD + 2, y + headH - 20, INNER - 4, 20);
  label(ctx, 'Hoyo', PAD + 24, y + 38, { size: 21 });
  for (let i = 0; i < 9; i++) text(ctx, String(from + i), xOf(i) + cellW / 2, y + 40, { font: DISPLAY, size: 34, color: C.muted, align: 'center' });
  label(ctx, 'Tot', xOf(9) + totW / 2, y + 38, { align: 'center', size: 21 });
  // par
  const py = y + headH;
  label(ctx, 'Par', PAD + 24, py + 38, { size: 21 });
  let parSum = 0, parAny = false;
  for (let i = 0; i < 9; i++) {
    const par = m.pars[from + i];
    if (par) { parSum += par; parAny = true; }
    text(ctx, par ? String(par) : '·', xOf(i) + cellW / 2, py + 40, { font: DISPLAY, size: 34, color: C.muted, align: 'center' });
  }
  text(ctx, parAny ? String(parSum) : '', xOf(9) + totW / 2, py + 40, { font: DISPLAY, size: 34, color: C.muted, align: 'center' });
  // jugadores
  rows.forEach((r, ri) => {
    const ry = py + parH + ri * rowH;
    ctx.fillStyle = C.border; ctx.fillRect(PAD + 20, ry, INNER - 40, 2);
    text(ctx, single ? 'Score' : r.short, PAD + 24, ry + rowH / 2 + 2, { size: single ? 24 : 28, weight: '600', color: single ? C.muted : C.text, baseline: 'middle', maxWidth: labelW - 30, minSize: 20 });
    for (let i = 0; i < 9; i++) {
      const score = r.scores[from + i];
      const cx = xOf(i) + cellW / 2, cy = ry + rowH / 2;
      if (score) glyph(ctx, cx, cy, score, r.pars[from + i] || m.pars[from + i] || 4);
      else text(ctx, '·', cx, cy, { font: DISPLAY, size: 36, color: C.border, align: 'center', baseline: 'middle' });
    }
    const half = from === 1 ? r.front : r.back;
    text(ctx, half.played ? String(half.score) : '—', xOf(9) + totW / 2, ry + rowH / 2 + 4, { font: DISPLAY, size: 48, color: C.green, align: 'center', baseline: 'middle' });
  });
  return y + totalH + 44;
}

export async function renderShareCanvas(m, { showName = false } = {}) {
  if (document.fonts && document.fonts.load) {
    await Promise.all([
      document.fonts.load('80px "Bebas Neue"'),
      document.fonts.load('32px "DM Sans"'),
      document.fonts.load('600 32px "DM Sans"'),
    ]).catch(() => {});
  }
  const tall = document.createElement('canvas');
  tall.width = W; tall.height = 3600;
  const ctx = tall.getContext('2d');
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, tall.height);
  const glow = ctx.createRadialGradient(W * 0.85, 0, 0, W * 0.85, 0, 700);
  glow.addColorStop(0, 'rgba(74,222,128,0.16)'); glow.addColorStop(1, 'rgba(74,222,128,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, 900);

  let y = header(ctx, m, PAD);
  const single = m.mode === 'single';
  const rows = m.rows;

  if (single) {
    const r = rows[0];
    y = singleBlock(ctx, m, y, showName);
    y = tiles(ctx, [
      { label: 'Putts / hoyo', value: r.stats.putts === null ? '—' : r.stats.putts.toFixed(1), color: C.green },
      { label: 'Greens', value: r.stats.girPct === null ? '—' : r.stats.girPct + '%' },
      { label: 'Fairways', value: r.stats.fairwayPct === null ? '—' : r.stats.fairwayPct + '%' },
      { label: '3 putts', value: String(r.stats.threePutts) },
    ], y);
    y = distribution(ctx, r.stats.dist, y);
  } else {
    if (m.standings) y = standingsBlock(ctx, m.standings, y);
    y = statsTable(ctx, rows, y);
  }

  y = halfCard(ctx, m, y, 1, m.holesCount > 9 ? 'Ida' : 'Tarjeta', single);
  if (m.holesCount > 9 && rows.some(r => r.back.played)) y = halfCard(ctx, m, y, 10, 'Vuelta', single);

  text(ctx, 'golfie.shymie.workers.dev', W / 2, y + 30, { size: 26, color: C.muted, align: 'center' });
  y += 90;

  const out = document.createElement('canvas');
  out.width = W; out.height = y;
  out.getContext('2d').drawImage(tall, 0, 0, W, y, 0, 0, W, y);
  return out;
}

// ---------- FLUJO ----------

function storedName() {
  const v = app.store.loadFromLS(NAME_KEY);
  return typeof v === 'string' && v.trim() ? v.trim() : '';
}

function hasNetFor(round, players) {
  const course = round.course_id ? findCourse(round.course_id) : null;
  return players.length > 0 && players.every(p => p.playing_handicap != null) && hasStrokeIndex(course);
}

function slug(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function shareRoundImage() {
  const round = state.currentRound;
  if (!round) return;
  const players = state.roundPlayers && state.roundPlayers.length ? state.roundPlayers : [{ player_id: 'me', name: 'Yo' }];
  const name = storedName();
  const options = shareOptions({ round, players, names: { me: name || undefined } });
  if (options.length <= 1) { makeShareImage(options[0] ? options[0].key : 'all'); return; }
  showModal({
    title: 'Compartir imagen',
    html: `<div style="margin-bottom:10px;">¿De quién es la tarjeta?</div>
      ${options.map(o => `<button type="button" class="secondary-btn" style="margin-top:8px;" onclick="makeShareImage('${jsStr(o.key)}')">${attrText(o.label)}</button>`).join('')}
      <div style="margin:16px 0 6px;">Tu nombre en la imagen</div>
      <input id="share-name" class="input" maxlength="24" placeholder="Yo" value="${attrText(name)}" autocomplete="off">`,
    confirmText: 'CERRAR',
    safe: true,
    onConfirm: () => {},
  });
}

export async function makeShareImage(selection) {
  const round = state.currentRound;
  if (!round) return;
  const nameInput = document.getElementById('share-name');
  if (nameInput) app.store.saveToLS(NAME_KEY, nameInput.value.trim());
  const name = storedName();

  const players = state.roundPlayers && state.roundPlayers.length ? state.roundPlayers : [{ player_id: 'me', name: 'Yo' }];
  const holesByPlayer = Object.fromEntries(players.map(p => [p.player_id, app.store.loadHoles(round.round_id, p.player_id)]));
  const model = buildShareModel({
    round, players, holesByPlayer, selection,
    names: { me: name || undefined },
    hasNet: hasNetFor(round, players),
  });
  const showName = model.mode === 'single' && (model.rows[0].key !== 'me' || !!name);
  await showRoundImage({ round, model, showName });
}

// Dibuja el modelo y abre la vista previa con compartir / descargar. La usan
// la tarjeta propia y la de un amigo conectado.
export async function showRoundImage({ round, model, showName }) {
  if (!model.rows.length || !model.rows.some(r => r.total.played)) { showToast('No hay hoyos para mostrar'); return; }

  showToast('Armando la imagen…');
  try {
    const canvas = await renderShareCanvas(model, { showName });
    const blob = await new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('sin imagen'))), 'image/png'));
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);
    const who = model.mode === 'single' ? model.rows[0].name : 'grupo';
    const fileName = `golfie-${String(round.date || '').slice(0, 10)}-${slug(round.course_name) || 'ronda'}-${slug(who) || 'tarjeta'}.png`;
    lastFile = new File([blob], fileName, { type: 'image/png' });
    lastTitle = `${round.course_name || 'Golfie'} · ${who}`;
  } catch (e) {
    console.warn('No se pudo armar la imagen:', e);
    showToast('No se pudo armar la imagen');
    return;
  }

  showModal({
    title: 'Tu imagen',
    html: `<img src="${lastUrl}" alt="Tarjeta de la ronda" style="display:block;width:100%;max-height:48vh;object-fit:contain;border-radius:12px;border:1px solid var(--border);margin-bottom:14px;">
      <button type="button" class="cta-btn" style="padding:14px;font-size:20px;" onclick="sharePreviewImage()">COMPARTIR / GUARDAR</button>
      <button type="button" class="secondary-btn" onclick="downloadPreviewImage()">Descargar archivo</button>
      <div style="margin-top:10px;font-size:12px;">En el menú de compartir elegí “Guardar imagen” para dejarla en tus fotos, o mandala directo por WhatsApp.</div>`,
    confirmText: 'LISTO',
    safe: true,
    onConfirm: () => {},
  });
}

export async function sharePreviewImage() {
  if (!lastFile) return;
  if (navigator.canShare && navigator.canShare({ files: [lastFile] })) {
    try {
      await navigator.share({ files: [lastFile], title: lastTitle });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return;   // cerró el menú, no es un error
    }
  }
  downloadPreviewImage();
}

export function downloadPreviewImage() {
  if (!lastUrl || !lastFile) return;
  const a = document.createElement('a');
  a.href = lastUrl;
  a.download = lastFile.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
