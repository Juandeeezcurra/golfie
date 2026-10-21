import { app } from '../context.js';
import { state } from '../state.js';
import { formatDate, teeColor, jsStr, attrText } from '../util.js';
import { formatDiff } from '../core/stats.js';
import {
  completedRounds, scoreTrend, scoringDistribution, byParType,
  byCourse, byCourseNine, handicapIndexNow, provisionalHandicapIndex, scoringForm, shortGame, playAverages,
} from '../core/insights.js';
import { sparkline, stackedBar, meter } from './charts.js';
import { showModal } from './modal.js';
import { showToast } from './toast.js';

export function roundCardHTML(r) {
  // A partial round may already have an accumulated total. `completed` is
  // the authoritative status; old imported rounds without that field keep
  // the historical score-based fallback.
  const hasTotal = r.total_score !== null && r.total_score !== undefined && r.total_score !== '';
  const isInProgress = !hasTotal || r.completed === false;
  const diff = r.total_score - r.par_total;
  const diffStr = diff > 0 ? '+' + diff : diff < 0 ? String(diff) : 'E';
  // Hoyos realmente jugados: los guardados; si no hay (ronda importada), el
  // total de la cancha.
  const played = Object.keys(app.store.loadHoles(r.round_id)).length || Number(r.course_holes_count) || 0;
  const teeBall = r.tees
    ? `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${teeColor(r.tees)};border:1px solid rgba(255,255,255,0.2);margin-right:5px;flex-shrink:0;"></span>`
    : '';
  return `<div class="round-card" onclick="viewRound('${jsStr(r.round_id)}')">
    <div class="round-card-left">
      <div class="course">${r.course_name || '—'}${r.format === 'scramble' ? '<span style="margin-left:7px;font-size:9px;letter-spacing:1px;color:var(--green);">SCRAMBLE</span>' : ''}</div>
      <div class="date" style="display:flex;align-items:center;">${teeBall}${formatDate(r.date)}${played ? ` · ${played} ${played === 1 ? 'hoyo' : 'hoyos'}` : ''}</div>
    </div>
    <div class="round-card-right">
      ${isInProgress
        ? `<span style="font-size:11px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;">En curso</span>`
        : `<div class="score-cell"><div class="score-big">${r.total_score}</div><div class="score-label">${diffStr}</div></div>`
      }
    </div>
  </div>`;
}

const RATINGS = ['verde', 'amarillo', 'rojo'];

export function getAllClubStats() {
  const rounds = app.store.loadRounds().filter(r => r.completed);
  const totals = {};
  rounds.forEach(r => {
    const cf = app.store.loadClubs(r.round_id);
    Object.entries(cf).forEach(([club, fb]) => {
      if (!totals[club]) totals[club] = { verde: 0, amarillo: 0, rojo: 0, tags: {} };
      if (RATINGS.includes(fb.rating)) totals[club][fb.rating]++;
      const tags = Array.isArray(fb.tags) ? fb.tags : String(fb.tags || '').split(',').filter(Boolean);
      tags.forEach(t => { totals[club].tags[t] = (totals[club].tags[t] || 0) + 1; });
    });
  });
  return totals;
}

// Todos los hoyos de las rondas terminadas, en una sola lista.
function allHoles(rounds) {
  return rounds.flatMap(r => Object.values(app.store.loadHoles(r.round_id)));
}

// ---------- BLOQUES ----------

