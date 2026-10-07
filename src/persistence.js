// Persistence: versioned saves in localStorage. Add a migration whenever SAVE_VERSION goes up.

import { SAVE_VERSION } from './config.js';
import { CityState } from './state.js';
import { ERAS, yearOf } from './eras.js';

const KEY = 'pocket-metropolis:save';
const ACTIVE_KEY = 'pocket-metropolis:slot';
export const SLOT_COUNT = 3;

// Three save slots. Slot 1 uses the original key, so towns saved before slots existed stay in it.
const slotKey = (n) => (n === 1 ? KEY : `${KEY}:${n}`);

export function activeSlot() {
  try {
    const n = Number(localStorage.getItem(ACTIVE_KEY));
    return n >= 1 && n <= SLOT_COUNT ? n : 1;
  } catch {
    return 1;
  }
}

export function setActiveSlot(n) {
  try {
    localStorage.setItem(ACTIVE_KEY, String(n));
  } catch {
    // Private mode: stay on the current slot for this visit.
  }
}

// A short description of a town for the save slots sheet.
export function metaOf(city) {
  const life = city.systems.life?.char;
  const era = ERAS[city.systems.era?.index ?? 0];
  let pop = 0;
  for (const t of city.tiles) pop += t.structure?.residents || 0;
  return {
    pop,
    year: yearOf(city),
    era: era?.label || '',
    day: city.day,
    person: life ? `${life.first} ${life.last}` : null,
    alive: life ? life.alive !== false : null,
    generation: life?.generation || null,
    width: city.width,
    mode: city.systems.mode || 'milestones',
  };
}

// What's in a slot, without loading it: null when empty.
export function slotInfo(n) {
  try {
    const raw = localStorage.getItem(slotKey(n));
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (save.meta) return { ...save.meta, savedAt: save.savedAt };
    const city = CityState.fromJSON(migrate(save).city);
    return { ...metaOf(city), savedAt: save.savedAt };
  } catch {
    return { broken: true };
  }
}

export function deleteSlot(n) {
  try {
    localStorage.removeItem(slotKey(n));
    return true;
  } catch {
    return false;
  }
}

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

export function saveCity(city, slot = activeSlot()) {
  try {
    const save = { version: SAVE_VERSION, savedAt: Date.now(), meta: metaOf(city), city: city.toJSON() };
    localStorage.setItem(slotKey(slot), JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function loadCity(slot = activeSlot()) {
  try {
    const raw = localStorage.getItem(slotKey(slot));
    if (!raw) return null;
    return CityState.fromJSON(migrate(JSON.parse(raw)).city);
  } catch {
    return null;
  }
}

// A copy of your own town, kept while you visit a shared one.
const BACKUP_KEY = `${KEY}:backup`;

export function saveBackup(city) {
  try {
    localStorage.setItem(BACKUP_KEY, JSON.stringify({ version: SAVE_VERSION, savedAt: Date.now(), city: city.toJSON() }));
    return true;
  } catch {
    return false;
  }
}

export function loadBackup() {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? CityState.fromJSON(migrate(JSON.parse(raw)).city) : null;
  } catch {
    return null;
  }
}

export function clearBackup() {
  try {
    localStorage.removeItem(BACKUP_KEY);
  } catch {
    // Nothing to clear.
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
