// Life event engine: decides which events can happen, fills in their text, rolls outcomes and
// applies their effects. Events themselves are data in lifeEvents.js.

import { stageFor } from './lifeData.js';
import { pickWeighted } from './utils.js';

export const STAT_KEYS = ['happiness', 'health', 'smarts', 'looks'];
export const STAT_LABELS = { happiness: 'Happiness', health: 'Health', smarts: 'Smarts', looks: 'Looks', money: 'Money' };
const DEFAULT_COOLDOWN = 4; // years before a repeatable event can return

export function isEligible(ev, ctx) {
  const c = ctx.char;
  if (ev.manual) return false; // opened by an activity, never at random
  if (ev.stages && !ev.stages.includes(stageFor(c.age).id)) return false;
  if (ev.minAge != null && c.age < ev.minAge) return false;
  if (ev.maxAge != null && c.age > ev.maxAge) return false;
  const last = c.seen[ev.id];
  if (last != null) {
    if (ev.once) return false;
    if (c.age - last < (ev.cooldown ?? DEFAULT_COOLDOWN)) return false;
  }
  if (ev.when && !ev.when(ctx)) return false;
  if (ev.choices && typeof ev.choices === 'function' && !ev.choices(ctx).length) return false;
  return true;
}

export function pickEvent(events, ctx, rng = Math.random) {
  const pool = events.filter((ev) => isEligible(ev, ctx));
  return pickWeighted(pool, (ev) => (typeof ev.weight === 'function' ? ev.weight(ctx) : ev.weight ?? 1), rng);
}

// Replace {name}, {they}, {friend}… with values; {They} capitalises.
export function fill(text, vars) {
  return text.replace(/\{(\w+)\}/g, (m, key) => {
    const lower = key[0].toLowerCase() + key.slice(1);
    const v = vars[key] ?? vars[lower];
    if (v == null) return m;
    return key[0] === key[0].toUpperCase() && key !== lower ? String(v)[0].toUpperCase() + String(v).slice(1) : String(v);
  });
}

export function choicesFor(ev, ctx) {
  const list = typeof ev.choices === 'function' ? ev.choices(ctx) : ev.choices;
  return list.map((ch, i) => ({ label: ch.label, data: ch.data ?? null, index: i }));
}

// Pick an outcome for a choice. Outcome weights may depend on traits and stats.
export function rollOutcome(ev, choiceIndex, data, ctx, rng = Math.random) {
  if (ev.outcome) return ev.outcome(ctx, data, rng);
  const choice = ev.choices[choiceIndex];
  return pickWeighted(choice.outcomes, (o) => (typeof o.weight === 'function' ? o.weight(ctx) : o.weight ?? 1), rng);
}

function clampStat(v) {
  return Math.max(0, Math.min(100, Math.round(v)));
}

// Apply an outcome's effects. Returns the visible changes for the outcome card.
export function applyEffects(effects = {}, ctx) {
  const c = ctx.char;
  const changes = [];
  for (const k of STAT_KEYS) {
    if (!effects[k]) continue;
    const before = c.stats[k];
    c.stats[k] = clampStat(before + effects[k]);
    if (c.stats[k] !== before) changes.push({ key: k, delta: c.stats[k] - before });
  }
  if (effects.money) {
    const before = c.money;
    c.money = Math.max(0, Math.round(c.money + effects.money));
    if (c.money !== before) changes.push({ key: 'money', delta: c.money - before });
  }
  if (effects.rel) {
    for (const [who, d] of Object.entries(effects.rel)) {
      const person = ctx.person(who);
      if (!person) continue;
      person.closeness = clampStat(person.closeness + d);
      changes.push({ key: 'rel', who: person.name, delta: d });
    }
  }
  for (const f of effects.set || []) c.flags[f] = true;
  for (const f of effects.unset || []) delete c.flags[f];
  return changes;
}