function heroHtml(hcp, form, estimate) {
  if (hcp.current === null) {
    // Sin las 3 rondas del cálculo oficial: si hay estimación (amigos) se
    // muestra igual, marcada con una advertencia.
    if (estimate && estimate.value !== null) {
      const warn = estimate.rounds === 1 ? 'Solo 1 ronda jugada' : `Estimado con ${estimate.rounds} rondas`;
      return `<div class="hero-card">
        <div class="hero-label">Handicap index</div>
        <div class="hero-row"><div class="hero-val">~${estimate.value.toFixed(1)}</div></div>
        <div class="hero-sub">⚠️ ${warn}${estimate.approx ? ' · la cancha no tiene rating, se usó el par' : ''}</div>
      </div>`;
    }
    return `<div class="hero-card">
      <div class="hero-label">Handicap index</div>
      <div class="hero-val">—</div>
      <div class="hero-sub">Necesitás 3 rondas terminadas (llevás ${hcp.rounds})</div>
    </div>`;
  }
  // La forma se mide por promedio contra el par, no por el índice: en golf
  // bajar es mejor, así que una baja va en verde.
  const chip = form.delta === null ? ''
    : `<span class="chip ${form.delta < 0 ? 'chip-good' : form.delta > 0 ? 'chip-bad' : ''}">
        ${form.delta < 0 ? '▼' : form.delta > 0 ? '▲' : '='} ${Math.abs(form.delta).toFixed(1)} · últimas ${form.recentN}
       </span>`;
  return `<div class="hero-card">
    <div class="hero-label">Handicap index</div>
    <div class="hero-row">
      <div class="hero-val">${hcp.current.toFixed(1)}</div>
      ${chip}
    </div>
    <div class="hero-sub">En ${hcp.rounds} ${hcp.rounds === 1 ? 'ronda' : 'rondas'}</div>
  </div>`;
}

function trendHtml(trend) {
  if (trend.length < 2) return '';
  const last = trend[trend.length - 1];
  const adjusted = trend.some(p => p.holes !== 18);
  return `<div class="section-title" style="margin-top:24px;">Tendencia</div>
    <div class="panel">
      ${sparkline(trend)}
      <div class="trend-foot">
        <span>${last.holes === 18
          ? `Última: <b>${last.score}</b> ${formatDiff(last.diff)} · ${attrText(last.course)}`
          : `Última: <b>${last.score}</b> en ${last.holes} hoyos (≈ ${formatDiff(last.diff)} a 18) · ${attrText(last.course)}`}</span>
      </div>
      <div class="panel-foot">Normalizado a 18 hoyos${adjusted ? ': las rondas más cortas se llevan a esa escala' : ''}</div>
    </div>`;
}

function gameHtml(avg, third) {
  if (!avg) return '';
  const row = (label, value, pct, color) => `
    <div class="metric">
      <div class="metric-head"><span>${label}</span><b>${value}</b></div>
      ${pct === null ? '' : meter(pct, { color })}
    </div>`;
  return `<div class="section-title" style="margin-top:24px;">${third ? 'Su juego' : 'Tu juego'}</div>
    <div class="panel">
      ${row('Fairways', avg.fairwayPct === null ? '—' : avg.fairwayPct + '%', avg.fairwayPct, 'var(--green)')}
      ${row('Greens en regulación', avg.girPct === null ? '—' : avg.girPct + '%', avg.girPct, 'var(--yellow)')}
      ${row('Putts por hoyo', avg.putts === null ? '—' : avg.putts.toFixed(2), avg.putts === null ? null : Math.max(0, (3 - avg.putts) / 1.5 * 100), '#60a5fa')}
      <div class="panel-foot">Sobre ${avg.holes} hoyos jugados</div>
    </div>`;
}

function scoringHtml(dist, third) {
  if (!dist.total) return '';
  const segs = [
    { label: 'Eagles', value: dist.eagle, color: '#ffd700' },
    { label: 'Birdies', value: dist.birdie, color: 'var(--green)' },
    { label: 'Pares', value: dist.par, color: '#3f8f5f' },
    { label: 'Bogeys', value: dist.bogey, color: 'var(--yellow)' },
    { label: 'Dobles', value: dist.double, color: 'var(--red)' },
    { label: 'Triples+', value: dist.triple, color: '#8b0000' },
  ];
  const pct = n => Math.round(n / dist.total * 100);
  const legend = segs.filter(s => s.value > 0).map(s =>
    `<span class="legend-item"><i style="background:${s.color}"></i>${s.label} <b>${s.value}</b> <em>${pct(s.value)}%</em></span>`
  ).join('');
  return `<div class="section-title" style="margin-top:24px;">${third ? 'Cómo anota' : 'Cómo anotás'}</div>
    <div class="panel">
      ${stackedBar(segs)}
      <div class="legend">${legend}</div>
      <div class="panel-foot">${dist.total} hoyos · ${pct(dist.par + dist.birdie + dist.eagle)}% par o mejor</div>
    </div>`;
}

