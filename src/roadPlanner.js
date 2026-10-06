// Road planner: when a street is jammed, find a new stretch of road that would actually ease it.
// Traffic jams come from the buildings along a street (every office, tower and shop sends its
// commuters through it), so the cure is another way round: extend a dead end into a shortcut, link
// two roads with a short connector, or run a bypass alongside the jammed street.
//
// Each candidate is tested by re-running the commute model with the new road in place (a dry run
// that changes nothing), and the one that clears the most traffic per tile built wins.

import { STRUCTURES, ROAD_CAPACITY } from './config.js';
import { computeLaborMarket } from './labor.js';

const JAM = 0.85; // congestion that counts as jammed
const SEARCH_RADIUS = 11; // how far from the jam to look for fixes
const MAX_NEW_TILES = 14;
const MAX_CANDIDATES = 18;
const DIRS = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

// Grass a road could go on: empty, or with a tree that can be cleared (counted as a small cost).
function buildable(city, x, y) {
  const t = city.getTile(x, y);
  return !!t && t.terrain === 'grass' && (!t.structure || t.structure.type === 'tree');
}
const treesOn = (city, tiles) => tiles.filter((t) => city.getTile(t.x, t.y).structure?.type === 'tree').length;

// How bad traffic is overall: total delay, where each commuter on a road tile is held up by the
// square of how full it is. Spreading the same traffic over more roads lowers it.
export function trafficExcess(load) {
  let sum = 0;
  for (let i = 0; i < load.length; i++) {
    const c = load[i] / ROAD_CAPACITY;
    if (c > 0) sum += load[i] * c * c;
  }
  return sum;
}

// The jammed stretch around the worst tile: its straight run of busy road, and the street's name.
export function worstJam(city) {
  let worst = null;
  for (const t of city.tiles) if (t.roadMask && t.congestion >= JAM && (!worst || t.congestion > worst.congestion)) worst = t;
  if (!worst) return null;
  // The busy part of each street through the worst tile; at a crossing, follow the one the jam runs along.
  const runs = (city.derived.streets || []).filter((r) => r.tiles.includes(worst));
  let run = null;
  let segment = [worst];
  for (const r of runs) {
    const i = r.tiles.indexOf(worst);
    let a = i;
    let b = i;
    while (a > 0 && r.tiles[a - 1].congestion >= 0.6) a--;
    while (b < r.tiles.length - 1 && r.tiles[b + 1].congestion >= 0.6) b++;
    if (!run || b - a + 1 > segment.length) {
      run = r;
      segment = r.tiles.slice(a, b + 1);
    }
  }
  // What's causing it: the busiest kinds of building along the jammed stretch.
  const causes = new Map();
  for (const t of segment) {
    for (const [dx, dy] of DIRS) {
      const n = city.getTile(t.x + dx, t.y + dy);
      const def = n?.structure && STRUCTURES[n.structure.type];
      if (!def || def.road || def.walkable) continue;
      if (def.jobs || def.capacity) causes.set(n.structure.type, (causes.get(n.structure.type) || 0) + 1);
    }
  }
  return { tile: worst, run, dir: run?.dir || null, segment, street: worst.street, causes };
}

// Straight links from a road tile across empty grass to another road: dead-end extensions and
// shortcuts. Only links that save a real detour are kept.
function linkCandidates(city, near, out) {
  const W = city.width;
  const roads = city.tiles.filter((t) => t.roadMask && Math.abs(t.x - near.x) + Math.abs(t.y - near.y) <= SEARCH_RADIUS);
  for (const start of roads) {
    const deadEnd = city.roadNeighbors(start.x, start.y).length === 1;
    for (const [dx, dy] of DIRS) {
      const tiles = [];
      let x = start.x + dx;
      let y = start.y + dy;
      while (buildable(city, x, y) && tiles.length < MAX_NEW_TILES) {
        tiles.push({ x, y });
        x += dx;
        y += dy;
      }
      if (!tiles.length || !city.isRoad(x, y)) continue;
      // Skip links that just run beside an existing road (both sides of every step already road).
      const detour = roadDistance(city, start, { x, y });
      if (detour !== Infinity && detour - (tiles.length + 1) < 4) continue;
      out.push({ kind: deadEnd ? 'extend' : 'link', tiles, key: tiles.map((t) => t.y * W + t.x).join(',') });
    }
  }
}

// A road alongside the jammed stretch, two to four tiles away, joined at both ends.
function bypassCandidates(city, jam, out) {
  if (!jam.dir || jam.segment.length < 2) return;
  const W = city.width;
  const seg = jam.segment;
  const along = jam.dir === 'h' ? [1, 0] : [0, 1];
  const side = jam.dir === 'h' ? [0, 1] : [1, 0];
  const first = seg[0];
  const last = seg[seg.length - 1];
  for (const off of [2, -2, 3, -3, 4, -4, 5, -5]) {
    const tiles = [];
    let ok = true;
    const add = (x, y) => {
      if (city.isRoad(x, y)) return;
      if (!buildable(city, x, y)) ok = false;
      else tiles.push({ x, y });
    };
    // Connectors from each end of the jam out to the bypass line.
    const step = Math.sign(off);
    for (const end of [
      { x: first.x - along[0], y: first.y - along[1] },
      { x: last.x + along[0], y: last.y + along[1] },
    ]) {
      for (let k = 1; k <= Math.abs(off) && ok; k++) add(end.x + side[0] * k * step, end.y + side[1] * k * step);
    }
    // The bypass itself, one tile past each end of the jam.
    const len = seg.length + 2;
    for (let i = 1; i < len - 1 && ok; i++) {
      add(first.x - along[0] + along[0] * i + side[0] * off, first.y - along[1] + along[1] * i + side[1] * off);
    }
    // The connectors must start on road: the jammed street's neighbours past each end.
    const startA = { x: first.x - along[0], y: first.y - along[1] };
    const startB = { x: last.x + along[0], y: last.y + along[1] };
    if (!city.isRoad(startA.x, startA.y) && !buildable(city, startA.x, startA.y)) ok = false;
    if (!city.isRoad(startB.x, startB.y) && !buildable(city, startB.x, startB.y)) ok = false;
    if (!city.isRoad(startA.x, startA.y)) tiles.push(startA);
    if (!city.isRoad(startB.x, startB.y)) tiles.push(startB);
    if (ok && tiles.length) out.push({ kind: 'bypass', tiles, key: tiles.map((t) => t.y * W + t.x).sort().join(',') });
  }
}

