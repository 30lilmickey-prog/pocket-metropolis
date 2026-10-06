// Desirability: how much people want to live on a tile. Each factor is an independent, pluggable function.
// To add a system later (services, jobs, pollution…), implement its `compute` and flip `enabled`.

import { STRUCTURES, SERVICES } from './config.js';
import { clamp } from './utils.js';

const BASE = 0.28;

function sumAround(city, tile, radius, valueOf) {
  let sum = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (!dx && !dy) continue;
      const n = city.getTile(tile.x + dx, tile.y + dy);
      if (!n) continue;
      const dist = Math.hypot(dx, dy);
      if (dist > radius + 0.5) continue;
      sum += valueOf(n) * (1 - dist / (radius + 1.5));
    }
  }
  return sum;
}

export const FACTORS = [
  {
    id: 'greenery',
    label: 'Parks & trees',
    enabled: true,
    compute: (city, tile) =>
      Math.min(0.35, sumAround(city, tile, 3, (n) => (n.structure ? STRUCTURES[n.structure.type].greenery * 0.06 : 0))),
  },
  {
    id: 'waterfront',
    label: 'Water views',
    enabled: true,
    compute: (city, tile) => Math.min(0.08, sumAround(city, tile, 2, (n) => (n.terrain === 'water' ? 0.04 : 0))),
  },
  {
    id: 'access',
    label: 'Road access',
    enabled: true,
    compute: (city, tile) => {
      let best = 9;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          if (city.isRoad(tile.x + dx, tile.y + dy)) best = Math.min(best, Math.abs(dx) + Math.abs(dy));
        }
      }
      return best <= 1 ? 0.1 : best <= 2 ? 0.04 : -0.08;
    },
  },
  {
    id: 'services',
    label: 'Schools & clinics',
    enabled: true,
    compute: (city, tile) => {
      let sum = 0;
      for (const s of SERVICES) sum += tile.coverage[s.id] || 0;
      return 0.16 * (sum / SERVICES.length);
    },
  },
  {
    id: 'employment',
    label: 'Jobs',
    enabled: true,
    // Homes rate their own residents' job prospects; empty lots rate jobs within reach.
    compute: (city, tile) => {
      if (tile.structure && STRUCTURES[tile.structure.type].capacity > 0 && tile.structure.residents > 0) {
        return 0.16 * tile.employment;
      }
      const jobs = city.derived.labor;
      if (!jobs || !jobs.jobs) return 0;
      return 0.16 * Math.min(1, (jobs.jobs - jobs.employed) / Math.max(4, jobs.employed * 0.15));
    },
  },
  {
    id: 'traffic',
    label: 'Traffic',
    enabled: true,
    compute: (city, tile) => {
      let worst = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const n = city.getTile(tile.x + dx, tile.y + dy);
          if (!n || !n.roadMask) continue;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          worst = Math.max(worst, n.congestion * (1 - d / 3));
        }
      }
      return -0.14 * worst;
    },
  },
  { id: 'pollution', label: 'Pollution', enabled: false, compute: () => 0 },
  { id: 'safety', label: 'Safety', enabled: false, compute: () => 0 },
  { id: 'overcrowding', label: 'Overcrowding', enabled: false, compute: () => 0 },
  { id: 'walkability', label: 'Walkability', enabled: false, compute: () => 0 },
  { id: 'utilities', label: 'Utilities', enabled: false, compute: () => 0 },
  {
    id: 'entertainment',
    label: 'Playgrounds & sport',
    enabled: true,
    compute: (city, tile) => 0.1 * (tile.coverage?.fun || 0),
  },
];

export function recomputeDesirability(city) {
  for (const tile of city.tiles) {
    let d = BASE;
    const factors = {};
    for (const f of FACTORS) {
      if (!f.enabled) continue;
      const v = f.compute(city, tile);
      factors[f.id] = v;
      d += v;
    }
    tile.desirability = clamp(d, 0, 1);
    tile.factors = factors;
  }
  city.dirty = false;
}
