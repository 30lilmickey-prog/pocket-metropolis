// Simulation: advances time, recomputes desirability, moves residents in and out, and tallies stats.

import { STRUCTURES, DAY_LENGTH_SECONDS, SIM_STEP } from './config.js';
import { recomputeDesirability } from './desirability.js';
import { AgentSystem } from './agents.js';
import { daylightAt } from './time.js';
import { clamp, pickWeighted } from './utils.js';

export class Simulation {
  constructor(city) {
    this.city = city;
    this.agents = new AgentSystem(city);
    this.speed = 1;
    this._acc = 0;
  }

  update(dt) {
    const city = this.city;
    const step = Math.min(dt, 0.25) * this.speed;
    city.clock += step / DAY_LENGTH_SECONDS;
    if (city.clock >= 1) {
      city.clock -= 1;
      city.day++;
    }
    this._acc += step;
    while (this._acc >= SIM_STEP) {
      this._acc -= SIM_STEP;
      this.tick();
    }
    this.agents.update(step, daylightAt(city.clock));
  }

  tick() {
    if (this.city.dirty) recomputeDesirability(this.city);
    this.updateHousing();
    this.updateStats();
  }

  // Desirability maps to how full a home can get: a bare lot fills a little, a leafy one fills up.
  targetResidents(tile) {
    const cap = STRUCTURES[tile.structure.type].capacity;
    return Math.round(cap * clamp((tile.desirability - 0.15) / 0.7, 0, 1));
  }

  updateHousing() {
    const city = this.city;
    const homes = city.homes();
    for (const h of homes) h.housingTarget = this.targetResidents(h);

    // Residents drift away from homes that are less appealing than they used to be.
    for (const h of homes) {
      const s = h.structure;
      if (s.residents > h.housingTarget && Math.random() < 0.1) {
        s.residents--;
        city.emit('movedOut', { x: h.x, y: h.y });
      }
    }

    // Newcomers choose among vacancies, favouring the most desirable homes.
    const open = homes.filter((h) => h.structure.residents < h.housingTarget);
    if (!open.length) return;
    const attempts = 1 + Math.floor(open.length / 8);
    for (let i = 0; i < attempts; i++) {
      if (Math.random() > 0.3) continue;
      const h = pickWeighted(open, (c) => (c.housingTarget - c.structure.residents) * c.desirability ** 2);
      if (!h || h.structure.residents >= h.housingTarget) continue;
      h.structure.residents++;
      city.emit('movedIn', { x: h.x, y: h.y });
    }
  }

  updateStats() {
    const city = this.city;
    let population = 0;
    let capacity = 0;
    let weighted = 0;
    let desirSum = 0;
    const homes = city.homes();
    for (const h of homes) {
      const r = h.structure.residents;
      population += r;
      capacity += STRUCTURES[h.structure.type].capacity;
      weighted += r * h.desirability;
      desirSum += h.desirability;
    }
    const happiness = population ? weighted / population : homes.length ? desirSum / homes.length : 0;
    city.stats = {
      population,
      capacity,
      homes: homes.length,
      occupancy: capacity ? population / capacity : 0,
      happiness: Math.round(happiness * 100),
    };
  }
}