// A new road across open land from near one end of the jam to near the other, so drivers can go
// round it. Found with a breadth-first search over buildable tiles only.
function aroundCandidates(city, jam, out) {
  const W = city.width;
  const seg = new Set(jam.segment);
  const ends = [jam.segment[0], jam.segment[jam.segment.length - 1]];
  // Road tiles near each end of the jam (not on it): where the new road should join.
  const zone = (end) => {
    const set = new Set();
    for (const t of city.tiles) {
      if (!t.roadMask && !city.isRoad(t.x, t.y)) continue;
      if (seg.has(t)) continue;
      if (Math.abs(t.x - end.x) + Math.abs(t.y - end.y) <= 4) set.add(t.y * W + t.x);
    }
    return set;
  };
  const zoneA = zone(ends[0]);
  const zoneB = zone(ends[1]);
  const touches = (x, y, z) => DIRS.some(([dx, dy]) => z.has((y + dy) * W + x + dx));
  // Start from every buildable tile beside zone A; stop at the first one beside zone B.
  const prev = new Map();
  const queue = [];
  for (const k of zoneA) {
    const x = k % W;
    const y = (k - x) / W;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx;
      const ny = y + dy;
      const nk = ny * W + nx;
      if (buildable(city, nx, ny) && !prev.has(nk)) {
        prev.set(nk, -1);
        queue.push({ x: nx, y: ny, d: 1 });
      }
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    if (cur.d > MAX_NEW_TILES) break;
    if (touches(cur.x, cur.y, zoneB) && cur.d >= 2) {
      const tiles = [];
      for (let k = cur.y * W + cur.x; k !== -1; k = prev.get(k)) tiles.push({ x: k % W, y: Math.floor(k / W) });
      out.push({ kind: 'around', tiles, key: tiles.map((t) => t.y * W + t.x).sort().join(',') });
      if (out.filter((c) => c.kind === 'around').length >= 3) return;
      continue;
    }
    for (const [dx, dy] of DIRS) {
      const nx = cur.x + dx;
      const ny = cur.y + dy;
      const nk = ny * W + nx;
      if (prev.has(nk) || !buildable(city, nx, ny)) continue;
      prev.set(nk, cur.y * W + cur.x);
      queue.push({ x: nx, y: ny, d: cur.d + 1 });
    }
  }
}

// Steps between two road tiles along the road network.
function roadDistance(city, a, b) {
  const W = city.width;
  const seen = new Map([[a.y * W + a.x, 0]]);
  const queue = [a];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    const d = seen.get(cur.y * W + cur.x);
    if (cur.x === b.x && cur.y === b.y) return d;
    if (d > 40) break;
    for (const n of city.roadNeighbors(cur.x, cur.y)) {
      const k = n.y * W + n.x;
      if (seen.has(k)) continue;
      seen.set(k, d + 1);
      queue.push(n);
    }
  }
  return Infinity;
}

// The best road to build for the current jam, or null when no new road would help much.
// Returns { kind, tiles, street, before, after, gain } where gain is the share of excess traffic cleared.
export function planRoad(city) {
  const jam = worstJam(city);
  if (!jam) return null;
  const base = computeLaborMarket(city, { dryRun: true });
  const before = trafficExcess(base.load);
  if (before <= 0) return null;
  const all = [];
  linkCandidates(city, jam.tile, all);
  bypassCandidates(city, jam, all);
  aroundCandidates(city, jam, all);
  const unique = new Map();
  for (const c of all) if (c.tiles.length <= MAX_NEW_TILES && !unique.has(c.key)) unique.set(c.key, c);
  const near = (c) => Math.min(...c.tiles.map((t) => Math.abs(t.x - jam.tile.x) + Math.abs(t.y - jam.tile.y)));
  const candidates = [...unique.values()].sort((a, b) => near(a) - near(b) || a.tiles.length - b.tiles.length).slice(0, MAX_CANDIDATES);
  let best = null;
  const tried = [];
  for (const c of candidates) {
    const extra = new Set(c.tiles.map((t) => t.y * city.width + t.x));
    const after = trafficExcess(computeLaborMarket(city, { extraRoads: extra, dryRun: true }).load);
    const gain = (before - after) / before;
    const trees = treesOn(city, c.tiles);
    const score = gain / (c.tiles.length + trees * 0.5 + 4);
    tried.push({ kind: c.kind, n: c.tiles.length, gain });
    if (gain >= 0.12 && (!best || score > best.score)) best = { ...c, after, gain, score, trees };
  }
  return { jam, before, best, tried };
}

// Cached per map revision, since the dry runs take a few milliseconds each.
export function roadPlanFor(city) {
  const cached = city.derived.roadPlan;
  const key = `${city.revision}|${Math.round((city.stats.population || 0) / 25)}`; // re-plan as the town fills up
  if (cached && cached.key === key) return cached.plan;
  const plan = planRoad(city);
  city.derived.roadPlan = { key, plan };
  return plan;
}
