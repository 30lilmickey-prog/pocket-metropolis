// Townsfolk section of the City panel: the town's mood, what people are up to right now, the latest
// town news (friendships, regulars, weddings, hard weeks), and a list of everyone with their story.
// Read-only HTML builders; Show me buttons use data-showtile like the rest of the panel.

import { activityOf, fullName, moodWord, quirkOf, traitWords, NEEDS, NEED_LABELS } from './townsfolk.js';
import { notableType } from './notables.js';
import { formatClock } from './time.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = (v) => `${Math.round(v * 100)}%`;
const toneOf = (m) => (m >= 0.55 ? 'good' : m >= 0.35 ? 'caution' : 'bad');
const NEWS_ICON = { friends: '♥', love: '♥', wedding: '♥', regular: '☕', star: '★', arrived: '⌂', left: '✈', down: '☁', cheer: '☺', fallout: '⚡' };

// Changes when anything shown would; rounded so the panel doesn't rebuild every frame.
export function townsfolkKey(tf, open) {
  const st = tf.state;
  return JSON.stringify([
    st.people.length,
    st.news.at(-1)?.id,
    st.hour,
    open ? st.people.map((p) => [p.id, p.doing, Math.round(p.mood * 20)]) : 0,
  ]);
}

function personHTML(city, tf, p) {
  const n = p.notable && notableType(p.notable);
  const act = activityOf(p.doing);
  const partner = p.partner && tf.byId(p.partner);
  const friends = tf.friendsOf(p);
  const fav = p.favorite && tf.placeName(p.favorite);
  const lines = [
    `${traitWords(p.traits).map(esc).join(', ')} · ${esc(quirkOf(p.quirk)?.label || '')} · age ${p.age}`,
    partner ? `${p.married ? 'Married to' : 'In love with'} ${esc(fullName(partner))}` : null,
    friends.length ? `Friends: ${friends.slice(0, 3).map((f) => esc(f.person.first)).join(', ')}${friends.length > 3 ? ` +${friends.length - 3}` : ''}` : null,
    fav ? `Regular at ${esc(fav)}` : null,
  ].filter(Boolean);
  const needs = NEEDS.map(
    (k) => `<span class="tf-need" title="${NEED_LABELS[k]} ${pct(p.needs[k])}"><span class="tf-need-bar ${toneOf(p.needs[k])}" style="width:${pct(p.needs[k])}"></span><small>${NEED_LABELS[k]}</small></span>`
  ).join('');
  const mem = p.mem?.length ? `<small class="tf-mem">Lately: ${esc(p.mem.at(-1).text)}</small>` : '';
  return (
    `<li><span class="tf-face ${toneOf(p.mood)}" aria-hidden="true">${act.icon}</span>` +
    `<span class="np-text"><b>${esc(fullName(p))}${n ? ` <span class="tf-star" title="${esc(n.title)}">${n.icon}</span>` : ''}</b>` +
    `<small>${esc(act.label)} · ${moodWord(p.mood)}</small>` +
    lines.map((l) => `<small>${l}</small>`).join('') +
    `<span class="tf-needs">${needs}</span>${mem}</span>` +
    `<button type="button" class="ghost-btn small" data-showtile="${p.at.x},${p.at.y}">Show me</button></li>`
  );
}

export function townsfolkHTML(city, tf, { open = false } = {}) {
  const s = tf.summary();
  if (!s) return '<p class="insp-note">Townsfolk appear as people move in. Build some homes!</p>';
  const doing = Object.entries(s.doing)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<span class="unlock-chip">${activityOf(k).icon} ${v} ${esc(activityOf(k).verb)}</span>`)
    .join('');
  const news = tf.state.news
    .slice(-8)
    .reverse()
    .map(
      (n) =>
        `<li class="tf-news ${n.tone}"><span class="tf-news-icon" aria-hidden="true">${NEWS_ICON[n.kind] || '•'}</span>` +
        `<span class="np-text"><span>${esc(n.text)}</span><small>Day ${n.day}, ${formatClock(n.clock)}</small></span>` +
        (n.x != null ? `<button type="button" class="ghost-btn small" data-showtile="${n.x},${n.y}">Show me</button>` : '') +
        '</li>'
    )
    .join('');
  const people = open
    ? tf.people
        .slice()
        .sort((a, b) => (b.notable ? 1 : 0) - (a.notable ? 1 : 0) || a.mood - b.mood)
        .map((p) => personHTML(city, tf, p))
        .join('')
    : '';
  return (
    `<div class="tf-head"><div><span class="insp-kicker">Town mood</span><strong class="tf-mood ${toneOf(s.mood)}">${moodWord(s.mood)} · ${pct(s.mood)}</strong></div>` +
    `<div class="tf-stats"><span><b>${s.count}</b> townsfolk</span><span><b>${s.friendships}</b> friendships</span><span><b>${s.couples}</b> couples</span></div></div>` +
    `<p class="tier-unlocks tf-doing">Right now ${doing}</p>` +
    `<span class="sheet-label">Town news</span>` +
    (news ? `<ul class="notables tf-feed">${news}</ul>` : '<p class="insp-note">Nothing yet. Stories appear as people meet at cafés, parks and work.</p>') +
    `<details class="trend-table tf-people"${open ? ' open' : ''}><summary>Meet the townsfolk</summary>${people ? `<ul class="notables">${people}</ul>` : ''}</details>`
  );
}
