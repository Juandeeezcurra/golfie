import { app } from '../context.js';
import { state } from '../state.js';
import { formatDate, teeColor, jsStr } from '../util.js';
import { formatDiff } from '../core/stats.js';
import {
  completedRounds, scoreTrend, scoringDistribution, byParType,
  byCourse, handicapIndexNow, scoringForm, shortGame, playAverages,
} from '../core/insights.js';
import { sparkline, stackedBar, meter } from './charts.js';
import { showModal } from './modal.js';
import { showToast } from './toast.js';

export function roundCardHTML(r, deletable = false) {
  // A partial round may already have an accumulated total. `completed` is
  // the authoritative status; old imported rounds without that field keep
  // the historical score-based fallback.
  const hasTotal = r.total_score !== null && r.total_score !== undefined && r.total_score !== '';
  const isInProgress = !hasTotal || r.completed === false;
  const diff = r.total_score - r.par_total;
  const diffStr = diff > 0 ? '+' + diff : diff < 0 ? String(diff) : 'E';
  const teeBall = r.tees
    ? `<span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${teeColor(r.tees)};border:1px solid rgba(255,255,255,0.2);margin-right:5px;flex-shrink:0;"></span>`
    : '';
  return `<div class="round-card" onclick="viewRound('${jsStr(r.round_id)}')">
    <div class="round-card-left">
      <div class="course">${r.course_name || '—'}${r.format === 'scramble' ? '<span style="margin-left:7px;font-size:9px;letter-spacing:1px;color:var(--green);">SCRAMBLE</span>' : ''}</div>
      <div class="date" style="display:flex;align-items:center;">${teeBall}${formatDate(r.date)}</div>
    </div>
    <div class="round-card-right" style="display:flex;align-items:center;gap:12px;">
      ${isInProgress
        ? `<span style="font-size:11px;color:var(--muted);letter-spacing:1px;text-transform:uppercase;">En curso</span>`
        : `<div style="display:flex;align-items:baseline;gap:5px;"><div class="score-big">${r.total_score}</div><div class="score-label">${diffStr}</div></div>`
      }
      ${deletable ? `<button class="delete-round-btn" onclick="event.stopPropagation();deleteRound('${jsStr(r.round_id)}')" title="Borrar">✕</button>` : ''}
    </div>
  </div>`;
}

export function getAllClubStats() {
  const rounds = app.store.loadRounds().filter(r => r.completed);
  const totals = {};
  rounds.forEach(r => {
    const cf = app.store.loadClubs(r.round_id);
    Object.entries(cf).forEach(([club, fb]) => {
      if (!totals[club]) totals[club] = { verde: 0, amarillo: 0, rojo: 0 };
      if (fb.rating) totals[club][fb.rating]++;
    });
  });
  return totals;
}

// Todos los hoyos de las rondas terminadas, en una sola lista.
function allHoles(rounds) {
  return rounds.flatMap(r => Object.values(app.store.loadHoles(r.round_id)));
}

// ---------- BLOQUES ----------

