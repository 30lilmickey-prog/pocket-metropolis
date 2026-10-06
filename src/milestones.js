// Milestones: the town's title follows its population, and reaching a new title unlocks buildings.
// Progress is saved in city.systems.milestones; unlocks never go away, even if people move out.

import { MILESTONES } from './config.js';

export function tierFor(population) {
  let tier = 0;
  MILESTONES.forEach((m, i) => {
    if (population >= m.pop) tier = i;
  });
  return tier;
}

// The milestone that unlocks a tool, or -1 if the tool is always available.
export function unlockTier(tool) {
  return MILESTONES.findIndex((m) => m.unlocks.includes(tool));
}

export class Milestones {
  constructor(city) {
    this.city = city;
  }

  get state() {
    const s = this.city.systems;
    // A city loaded without milestones starts at whatever title it has already earned, quietly.
    if (!s.milestones) s.milestones = { reached: tierFor(this.city.stats.population || 0) };
    return s.milestones;
  }

  get reached() {
    return this.state.reached;
  }

  // Sandbox towns have everything from the start.
  get sandbox() {
    return this.city.systems.mode === 'sandbox';
  }

  isUnlocked(tool) {
    return this.sandbox || unlockTier(tool) <= this.reached;
  }

  // Quietly grant a title without a celebration, e.g. for a ready-made town. Never lowers it.
  settle(tier) {
    this.state.reached = Math.max(this.state.reached, Math.min(tier, MILESTONES.length - 1));
  }

  // A generated town is built for about this many people, so it starts with that title.
  settleForCapacity() {
    this.settle(tierFor(Math.round(this.city.stats.capacity * 0.75)));
  }

  // Call after stats update. Returns the newly reached milestone, if any.
  update() {
    const tier = tierFor(this.city.stats.population);
    if (tier <= this.state.reached) return null;
    this.state.reached = tier;
    const m = MILESTONES[tier];
    this.city.emit('milestone', { tier, milestone: m });
    return m;
  }

  // Where the town stands: its title and progress towards the next one.
  progress() {
    const tier = this.reached;
    const cur = MILESTONES[tier];
    const next = MILESTONES[tier + 1] || null;
    const pop = this.city.stats.population;
    return {
      tier,
      current: cur,
      next,
      fraction: next ? Math.max(0, Math.min(1, (pop - cur.pop) / (next.pop - cur.pop))) : 1,
    };
  }
}