function parTypeHtml(rows, third) {
  if (!rows.length) return '';
  const worst = rows.reduce((a, b) => (b.vsPar > a.vsPar ? b : a));
  return `<div class="section-title" style="margin-top:24px;">Por tipo de hoyo</div>
    <div class="partype-grid">
      ${rows.map(r => `
        <div class="stat-card ${r === worst ? 'stat-card-warn' : ''}">
          <div class="stat-val">${r.avg.toFixed(1)}</div>
          <div class="stat-lbl">Par ${r.par} · ${r.vsPar > 0 ? '+' : ''}${r.vsPar.toFixed(1)}</div>
          <div class="stat-note">${r.holes} hoyos</div>
        </div>`).join('')}
    </div>
    <div class="panel-foot" style="padding:0 2px;">${third ? 'Donde más golpes pierde' : 'Donde más golpes perdés'}: <b>par ${worst.par}</b></div>`;
}

// "Por cancha" se puede mirar de cuatro formas: rondas de 18, rondas de 9, y
// la mejor ida / mejor vuelta de las rondas de 18. Cada bloque (home, ficha de
// amigo) guarda su contexto para poder redibujarse al cambiar de modo.
const COURSE_MODES = [['18', '10-18'], ['9', '1-9'], ['front', 'Ida'], ['back', 'Vuelta']];
const courseCtx = {};
let courseMode = null;

function courseRowsFor(mode, ctx) {
  if (mode === '18') return byCourse(ctx.rounds, 18);
  if (mode === '9') return byCourse(ctx.rounds, 9);
  return byCourseNine(ctx.rounds, mode, ctx.holesOf);
}

function coursesHtml(scope) {
  const ctx = courseCtx[scope];
  const has18 = byCourse(ctx.rounds, 18).length > 0;
  const has9 = byCourse(ctx.rounds, 9).length > 0;
  if (!has18 && !has9) return '';
  const mode = courseMode || (has18 ? '18' : '9');
  const rows = courseRowsFor(mode, ctx);
  const half = mode === 'front' || mode === 'back';
  const peor = rows.length ? Math.max(...rows.map(r => (half ? r.bestDiff : r.avgDiff))) : 0;
  const foot = half
    ? `Tu mejor ${mode === 'front' ? 'ida (hoyos 1-9)' : 'vuelta (hoyos 10-18)'} en cada cancha, contra el par`
    : `Promedio contra el par · rondas de ${mode === '18' ? '10 a 18' : '1 a 9'} hoyos`;
  return `<div id="courses-${scope}">
    <div class="section-title" style="margin-top:24px;">Por cancha</div>
    <div class="holes-count-toggle">
      ${COURSE_MODES.map(([key, label]) => `<button type="button" class="holes-count-btn ${key === mode ? 'active' : ''}" onclick="setCourseMode('${scope}','${key}')">${label}</button>`).join('')}
    </div>
    <div class="panel">
      ${rows.length ? rows.map(r => {
        const val = half ? r.bestDiff : r.avgDiff;
        const sub = half
          ? `mejor ${r.best} · prom. ${formatDiff(Math.round(r.avgDiff))} · ${r.played} ${r.played === 1 ? 'ronda' : 'rondas'}`
          : `${r.played} ${r.played === 1 ? 'ronda' : 'rondas'} · mejor ${r.best} (${formatDiff(r.bestDiff)})`;
        return `<div class="course-row">
          <div class="course-row-main">
            <div class="course-row-name">${attrText(r.course)}</div>
            <div class="course-row-sub">${sub}</div>
          </div>
          <div class="course-row-bar">${meter(peor > 0 ? (val / peor) * 100 : 0, { color: 'var(--green-dim)' })}</div>
          <div class="course-row-val">${formatDiff(Math.round(val))}</div>
        </div>`;
      }).join('') : `<div class="panel-foot" style="text-align:center;margin:0;">Todavía no hay datos para esta vista.</div>`}
      <div class="panel-foot">${foot}</div>
    </div>
  </div>`;
}

export function setCourseMode(scope, mode) {
  courseMode = mode;
  const el = document.getElementById('courses-' + scope);
  if (el && courseCtx[scope]) el.outerHTML = coursesHtml(scope);
}

