// Labor market and traffic. Residents look for the nearest jobs they can reach by road; each
// commute then loads the road tiles along its route. Adapted from Cimulity's aggregate
// nearest-with-overflow matching (MIT, github.com/zeikar/cimulity).

import { STRUCTURES, WORKER_SHARE, ROAD_CAPACITY } from './config.js';

export function workersIn(home) {
  return Math.round(home.structure.residents * WORKER_SHARE);
}

// Returns { flows, employed, unemployed, jobs } and writes per-tile employment, workersFilled
// and congestion. Each flow is { from, to, count, path } where path lists road tiles.
export function computeLaborMarket(city) {
  const W = city.width;
  const size = W * city.height;
  const homes = city.homes();
  const workplaces = city.workplaces();

  // Remaining capacity per access road (several workplaces can share one).
  const capacity = new Map();
  const destinations = new Map(); // access road index → workplace tiles
  let jobs = 0;
  for (const w of workplaces) {
    const cap = STRUCTURES[w.structure.type].jobs;
    jobs += cap;
    w.workersFilled = 0;
    const road = city.accessRoad(w.x, w.y);
    if (!road) continue;
    const k = road.y * W + road.x;
    capacity.set(k, (capacity.get(k) || 0) + cap);
    if (!destinations.has(k)) destinations.set(k, []);
    destinations.get(k).push(w);
  }

  const load = new Float32Array(size);
  const flows = [];
  let employed = 0;
  let unemployed = 0;
  const prev = new Int32Array(size);
  const seen = new Uint32Array(size);
  let stamp = 0;

  // Process homes in a stable order so results don't jitter between ticks.
  const origins = homes
    .map((h) => ({ h, workers: workersIn(h), road: city.accessRoad(h.x, h.y) }))
    .sort((a, b) => a.h.y * W + a.h.x - (b.h.y * W + b.h.x));

  for (const o of origins) {
    o.h.employment = 0;
    if (o.workers <= 0) continue;
    if (!o.road) {
      unemployed += o.workers;
      continue;
    }
    let left = o.workers;
    stamp++;
    const start = o.road.y * W + o.road.x;
    const queue = [start];
    seen[start] = stamp;
    prev[start] = -1;
    for (let qi = 0; qi < queue.length && left > 0; qi++) {
      const k = queue[qi];
      const cap = capacity.get(k);
      if (cap > 0) {
        const take = Math.min(cap, left);
        capacity.set(k, cap - take);
        left -= take;
        const path = [];
        for (let p = k; p !== -1; p = prev[p]) {
          path.push(p);
          load[p] += take;
        }
        path.reverse();
        flows.push({ from: start, to: k, count: take, path });
        let remaining = take;
        for (const w of destinations.get(k)) {
          const room = STRUCTURES[w.structure.type].jobs - w.workersFilled;
          const add = Math.min(room, remaining);
          w.workersFilled += add;
          remaining -= add;
          if (!remaining) break;
        }
      }
      const x = k % W;
      const y = (k - x) / W;
      for (const [dx, dy] of [
        [0, -1],
        [1, 0],
        [0, 1],
        [-1, 0],
      ]) {
        if (!city.isRoad(x + dx, y + dy)) continue;
        const n = (y + dy) * W + x + dx;
        if (seen[n] === stamp) continue;
        seen[n] = stamp;
        prev[n] = k;
        queue.push(n);
      }
    }
    employed += o.workers - left;
    unemployed += left;
    o.h.employment = (o.workers - left) / o.workers;
  }

  for (let i = 0; i < size; i++) city.tiles[i].congestion = Math.min(1, load[i] / ROAD_CAPACITY);
  return { flows, employed, unemployed, jobs };
}
