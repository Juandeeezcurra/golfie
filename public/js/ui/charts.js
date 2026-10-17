// ============================================================
// GOLFIE — GRÁFICOS
// ============================================================
// SVG inline hecho a mano: no vale la pena una librería de charts para esto,
// y cada KB cuenta en una app que tiene que abrir sin señal.
// Cada función devuelve un string de HTML.
// ============================================================

import { attrText } from '../util.js';

// Línea de tendencia de scores. En golf menos es mejor, así que el eje Y va
// invertido: cuanto más alto el punto en pantalla, mejor la ronda.
export function sparkline(points, { width = 320, height = 72, pad = 10 } = {}) {
  if (!points || points.length < 2) return '';

  const values = points.map(p => p.diff);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const x = i => pad + (i * (width - pad * 2)) / (points.length - 1);
  const y = v => pad + ((v - min) / span) * (height - pad * 2);   // +diff más abajo = peor

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.diff).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${height} L${x(0).toFixed(1)},${height} Z`;

  const dots = points.map((p, i) => {
    const best = p.diff === min;
    return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.diff).toFixed(1)}" r="${best ? 4 : 2.5}"
      fill="${best ? 'var(--green)' : 'var(--surface)'}" stroke="var(--green)" stroke-width="1.5">
      <title>${attrText(p.course)} · ${p.score} (${p.diff > 0 ? '+' + p.diff : p.diff})</title>
    </circle>`;
  }).join('');

  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Tendencia de scores">
    <defs>
      <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="var(--green)" stop-opacity="0.22"/>
        <stop offset="100%" stop-color="var(--green)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <path d="${area}" fill="url(#spark-fill)"/>
    <path d="${line}" fill="none" stroke="var(--green)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
    ${dots}
  </svg>`;
}

// Barra apilada: cómo se reparten los resultados de todos tus hoyos.
export function stackedBar(segments) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (!total) return '';
  const parts = segments
    .filter(s => s.value > 0)
    .map(s => `<div class="stack-seg" style="flex:${s.value};background:${s.color};" title="${attrText(s.label)}: ${s.value}"></div>`)
    .join('');
  return `<div class="stack-bar">${parts}</div>`;
}

// Medidor horizontal con porcentaje (fairways, GIR, …).
export function meter(pct, { color = 'var(--green)' } = {}) {
  const safe = Math.max(0, Math.min(100, Number(pct) || 0));
  return `<div class="meter"><div class="meter-fill" style="width:${safe}%;background:${color};"></div></div>`;
}