function shortGameHtml(sg) {
  if (!sg.holes) return '';
  return `<div class="section-title" style="margin-top:24px;">Juego corto y errores</div>
    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-val green">${sg.scramblingPct === null ? '—' : sg.scramblingPct + '%'}</div>
        <div class="stat-lbl">Scrambling</div>
        <div class="stat-note">${sg.upDowns} salvadas en ${sg.missedGreens} greens errados</div>
      </div>
      <div class="stat-card">
        <div class="stat-val${sg.bunkers ? '' : ' green'}">${sg.bunkers}</div>
        <div class="stat-lbl">Búnkers</div>
        <div class="stat-note">${sg.bunkers ? `${sg.sandSaves} salvados (par o mejor)` : 'Ninguno'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-val${sg.penalties ? '' : ' green'}">${sg.penalties}</div>
        <div class="stat-lbl">Penales</div>
        <div class="stat-note">${(sg.penalties / sg.holes * 18).toFixed(1)} por vuelta</div>
      </div>
      <div class="stat-card">
        <div class="stat-val${sg.threePutts ? '' : ' green'}">${sg.threePutts}</div>
        <div class="stat-lbl">3 putts</div>
        <div class="stat-note">${(sg.threePutts / sg.holes * 18).toFixed(1)} por vuelta</div>
      </div>
    </div>`;
}

// Bloque de estadísticas reutilizable: lo usa el home (con tus rondas) y la
// ficha de cada amigo (con las rondas donde participó). `rounds` y `holes`
// tienen que venir con la forma estándar (ver core/insights.js).
//   scope        identifica el bloque "Por cancha" (home / friend)
//   holesOf      hoyos guardados de una ronda (para mejor ida / vuelta)
//   estimateHcp  muestra un handicap estimado aunque falten rondas (amigos)
//   third        títulos en tercera persona ("Su juego") para las fichas de amigos
export function renderInsightsSections(rounds, holes, { scope = 'home', holesOf = r => r._holes || [], estimateHcp = false, third = false } = {}) {
  if (!rounds.length) return '';
  courseCtx[scope] = { rounds, holesOf };
  return [
    heroHtml(handicapIndexNow(rounds), scoringForm(rounds), estimateHcp ? provisionalHandicapIndex(rounds) : null),
    trendHtml(scoreTrend(rounds)),
    gameHtml(playAverages(holes), third),
    scoringHtml(scoringDistribution(holes), third),
    parTypeHtml(byParType(holes), third),
    coursesHtml(scope),
    shortGameHtml(shortGame(holes)),
  ].join('');
}

function clubsHtml() {
  const stats = getAllClubStats();
  const rows = Object.entries(stats)
    .map(([club, s]) => ({ club, ...s, rated: s.verde + s.amarillo + s.rojo }))
    .filter(r => r.rated > 0);
  if (!rows.length) return '';

  const share = (r, key) => r[key] / r.rated;
  const best = [...rows].sort((a, b) => b.verde - a.verde || share(b, 'verde') - share(a, 'verde'))[0];
  const worst = [...rows].sort((a, b) => b.rojo - a.rojo || share(b, 'rojo') - share(a, 'rojo'))[0];
  const rondas = n => `${n} ${n === 1 ? 'ronda' : 'rondas'}`;
  const topTag = r => Object.entries(r.tags).sort((a, b) => b[1] - a[1])[0]?.[0];
  const tagNote = r => topTag(r) ? `<div class="stat-note">Suele ser: ${attrText(topTag(r))}</div>` : '';

  const ranked = [...rows].sort((a, b) => b.rated - a.rated || a.club.localeCompare(b.club));
  return `<div class="section-title" style="margin-top:24px;">Palos</div>
    <div class="row-2">
      ${best.verde > 0 ? `<div class="stat-card"><div class="stat-tag green">Mejor</div><div class="stat-name">${attrText(best.club)}</div><div class="stat-note">En verde ${best.verde} de ${rondas(best.rated)}</div>${tagNote(best)}</div>` : ''}
      ${worst.rojo > 0 ? `<div class="stat-card"><div class="stat-tag red">A trabajar</div><div class="stat-name">${attrText(worst.club)}</div><div class="stat-note">En rojo ${worst.rojo} de ${rondas(worst.rated)}</div>${tagNote(worst)}</div>` : ''}
    </div>
    <div class="panel" style="margin-top:10px;">
      ${ranked.map(r => `<div class="club-stat-row">
        <span class="club-stat-name">${attrText(r.club)}</span>
        <div class="club-stat-bar">${stackedBar([
          { label: 'Verde', value: r.verde, color: 'var(--green)' },
          { label: 'Amarillo', value: r.amarillo, color: 'var(--yellow)' },
          { label: 'Rojo', value: r.rojo, color: 'var(--red)' },
        ])}</div>
        <span class="club-stat-n">${r.rated}</span>
      </div>`).join('')}
      <div class="panel-foot">Tu semáforo por palo al terminar cada ronda · número = rondas calificadas</div>
    </div>`;
}

