// Random Town: lays out a small, tidy starter city using the same state API the player uses.

import { STRUCTURES } from './config.js';
import { DIRS } from './state.js';
import { mulberry32 } from './utils.js';

export function generateTown(city, seed = (Math.random() * 2 ** 32) >>> 0) {
  const rand = mulberry32(seed);
  const W = city.width;
  const H = city.height;
  const ri = (a, b) => a + Math.floor(rand() * (b - a + 1));
  city.reset();

  const tile = (x, y) => city.getTile(x, y);
  const place = (x, y, type) => {
    const t = tile(x, y);
    if (!t) return;
    t.terrain = 'grass';
    t.structure = city.createStructure(type, rand);
  };
  const isEmpty = (x, y) => {
    const t = tile(x, y);
    return !!t && t.terrain === 'grass' && !t.structure;
  };

  // Roads: one avenue in each direction plus a side street or two.
  const ax = ri(4, W - 5);
  const ay = ri(4, H - 5);
  for (let i = 0; i < W; i++) place(i, ay, 'road');
  for (let i = 0; i < H; i++) place(ax, i, 'road');
  if (rand() < 0.75) {
    const sy = ay + (ay > H / 2 ? -ri(3, 4) : ri(3, 4));
    const from = ri(0, 2);
    const to = W - 1 - ri(0, 3);
    for (let x = from; x <= to; x++) place(x, sy, 'road');
  }
  if (rand() < 0.5) {
    const sx = ax + (ax > W / 2 ? -ri(3, 4) : ri(3, 4));
    const from = ri(1, 3);
    const to = H - 1 - ri(0, 2);
    for (let y = from; y <= to; y++) place(sx, y, 'road');
  }

  // A pond tucked into the quietest corner.
  const corners = [
    [1, 1],
    [W - 2, 1],
    [1, H - 2],
    [W - 2, H - 2],
  ];
  const [cx, cy] = corners.reduce((best, c) => {
    const d = (p) => Math.abs(p[0] - ax) + Math.abs(p[1] - ay);
    return d(c) > d(best) ? c : best;
  });
  const radius = 1.5 + rand() * 1.1;
  for (const t of city.tiles) {
    if (t.structure) continue;
    const d = Math.hypot(t.x - cx, t.y - cy) + (rand() - 0.5) * 0.9;
    if (d < radius) t.terrain = 'water';
  }

  // Homes line the streets; towers cluster around the main junction.
  const nearRoad = (x, y) => DIRS.some((d) => city.isRoad(x + d.dx, y + d.dy));
  for (const t of city.tiles) {
    if (!isEmpty(t.x, t.y) || !nearRoad(t.x, t.y)) continue;
    const toCentre = Math.abs(t.x - ax) + Math.abs(t.y - ay);
    if (toCentre <= 3 && rand() < 0.5) place(t.x, t.y, 'tower');
    else if (rand() < 0.72) place(t.x, t.y, 'house');
  }

  // Parks where people live.
  const homesAround = (x, y) =>
    city.tiles.filter((n) => n.structure && STRUCTURES[n.structure.type].capacity > 0 && Math.abs(n.x - x) <= 2 && Math.abs(n.y - y) <= 2)
      .length;
  const parkSpots = city.tiles
    .filter((t) => isEmpty(t.x, t.y))
    .map((t) => ({ t, score: homesAround(t.x, t.y) + rand() * 2 }))
    .sort((a, b) => b.score - a.score);
  const parks = ri(2, 3);
  for (let i = 0; i < Math.min(parks, parkSpots.length); i++) place(parkSpots[i].t.x, parkSpots[i].t.y, 'park');

  // Trees along the water, the map edge and in leftover gaps.
  for (const t of city.tiles) {
    if (!isEmpty(t.x, t.y)) continue;
    const byWater = DIRS.some((d) => tile(t.x + d.dx, t.y + d.dy)?.terrain === 'water');
    const edge = t.x === 0 || t.y === 0 || t.x === W - 1 || t.y === H - 1;
    if (rand() < 0.3 + (byWater ? 0.3 : 0) + (edge ? 0.15 : 0)) place(t.x, t.y, 'tree');
  }

  // Some people already live here.
  for (const h of city.homes()) {
    h.structure.residents = Math.floor(STRUCTURES[h.structure.type].capacity * (0.25 + rand() * 0.35));
  }

  city.refreshAllRoadMasks();
  city.dirty = true;
  city.emit('reset', { seed });
}
