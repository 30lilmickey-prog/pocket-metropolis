// Streets: every straight run of road gets a name, and every building facing a road gets a house
// number on it ("14 Maple Street"). Names are saved in city.systems.streets by tile, so they stay put
// when roads grow, and a split road keeps its name on the longer half.
//
// Writes derived data on tiles: `street` (road tiles: the name of their main run) and `address`
// (buildings with road access). Recomputed whenever the map changes.

import { STRUCTURES } from './config.js';
import { hash2 } from './utils.js';

const NAMES = [
  'Maple', 'Willow', 'Blossom', 'Clover', 'Juniper', 'Peach', 'Lavender', 'Honey', 'Meadow', 'Sparrow',
  'Bluebell', 'Cherry', 'Hazel', 'Birch', 'Rosemary', 'Poppy', 'Linden', 'Primrose', 'Thistle', 'Elder',
  'Fern', 'Marigold', 'Orchard', 'Chestnut', 'Acorn', 'Pebble', 'Brook', 'Lantern', 'Harbour', 'Sunny',
  'Dove', 'Robin', 'Wren', 'Lark', 'Saffron', 'Cinnamon', 'Pumpkin', 'Daisy', 'Tulip', 'Ivy',
  'Moss', 'Cedar', 'Aspen', 'Magnolia', 'Lilac', 'Sage', 'Mint', 'Plum', 'Apricot', 'Biscuit',
  'Velvet', 'Cobble', 'Kite', 'Puddle', 'Teacup', 'Ribbon', 'Button', 'Marble', 'Feather', 'Cloud',
];
// Roads running along x read as streets and lanes, roads along y as avenues and ways.
const SUFFIX = { h: ['Street', 'Road', 'Lane'], v: ['Avenue', 'Way', 'Row'] };
const SHORT = { Street: 'St', Road: 'Rd', Lane: 'Ln', Avenue: 'Ave', Way: 'Way', Row: 'Row' };

export function shortName(name) {
  const i = name.lastIndexOf(' ');
  return i < 0 ? name : `${name.slice(0, i)} ${SHORT[name.slice(i + 1)] || name.slice(i + 1)}`;
}

// Straight runs of road: { dir: 'h'|'v', tiles: [tile…] }. Runs of one tile are kept only when
// the tile isn't already part of a longer run the other way (a lone road stub still gets a name).
export function findRuns(city) {
  const runs = [];
  const longest = new Map(); // tile → its longest run
  for (const dir of ['h', 'v']) {
    const dx = dir === 'h' ? 1 : 0;
    const dy = dir === 'h' ? 0 : 1;
    for (const t of city.tiles) {
      if (!city.isRoad(t.x, t.y) || city.isRoad(t.x - dx, t.y - dy)) continue; // start of a run only
      const tiles = [];
      for (let x = t.x, y = t.y; city.isRoad(x, y); x += dx, y += dy) tiles.push(city.getTile(x, y));
      runs.push({ dir, tiles });
    }
  }
  for (const r of runs) for (const t of r.tiles) if (!longest.has(t) || longest.get(t).tiles.length < r.tiles.length) longest.set(t, r);
  return runs.filter((r) => r.tiles.length > 1 || longest.get(r.tiles[0]) === r);
}

// Name every run, reusing saved names where the run overlaps tiles that had one.
export function computeStreets(city) {
  const saved = city.systems.streets || { h: {}, v: {} };
  const runs = findRuns(city);
  const W = city.width;
  const next = { h: {}, v: {} };
  const used = new Set();
  // Longer runs choose first, so when a street is cut in two the longer part keeps the name.
  runs.sort((a, b) => b.tiles.length - a.tiles.length);
  for (const r of runs) {
    const votes = new Map();
    for (const t of r.tiles) {
      const n = saved[r.dir]?.[t.y * W + t.x];
      if (n && !used.has(n)) votes.set(n, (votes.get(n) || 0) + 1);
    }
    let name = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!name) name = freshName(r, used);
    used.add(name);
    r.name = name;
    for (const t of r.tiles) next[r.dir][t.y * W + t.x] = name;
  }
  city.systems.streets = next;

  // Road tiles show the name of their longest run.
  for (const t of city.tiles) {
    t.street = null;
    t.address = null;
  }
  const onTile = new Map(); // road tile → [{ run, index }] (two entries at a crossing)
  for (const r of runs) {
    r.tiles.forEach((t, index) => {
      if (!onTile.has(t)) onTile.set(t, []);
      onTile.get(t).push({ run: r, index });
    });
  }
  for (const [t, list] of onTile) t.street = list.reduce((a, b) => (b.run.tiles.length > a.run.tiles.length ? b : a)).run.name;

  // Buildings take a number on the road they face: odd on one side, even on the other.
  for (const t of city.tiles) {
    if (!t.structure || STRUCTURES[t.structure.type].road) continue;
    let best = null;
    for (const [ox, oy] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ]) {
      const road = city.getTile(t.x + ox, t.y + oy);
      for (const { run, index } of (road && onTile.get(road)) || []) {
        // Prefer a road the building sits beside (not at the end of), then the longer street.
        const beside = (run.dir === 'h' && oy !== 0) || (run.dir === 'v' && ox !== 0);
        const score = (beside ? 1000 : 0) + run.tiles.length;
        if (!best || score > best.score) best = { score, run, index, side: run.dir === 'h' ? oy : ox };
      }
    }
    if (best) t.address = `${best.index * 2 + (best.side > 0 ? 1 : 2)} ${best.run.name}`;
  }
  city.derived.streets = runs;
  return runs;
}

function freshName(run, used) {
  const t = run.tiles[0];
  for (let attempt = 0; attempt < 400; attempt++) {
    const base = NAMES[Math.floor(hash2(t.x, t.y, 900 + attempt) * NAMES.length)];
    const suffixes = SUFFIX[run.dir];
    const suffix = suffixes[Math.floor(hash2(t.x, t.y, 950 + attempt) * suffixes.length)];
    const name = `${base} ${suffix}`;
    if (!used.has(name)) return name;
  }
  return `Road ${used.size + 1}`;
}

// "14 Maple Street", or the grid position for a lot with no road.
export function addressOf(tile) {
  return tile?.address || (tile ? `${tile.x}, ${tile.y}` : '');
}
