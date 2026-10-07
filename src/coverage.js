// Coverage: each school, clinic, playground or sports field covers the tiles around it, strongest nearby.

import { STRUCTURES, COVERAGE_IDS } from './config.js';

export function computeCoverage(city) {
  for (const t of city.tiles) {
    const c = {};
    for (const id of COVERAGE_IDS) c[id] = 0;
    t.coverage = c;
  }
  for (const src of city.tiles) {
    const def = src.structure && STRUCTURES[src.structure.type];
    if (!def?.service) continue;
    const r = def.radius + (city.derived.notableEffects?.radius?.[def.service] || 0); // notable people widen it
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const t = city.getTile(src.x + dx, src.y + dy);
        if (!t) continue;
        const d = Math.hypot(dx, dy);
        if (d > r) continue;
        const v = 1 - (d / (r + 1)) ** 2;
        if (v > t.coverage[def.service]) t.coverage[def.service] = v;
      }
    }
  }
}
