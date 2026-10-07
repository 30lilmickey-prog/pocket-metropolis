// Budget section of the City panel: the balance, what comes in and goes out each day by kind of
// building, the buildings that earn the most, and the last few days. Read-only HTML builders.

import { STRUCTURES } from './config.js';
import { CATEGORY_LABELS, money } from './economy.js';
import { addressOf } from './streets.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

function bars(entries, kind, max) {
  if (!entries.length) return `<p class="insp-note">${kind === 'in' ? 'No taxes yet: build homes and workplaces.' : 'No upkeep yet.'}</p>`;
  return `<ul class="budget-bars ${kind}">${entries
    .map(
      ([cat, v]) =>
        `<li><span class="bl">${esc(CATEGORY_LABELS[cat] || cat)}</span><span class="bb"><span style="width:${Math.max(3, (v / max) * 100).toFixed(0)}%"></span></span><b>${money(v)}</b></li>`
    )
    .join('')}</ul>`;
}

// A key that only changes when the visible numbers do (to the dollar), so buttons stay put.
export function budgetKey(econ, state, sandbox) {
  if (!econ) return 'none';
  return JSON.stringify([
    Math.round(state.money),
    Math.round(econ.net),
    sandbox,
    econ.top.map((t) => [t.x, t.y, Math.round(t.earning)]),
    state.days.length,
  ]);
}

export function budgetHTML(econ, state, sandbox) {
  if (!econ) return '<p class="insp-note">The budget appears in a moment.</p>';
  const inc = Object.entries(econ.income).sort((a, b) => b[1] - a[1]);
  const out = Object.entries(econ.expenses).sort((a, b) => b[1] - a[1]);
  const max = Math.max(1, ...inc.map((e) => e[1]), ...out.map((e) => e[1]));
  const net = econ.net;
  const top = econ.top
    .map(
      (t, i) =>
        `<li><span class="rank">${i + 1}</span><span class="who"><b>${esc(STRUCTURES[t.structure.type].label)}</b><small>${esc(addressOf(t))}</small></span>` +
        `<span class="earn">+${money(t.earning)}<small>/day</small></span><button type="button" class="ghost-btn small" data-showtile="${t.x},${t.y}">Show me</button></li>`
    )
    .join('');
  const days = state.days
    .slice(-5)
    .reverse()
    .map((d) => {
      const n = d.income - d.expenses;
      return `<tr><th scope="row">Day ${d.day}</th><td>${money(d.income)}</td><td>${money(d.expenses)}</td><td>${money(d.built)}</td><td class="${n >= 0 ? 'up' : 'down'}">${n >= 0 ? '+' : '−'}${money(Math.abs(n))}</td></tr>`;
    })
    .join('');
  return (
    `<div class="budget-head"><div><span class="insp-kicker">Balance</span><strong>${money(state.money)}</strong></div>` +
    `<div class="budget-net ${net >= 0 ? 'up' : 'down'}"><span>${net >= 0 ? '▲' : '▼'} ${money(Math.abs(net))}</span><small>per day</small></div></div>` +
    (sandbox ? '<p class="insp-note">Sandbox: building is free, but taxes and upkeep still show what the town would earn.</p>' : '') +
    (!sandbox && state.money <= 0 && net < 0 ? '<p class="budget-warn">The town is out of money. Upkeep is unpaid until taxes come in.</p>' : '') +
    `<div class="budget-cols"><div><span class="sheet-label">Coming in · ${money(econ.totalIn)}/day</span>${bars(inc, 'in', max)}</div>` +
    `<div><span class="sheet-label">Going out · ${money(econ.totalOut)}/day</span>${bars(out, 'out', max)}</div></div>` +
    (top ? `<span class="sheet-label">Top earners</span><ol class="earners">${top}</ol>` : '') +
    (days
      ? `<details class="trend-table"><summary>Last few days</summary><table><thead><tr><th scope="col">Day</th><th scope="col">Taxes</th><th scope="col">Upkeep</th><th scope="col">Built</th><th scope="col">Net</th></tr></thead><tbody>${days}</tbody></table></details>`
      : '')
  );
}
