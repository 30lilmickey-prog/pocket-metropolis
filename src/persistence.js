// Persistence: versioned saves in localStorage. Add a migration whenever SAVE_VERSION goes up.

import { SAVE_VERSION } from './config.js';
import { CityState } from './state.js';

const KEY = 'pocket-metropolis:save';

// MIGRATIONS[n] upgrades a save from version n to n + 1.
export const MIGRATIONS = {
  // v1 → v2: maps grew from 12×12 to 32×32. Old towns keep every tile and move to the middle.
  1: (save) => {
    const c = save.city;
    const size = Math.max(32, c.width | 0, c.height | 0);
    const ox = Math.floor((size - c.width) / 2);
    const oy = Math.floor((size - c.height) / 2);
    const tiles = Array.from({ length: size * size }, () => ({ terrain: 'grass', structure: null }));
    c.tiles.forEach((t, i) => {
      const x = i % c.width;
      const y = Math.floor(i / c.width);
      tiles[(y + oy) * size + x + ox] = t;
    });
    save.city = { ...c, width: size, height: size, tiles };
    return save;
  },
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
      if (['placed', 'removed', 'watered', 'reset', 'lifeChanged', 'lifeEvent'].includes(ev.type)) {
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
