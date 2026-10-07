// Notable people section of the City panel: who lives here (with their bonus and a Show me), and
// who is likely to arrive next, with what inspires them.

import { notableType, fullName } from './notables.js';
import { addressOf } from './streets.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function notableBadge(type, size = 28) {
  return `<span class="nb" style="--nb:${type.color};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.5)}px" aria-hidden="true">${type.icon}</span>`;
}

const when = (days) => (days === Infinity ? null : days < 0.5 ? 'any moment now' : days < 1.5 ? 'in about a day' : `in about ${Math.round(days)} days`);

export function notablesKey(notables) {
  const prog = notables.progress().slice(0, 3);
  return JSON.stringify([notables.people.map((p) => [p.id, p.home?.x, p.home?.y]), prog.map((p) => [p.type.id, Math.round(p.fraction * 20), Math.round(p.days)])]);
}

export function notablesHTML(city, notables) {
  const people = notables.people
    .slice()
    .reverse()
    .map((p) => {
      const t = notableType(p.type);
      const home = p.home && city.getTile(p.home.x, p.home.y);
      return (
        `<li>${notableBadge(t)}<span class="np-text"><b>${esc(fullName(p))}</b><small>${esc(t.title)} · ${p.born ? 'born here' : 'moved here'} on day ${p.day}${home ? ` · ${esc(addressOf(home))}` : ''}</small><span class="np-bonus">${esc(t.bonus)}</span></span>` +
        (p.home ? `<button type="button" class="ghost-btn small" data-showtile="${p.home.x},${p.home.y}">Show me</button>` : '') +
        '</li>'
      );
    })
    .join('');
  const next = notables
    .progress()
    .slice(0, 3)
    .map((p) => {
      const eta = when(p.days);
      return (
        `<li>${notableBadge(p.type, 22)}<span class="np-text"><b>${esc(p.type.title)}</b><small>${eta ? `Likely ${eta}` : esc(p.type.attract)}</small>` +
        `<span class="np-bar" role="img" aria-label="${Math.round(p.fraction * 100)}% of the way"><span style="width:${(p.fraction * 100).toFixed(0)}%;background:${p.type.color}"></span></span>` +
        (eta ? `<small>${esc(p.type.attract)}</small>` : '') +
        '</span></li>'
      );
    })
    .join('');
  return (
    (people ? `<ul class="notables">${people}</ul>` : '<p class="insp-note">No notable people yet. Build the places that inspire them and someone special will be born or move in.</p>') +
    `<span class="sheet-label">Who's next</span><ul class="notables next">${next}</ul>`
  );
}
