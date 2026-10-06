// Trends: stat tiles with a sparkline for the City panel. Each tile shows the value now, the change
// since the oldest sample, and a small line chart with a hover/tap readout and a table view.
// Charts follow one rule set: one 2px line per tile, the current value marked, text in ink colours.

import { formatClock } from './time.js';

export const TREND_SERIES = [
  { id: 'pop', label: 'Population', unit: '', upIsGood: true },
  { id: 'happy', label: 'Happiness', unit: '%', upIsGood: true },
  { id: 'employ', label: 'Employment', unit: '%', upIsGood: true },
  { id: 'traffic', label: 'Busiest road', unit: '%', upIsGood: false },
];

const W = 120;
const H = 34;
const PAD = 4;

const fmt = (v, unit) => `${Math.round(v).toLocaleString()}${unit}`;
export const timeLabel = (t) => `Day ${Math.floor(t)}, ${formatClock(t - Math.floor(t))}`;

function points(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const n = values.length;
  return values.map((v, i) => ({
    x: n === 1 ? W / 2 : PAD + (i / (n - 1)) * (W - PAD * 2),
    y: max === min ? H / 2 : H - PAD - ((v - min) / span) * (H - PAD * 2),
  }));
}

export function trendsHTML(trends) {
  const n = trends?.t?.length || 0;
  if (n < 2) return '<p class="insp-note">Trends appear after a few in-game hours.</p>';
  const tiles = TREND_SERIES.map((s) => {
    const values = trends[s.id];
    const now = values[values.length - 1];
    const delta = now - values[0];
    const good = delta === 0 ? null : (delta > 0) === s.upIsGood;
    const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '';
    const pts = points(values);
    const last = pts[pts.length - 1];
    const path = pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    return (
      `<div class="trend" data-series="${s.id}">` +
      `<span class="trend-label">${s.label}</span>` +
      `<span class="trend-value">${fmt(now, s.unit)}</span>` +
      `<span class="trend-delta ${good == null ? '' : good ? 'good' : 'bad'}">${arrow ? `${arrow} ` : ''}${delta === 0 ? 'No change' : fmt(Math.abs(delta), s.unit)}<small> since Day ${Math.floor(trends.t[0])}</small></span>` +
      `<svg class="spark" viewBox="0 0 ${W} ${H}" tabindex="0" role="img" aria-label="${s.label} over the last ${n} samples, from ${fmt(values[0], s.unit)} to ${fmt(now, s.unit)}">` +
      `<path class="spark-line" d="${path}"/>` +
      `<line class="spark-hair" x1="0" x2="0" y1="0" y2="${H}" visibility="hidden"/>` +
      `<circle class="spark-dot now" cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="4"/>` +
      `<circle class="spark-dot hover" r="4" visibility="hidden"/>` +
      `</svg><span class="spark-tip" hidden></span></div>`
    );
  }).join('');
  const rows = trends.t
    .map((t, i) => ({ t, i }))
    .slice(-8)
    .reverse()
    .map(({ t, i }) => `<tr><th scope="row">${timeLabel(t)}</th>${TREND_SERIES.map((s) => `<td>${fmt(trends[s.id][i], s.unit)}</td>`).join('')}</tr>`)
    .join('');
  return (
    `<div class="trend-grid">${tiles}</div>` +
    `<details class="trend-table"><summary>Show as a table</summary><table><thead><tr><th scope="col">Time</th>${TREND_SERIES.map((s) => `<th scope="col">${s.label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></details>`
  );
}

// Hover, tap and arrow keys move a crosshair along a sparkline and show that sample.
export function bindTrendHover(root, getTrends) {
  const show = (svg, index) => {
    const tile = svg.closest('.trend');
    const trends = getTrends();
    const s = TREND_SERIES.find((x) => x.id === tile.dataset.series);
    const values = trends?.[s.id];
    if (!values?.length) return;
    const i = Math.max(0, Math.min(values.length - 1, index));
    svg.dataset.index = i;
    const p = points(values)[i];
    const hair = svg.querySelector('.spark-hair');
    const dot = svg.querySelector('.spark-dot.hover');
    hair.setAttribute('x1', p.x);
    hair.setAttribute('x2', p.x);
    hair.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', p.x);
    dot.setAttribute('cy', p.y);
    dot.setAttribute('visibility', 'visible');
    const tip = tile.querySelector('.spark-tip');
    tip.textContent = '';
    const b = document.createElement('b');
    b.textContent = fmt(values[i], s.unit);
    tip.append(b, document.createTextNode(` ${timeLabel(trends.t[i])}`));
    tip.hidden = false;
  };
  const hide = (svg) => {
    svg.querySelector('.spark-hair')?.setAttribute('visibility', 'hidden');
    svg.querySelector('.spark-dot.hover')?.setAttribute('visibility', 'hidden');
    const tip = svg.closest('.trend')?.querySelector('.spark-tip');
    if (tip) tip.hidden = true;
  };
  const indexAt = (svg, clientX) => {
    const r = svg.getBoundingClientRect();
    const n = getTrends()?.t?.length || 1;
    const x = ((clientX - r.left) / r.width) * W;
    return Math.round(((x - PAD) / (W - PAD * 2)) * (n - 1));
  };
  root.addEventListener('pointermove', (e) => {
    const svg = e.target.closest?.('.spark');
    if (svg) show(svg, indexAt(svg, e.clientX));
  });
  root.addEventListener('pointerdown', (e) => {
    const svg = e.target.closest?.('.spark');
    if (svg) show(svg, indexAt(svg, e.clientX));
  });
  root.addEventListener('pointerout', (e) => {
    const svg = e.target.closest?.('.spark');
    if (svg && !svg.contains(e.relatedTarget)) hide(svg);
  });
  root.addEventListener('focusin', (e) => {
    if (e.target.classList?.contains('spark')) show(e.target, (getTrends()?.t?.length || 1) - 1);
  });
  root.addEventListener('focusout', (e) => {
    if (e.target.classList?.contains('spark')) hide(e.target);
  });
  root.addEventListener('keydown', (e) => {
    const svg = e.target;
    if (!svg.classList?.contains('spark') || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    e.preventDefault();
    show(svg, Number(svg.dataset.index ?? 0) + (e.key === 'ArrowRight' ? 1 : -1));
  });
}