function heroHtml(hcp, form) {
  if (hcp.current === null) {
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
        ${form.delta < 0 ? '▼' : form.delta > 0 ? '▲' : '='} ${Math.abs(form.delta).toFixed(1)} golpes
       </span>`;
  return `<div class="hero-card">
    <div class="hero-label">Handicap index</div>
    <div class="hero-row">
      <div class="hero-val">${hcp.current.toFixed(1)}</div>
      ${chip}
    </div>
    <div class="hero-sub">${hcp.rounds} rondas terminadas${
      form.delta === null ? ''
        : ` · últimas ${form.recentN} promedian ${formatDiff(Math.round(form.recent))} vs ${formatDiff(Math.round(form.previous))} antes`
    }</div>
  </div>`;
}

function trendHtml(trend) {
  if (trend.length < 2) return '';
  const best = trend.reduce((a, b) => (b.diff < a.diff ? b : a));
  const last = trend[trend.length - 1];
  return `<div class="section-title" style="margin-top:24px;">Tendencia</div>
    <div class="panel">
      ${sparkline(trend)}
      <div class="trend-foot">
        <span>Mejor: <b>${best.score}</b> ${formatDiff(best.diff)} · ${best.course}</span>
        <span>Última: <b>${last.score}</b> ${formatDiff(last.diff)}</span>
      </div>
    </div>`;
}

function gameHtml(avg) {
  if (!avg) return '';
  const row = (label, value, pct, color) => `
    <div class="metric">
      <div class="metric-head"><span>${label}</span><b>${value}</b></div>
      ${pct === null ? '' : meter(pct, { color })}
    </div>`;
  return `<div class="section-title" style="margin-top:24px;">Tu juego</div>
    <div class="panel">
      ${row('Fairways', avg.fairwayPct === null ? '—' : avg.fairwayPct + '%', avg.fairwayPct, 'var(--green)')}
      ${row('Greens en regulación', avg.girPct + '%', avg.girPct, 'var(--yellow)')}
      ${row('Putts por hoyo', avg.putts === null ? '—' : avg.putts.toFixed(2), avg.putts === null ? null : Math.max(0, (3 - avg.putts) / 1.5 * 100), '#60a5fa')}
      <div class="panel-foot">Sobre ${avg.holes} hoyos jugados</div>
    </div>`;
}

function scoringHtml(dist) {
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
  return `<div class="section-title" style="margin-top:24px;">Cómo anotás</div>
    <div class="panel">
      ${stackedBar(segs)}
      <div class="legend">${legend}</div>
      <div class="panel-foot">${dist.total} hoyos · ${pct(dist.par + dist.birdie + dist.eagle)}% par o mejor</div>
    </div>`;
}

function parTypeHtml(rows) {
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
    <div class="panel-foot" style="padding:0 2px;">Donde más golpes perdés: <b>par ${worst.par}</b></div>`;
}

function coursesHtml(rows) {
  if (!rows.length) return '';
  const peor = Math.max(...rows.map(r => r.avgDiff));
  return `<div class="section-title" style="margin-top:24px;">Por cancha</div>
    <div class="panel">
      ${rows.map(r => `
        <div class="course-row">
          <div class="course-row-main">
            <div class="course-row-name">${r.course}</div>
            <div class="course-row-sub">${r.played} ${r.played === 1 ? 'ronda' : 'rondas'} · mejor ${r.best} (${formatDiff(r.bestDiff)})</div>
          </div>
          <div class="course-row-bar">${meter(peor ? (r.avgDiff / peor) * 100 : 0, { color: 'var(--green-dim)' })}</div>
          <div class="course-row-val">${formatDiff(Math.round(r.avgDiff))}</div>
        </div>`).join('')}
      <div class="panel-foot">Promedio contra el par de cada cancha</div>
    </div>`;
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
        <div class="stat-val">${sg.sandSaves}</div>
        <div class="stat-lbl">Sand saves</div>
      </div>
      <div class="stat-card">
        <div class="stat-val${sg.penalties ? '' : ' green'}">${sg.penalties}</div>
        <div class="stat-lbl">Penales</div>
        <div class="stat-note">${(sg.penalties / sg.holes * 18).toFixed(1)} por vuelta</div>
      </div>
    </div>`;
}

// Bloque de estadísticas reutilizable: lo usa el home (con tus rondas) y la
// ficha de cada amigo (con las rondas donde participó). `rounds` y `holes`
// tienen que venir con la forma estándar (ver core/insights.js).
export function renderInsightsSections(rounds, holes) {
  if (!rounds.length) return '';
  return [
    heroHtml(handicapIndexNow(rounds), scoringForm(rounds)),
    trendHtml(scoreTrend(rounds)),
    gameHtml(playAverages(holes)),
    scoringHtml(scoringDistribution(holes)),
    parTypeHtml(byParType(holes)),
    coursesHtml(byCourse(rounds)),
    shortGameHtml(shortGame(holes)),
  ].join('');
}

function clubsHtml() {
  const clubStats = getAllClubStats();
  const byGreen = Object.entries(clubStats).sort((a, b) => b[1].verde - a[1].verde);
  const byRed = Object.entries(clubStats).sort((a, b) => b[1].rojo - a[1].rojo);
  const topClub = byGreen[0]?.[1].verde > 0 ? byGreen[0] : null;
  const badClub = byRed[0]?.[1].rojo > 0 ? byRed[0] : null;
  if (!topClub && !badClub) return '';
  return `<div class="section-title" style="margin-top:24px;">Palos</div>
    <div class="row-2">
      ${topClub ? `<div class="stat-card"><div class="stat-tag green">Mejor</div><div class="stat-name">${topClub[0]}</div><div class="stat-note">${topClub[1].verde} rondas en verde</div></div>` : ''}
      ${badClub ? `<div class="stat-card"><div class="stat-tag red">A trabajar</div><div class="stat-name">${badClub[0]}</div><div class="stat-note">${badClub[1].rojo} rondas en rojo</div></div>` : ''}
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
    statsEl.innerHTML = renderInsightsSections(rounds, allHoles(done)) + clubsHtml();
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
      </div>`,
    confirmText: 'CERRAR',
    safe: true,
    onConfirm: () => {},
  });
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