// ---------- RENDER ----------

export function renderHome() {
  state.courses = app.store.listCourses();
  const rounds = app.store.loadRounds();
  const done = completedRounds(rounds);
  const statsEl = document.getElementById('home-stats');

  if (!done.length) {
    statsEl.innerHTML = rounds.length
      ? `<div class="panel"><div class="panel-foot" style="text-align:center;">Terminá una ronda para empezar a ver tus números.</div></div>`
      : '';
  } else {
    statsEl.innerHTML = renderInsightsSections(rounds, allHoles(done), {
      scope: 'home',
      holesOf: r => Object.values(app.store.loadHoles(r.round_id)),
    }) + clubsHtml();
  }

  const container = document.getElementById('recent-rounds');
  if (!rounds.length) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">⛳</div>Todavía no jugaste ninguna ronda.<br>Tocá + para empezar.</div>`;
    return;
  }
  container.innerHTML = rounds.slice(0, 3).map(r => roundCardHTML(r)).join('');
}

export function renderUserCode() {
  const el = document.getElementById('user-code');
  if (el) el.textContent = 'CÓDIGO ' + app.store.getUserId();
}

// Ajustes: antes el código y "reparar datos" vivían siempre visibles en el
// home, ocupando espacio aunque casi nunca se usan. Ahora quedan atrás de un
// solo ícono.
export function showSettings() {
  showModal({
    title: 'Ajustes',
    html: `
      <div class="settings-row" onclick="showUserCode()">
        <span>Tu código</span><span class="settings-row-arrow">›</span>
      </div>
      <div class="settings-row" onclick="showRepair()">
        <span>Reparar datos</span><span class="settings-row-arrow">›</span>
      </div>
      <div id="app-version" class="settings-version"></div>`,
    confirmText: 'CERRAR',
    safe: true,
    onConfirm: () => {},
  });
  // La versión sale del caché del service worker: sirve para confirmar que el
  // teléfono ya tiene la última.
  if (window.caches) {
    caches.keys().then(keys => {
      const v = keys.find(k => k.startsWith('golfie-'));
      const el = document.getElementById('app-version');
      if (el && v) el.textContent = 'Versión ' + v.replace('golfie-', '');
    }).catch(() => {});
  }
}

export function showUserCode() {
  const uid = app.store.getUserId();
  showModal({
    title: 'Tu código',
    html: '<div style="margin-bottom:12px;">Tus rondas se guardan bajo este código. Sólo vos las ves, y no te aparecen las de nadie más.</div>'
      + '<div style="font-family:monospace;font-size:17px;letter-spacing:1px;padding:10px;background:rgba(255,255,255,.06);border-radius:8px;text-align:center;margin-bottom:16px;">' + uid + '</div>'
      + '<div style="margin-bottom:8px;">Para ver estas mismas rondas en otro dispositivo, escribí ahí este código:</div>'
      + '<input id="link-code-input" placeholder="u-xxxxxxxxxx" autocapitalize="off" autocorrect="off" spellcheck="false" style="width:100%;box-sizing:border-box;padding:10px;border-radius:8px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.3);color:inherit;font-family:monospace;font-size:15px;">',
    confirmText: 'VINCULAR',
    safe: true,
    onConfirm: () => {
      const input = document.getElementById('link-code-input');
      const val = input ? input.value : '';
      if (!val.trim()) return;              // sólo vino a mirar el código
      if (!app.store.setUserId(val)) { showToast('Código inválido'); return; }
      showToast('Vinculado, recargando...');
      setTimeout(() => location.reload(), 800);
    },
  });
}
