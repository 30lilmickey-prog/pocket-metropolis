// Persistence: versioned saves in localStorage. Add a migration whenever SAVE_VERSION goes up.

import { SAVE_VERSION } from './config.js';
import { CityState } from './state.js';

const KEY = 'pocket-metropolis:save';

// MIGRATIONS[n] upgrades a save from version n to n + 1.
export const MIGRATIONS = {
  // 1: (save) => { save.city.systems.economy = { funds: 1000 }; return save; },
};

function migrate(save) {
  let v = save.version | 0;
  if (v < 1 || v > SAVE_VERSION) throw new Error(`Unsupported save version ${save.version}`);
  while (v < SAVE_VERSION) {
    save = MIGRATIONS[v](save);
    v++;
    save.version = v;
  }
  return save;
}

export function saveCity(city) {
  try {
    const save = { version: SAVE_VERSION, savedAt: Date.now(), city: city.toJSON() };
    localStorage.setItem(KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function loadCity() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return CityState.fromJSON(migrate(JSON.parse(raw)).city);
  } catch {
    return null;
  }
}

// Saves shortly after each edit, every so often while the city lives, and when the page is hidden.
export class AutoSaver {
  constructor(city, { delayMs = 800, intervalS = 15 } = {}) {
    this.city = city;
    this.delayMs = delayMs;
    this.intervalS = intervalS;
    this.pending = -1;
    this.since = 0;
    city.on((ev) => {
      if (ev.type === 'placed' || ev.type === 'removed' || ev.type === 'watered' || ev.type === 'reset') {
        this.pending = this.delayMs;
      }
    });
    const flush = () => this.flush();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    window.addEventListener('pagehide', flush);
  }

  tick(dt) {
    this.since += dt;
    if (this.pending >= 0) {
      this.pending -= dt * 1000;
      if (this.pending < 0) this.flush();
    }
    if (this.since > this.intervalS) this.flush();
  }

  flush() {
    saveCity(this.city);
    this.since = 0;
    this.pending = -1;
  }
}
