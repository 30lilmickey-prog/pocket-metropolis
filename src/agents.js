// Agents: cars and pedestrians that make the simulation visible. They read the city and are never
// directly controlled. Positions are in grid units; the renderer decides how they look.

import { CAR_COLORS, SHIRT_COLORS, SKIN_TONES } from './config.js';
import { DIRS } from './state.js';
import { pick, pickWeighted } from './utils.js';

const MAX_CARS = 70;
const MAX_WALKERS = 60;

// How busy commuting is at this time of day: morning and evening rush hours, quiet nights.
export function commuteActivity(clock) {
  const peak = (c, w) => Math.exp(-(((clock - c) / w) ** 2));
  return Math.min(1, 0.12 + 0.88 * peak(0.33, 0.05) + 0.88 * peak(0.73, 0.05) + 0.3 * peak(0.52, 0.12));
}

export class AgentSystem {
  constructor(city) {
    this.city = city;
    this.cars = [];
    this.walkers = [];
    this.time = 0;
    this._carTimer = 0;
    this._walkTimer = 0;
    this.hero = null; // the Life Story character, when they are out and about
    this._heroWait = 1;
    city.on((ev) => {
      if (ev.type === 'reset' || ev.type === 'loaded') this.clear();
    });
  }

  clear() {
    this.cars.length = 0;
    this.walkers.length = 0;
    this.hero = null;
  }

  update(dt, daylight) {
    this.time += dt;
    this._carTimer -= dt;
    this._walkTimer -= dt;
    this.updateCars(dt, daylight);
    this.updateWalkers(dt, daylight);
    this.updateHero(dt, daylight);
  }

  get commuters() {
    return this.cars.filter((c) => c.route && !c.leaving).length;
  }

  // ---- Cars -------------------------------------------------------------

  // Cruising cars scale with the road network; commuters follow the labor market's routes.
  desiredCars(daylight) {
    let roads = 0;
    for (const t of this.city.tiles) if (t.roadMask) roads++;
    if (roads < 2) return { cruising: 0, commuting: 0 };
    const cruising = Math.round(
      Math.min(Math.floor(roads / 6), 2 + Math.floor(this.city.stats.population / 25), 20) * (0.35 + 0.65 * daylight)
    );
    const employed = this.city.derived.labor?.employed || 0;
    const commuting = Math.round(Math.min(MAX_CARS - 20, employed / 5) * commuteActivity(this.city.clock));
    return { cruising, commuting };
  }

  updateCars(dt, daylight) {
    const want = this.desiredCars(daylight);
    const active = this.cars.filter((c) => !c.leaving);
    const commuting = active.filter((c) => c.route).length;
    const cruising = active.length - commuting;
    if (this._carTimer <= 0) {
      if (commuting < want.commuting && this.spawnCommuter()) this._carTimer = 0.18;
      else if (cruising < want.cruising) {
        this.spawnCar();
        this._carTimer = 0.4;
      } else if (cruising > want.cruising) {
        active.find((c) => !c.route).leaving = true;
        this._carTimer = 0.6;
      }
    }
    for (const c of this.cars) this.stepCar(c, dt);
    this.cars = this.cars.filter((c) => !c.dead);
  }

  // Pick a commute weighted by how many people make it. Mornings head to work, evenings home.
  spawnCommuter() {
    const flows = this.city.derived.labor?.flows;
    if (!flows || !flows.length) return false;
    const flow = pickWeighted(flows, (f) => (f.path.length > 1 ? f.count : 0));
    if (!flow) return false;
    const W = this.city.width;
    const homeward = this.city.clock > 0.55 || (this.city.clock > 0.42 && Math.random() < 0.5);
    const route = (homeward ? flow.path.slice().reverse() : flow.path).map((k) => ({ x: k % W, y: Math.floor(k / W) }));
    const [a, b] = route;
    this.cars.push({
      x: a.x,
      y: a.y,
      px: a.x,
      py: a.y,
      nx: b.x,
      ny: b.y,
      route,
      ri: 1,
      t: 0,
      speed: 1.1 + Math.random() * 0.5,
      color: pick(CAR_COLORS),
      alpha: 0,
      leaving: false,
      dead: false,
    });
    return true;
  }

  spawnCar() {
    const roads = this.city.tiles.filter((t) => t.roadMask);
    if (!roads.length) return;
    const start = pick(roads);
    const next = pick(this.city.roadNeighbors(start.x, start.y));
    this.cars.push({
      x: start.x,
      y: start.y,
      px: start.x,
      py: start.y,
      nx: next.x,
      ny: next.y,
      t: Math.random() * 0.5,
      speed: 0.9 + Math.random() * 0.5,
      color: pick(CAR_COLORS),
      alpha: 0,
      leaving: false,
      dead: false,
    });
  }

  stepCar(c, dt) {
    const city = this.city;
    if (!city.isRoad(c.x, c.y) || !city.isRoad(c.nx, c.ny)) c.leaving = true; // road was bulldozed under it
    c.alpha = c.leaving ? c.alpha - dt * 2.5 : Math.min(1, c.alpha + dt * 2);
    if (c.leaving && c.alpha <= 0) {
      c.dead = true;
      return;
    }
    if (!city.isRoad(c.nx, c.ny)) return;
    // Busy roads slow everyone down.
    const jam = city.getTile(c.x, c.y)?.congestion || 0;
    c.t += c.speed * (1 - 0.55 * jam) * dt;
    while (c.t >= 1) {
      c.t -= 1;
      c.px = c.x;
      c.py = c.y;
      c.x = c.nx;
      c.y = c.ny;
      if (c.route) {
        const next = c.route[++c.ri];
        if (!next || !city.isRoad(next.x, next.y)) {
          c.leaving = true; // arrived
          c.t = 0;
          c.nx = c.x + (c.x - c.px);
          c.ny = c.y + (c.y - c.py);
          if (!city.isRoad(c.nx, c.ny)) {
            c.nx = c.x;
            c.ny = c.y;
          }
          break;
        }
        c.nx = next.x;
        c.ny = next.y;
        continue;
      }
      const options = city.roadNeighbors(c.x, c.y).filter((n) => !(n.x === c.px && n.y === c.py));
      const next = options.length ? pick(options) : { x: c.px, y: c.py };
      if (!city.isRoad(next.x, next.y)) {
        c.leaving = true;
        c.t = 0;
        break;
      }
      c.nx = next.x;
      c.ny = next.y;
    }
  }

  // Grid-space pose of a car, keeping to the right-hand lane.
  carPose(c) {
    const dx = c.nx - c.x;
    const dy = c.ny - c.y;
    const lane = 0.16;
    return {
      gx: c.x + dx * c.t + 0.5 - dy * lane,
      gy: c.y + dy * c.t + 0.5 + dx * lane,
      dx,
      dy,
    };
  }

  // ---- Pedestrians -----------------------------------------------------

  desiredWalkers(daylight) {
    const pop = this.city.stats.population;
    const w = this.city.derived.weather;
    const shelter = 1 - 0.55 * (w?.rain || 0) - 0.4 * (w?.snow || 0);
    return Math.round(Math.min(MAX_WALKERS, pop / 4) * (0.15 + 0.85 * daylight) * shelter);
  }

  updateWalkers(dt, daylight) {
    const active = this.walkers.filter((w) => !w.leaving).length;
    if (active < this.desiredWalkers(daylight) && this._walkTimer <= 0) {
      this.spawnWalker();
      this._walkTimer = 0.45;
    }
    for (const w of this.walkers) this.stepWalker(w, dt);
    this.walkers = this.walkers.filter((w) => !w.dead);
  }

  spawnWalker() {
    const homes = this.city.homes().filter((h) => h.structure.residents > 0);
    const home = pickWeighted(homes, (h) => h.structure.residents);
    if (!home) return;
    const path = this.findOuting(home);
    if (!path) return;
    this.walkers.push({
      home: { x: home.x, y: home.y },
      path,
      i: 0,
      t: 0,
      state: 'out',
      wait: 0,
      speed: 0.5 + Math.random() * 0.3,
      ox: (Math.random() - 0.5) * 0.44,
      oy: (Math.random() - 0.5) * 0.44,
      shirt: pick(SHIRT_COLORS),
      skin: pick(SKIN_TONES),
      phase: Math.random() * Math.PI * 2,
      alpha: 0,
      gx: home.x + 0.5,
      gy: home.y + 0.5,
      moving: true,
      leaving: false,
      dead: false,
    });
  }

  // ---- The Life Story character ----------------------------------------------------

  // The character walks their real routes: to work by day if they have a job, otherwise out to a
  // park or playground, then home again. Babies stay in.
  updateHero(dt, daylight) {
    const c = this.city.systems.life?.char;
    const home = c?.alive && c.age >= 3 ? c.home : null;
    const h = this.hero;
    if (h && (h.dead || !home || h.home.x !== home.x || h.home.y !== home.y)) {
      if (!h.dead) h.leaving = true;
      this.hero = null;
      this._heroWait = 1.5;
    }
    if (this.hero || !home) return;
    this._heroWait -= dt;
    if (this._heroWait > 0) return;
    this._heroWait = 3 + Math.random() * 4;
    const homeTile = this.city.getTile(home.x, home.y);
    if (!homeTile?.structure) return;
    let path = null;
    let dest = null;
    if (c.job && daylight > 0.5 && Math.random() < 0.7) {
      path = this.pathTo(home, c.job);
      if (path) dest = c.job;
    }
    if (!path) path = this.findOuting(homeTile);
    if (!path || path.length < 2) return;
    const w = {
      home: { x: home.x, y: home.y },
      dest,
      path,
      i: 0,
      t: 0,
      state: 'out',
      wait: 0,
      speed: 0.85,
      ox: 0,
      oy: 0,
      shirt: c.look?.outfit || SHIRT_COLORS[0],
      skin: c.look?.skin || SKIN_TONES[0],
      hair: c.look?.hair || '#5b3a29',
      phase: 0,
      alpha: 0,
      gx: home.x + 0.5,
      gy: home.y + 0.5,
      moving: true,
      leaving: false,
      dead: false,
      hero: true,
      child: c.age < 13,
    };
    this.hero = w;
    this.walkers.push(w);
  }

  // A walking route from one building to another over walkable tiles (paths, parks, roadsides).
  pathTo(from, to) {
    const city = this.city;
    const key = (x, y) => y * city.width + x;
    const prev = new Map([[key(from.x, from.y), null]]);
    const queue = [{ x: from.x, y: from.y }];
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      for (const dir of DIRS) {
        const nx = cur.x + dir.dx;
        const ny = cur.y + dir.dy;
        const k = key(nx, ny);
        if (prev.has(k)) continue;
        const goal = nx === to.x && ny === to.y;
        if (!goal && !city.isWalkable(nx, ny)) continue;
        prev.set(k, cur);
        const n = { x: nx, y: ny };
        if (goal) {
          const path = [];
          for (let p = n; p; p = prev.get(key(p.x, p.y))) path.unshift({ x: p.x, y: p.y });
          return path;
        }
        queue.push(n);
      }
    }
    return null;
  }

  // Residents prefer parks, then trees, then any open ground within a short stroll.
  findOuting(home) {
    const city = this.city;
    const key = (x, y) => y * city.width + x;
    const prev = new Map([[key(home.x, home.y), null]]);
    const queue = [{ x: home.x, y: home.y, d: 0 }];
    const reachable = [];
    while (queue.length) {
      const cur = queue.shift();
      if (cur.d >= 9) continue;
      for (const dir of DIRS) {
        const nx = cur.x + dir.dx;
        const ny = cur.y + dir.dy;
        const k = key(nx, ny);
        if (prev.has(k) || !city.isWalkable(nx, ny)) continue;
        prev.set(k, cur);
        const n = { x: nx, y: ny, d: cur.d + 1 };
        queue.push(n);
        reachable.push(n);
      }
    }
    const dest = pickWeighted(reachable, (n) => {
      const type = city.getTile(n.x, n.y).structure?.type;
      if (type === 'park') return 8;
      if (type === 'playground') return 7;
      if (type === 'field') return 6;
      if (type === 'cafe') return 5;
      if (type === 'tree') return 2;
      if (type === 'road') return 0.15;
      return 0.4;
    });
    if (!dest) return null;
    const path = [];
    for (let n = dest; n; n = prev.get(key(n.x, n.y))) path.unshift({ x: n.x, y: n.y });
    return path;
  }

  stepWalker(w, dt) {
    const city = this.city;
    w.alpha = w.leaving ? w.alpha - dt * 2 : w.indoors ? w.alpha : Math.min(1, w.alpha + dt * 2);
    if (w.leaving && w.alpha <= 0) {
      w.dead = true;
      return;
    }
    if (w.state === 'linger') {
      w.moving = false;
      w.wait -= dt;
      const end = w.path[w.path.length - 1];
      if (w.indoors) {
        // The character is inside their workplace, hidden until it's time to head home.
        w.alpha = Math.max(0, w.alpha - dt * 3);
        w.gx = end.x + 0.5;
        w.gy = end.y + 0.5;
        if (w.wait > 0) return;
        w.indoors = false;
      } else {
        if (!city.isWalkable(end.x, end.y)) w.leaving = true; // something was built where they stood
        const drift = this.time * 0.35 + w.phase;
        w.gx = end.x + 0.5 + w.ox + Math.sin(drift) * 0.12;
        w.gy = end.y + 0.5 + w.oy + Math.cos(drift * 0.8) * 0.12;
        w.moving = Math.abs(Math.cos(drift)) > 0.4;
      }
      if (w.wait <= 0) {
        w.state = 'back';
        w.path = w.path.slice().reverse();
        w.i = 0;
        w.t = 0;
      }
      return;
    }
    const a = w.path[w.i];
    const b = w.path[w.i + 1];
    if (!b) {
      if (w.state === 'out') {
        const type = city.getTile(a.x, a.y)?.structure?.type;
        w.state = 'linger';
        w.wait = type === 'park' || type === 'playground' || type === 'field' ? 5 + Math.random() * 8 : 2 + Math.random() * 3;
        if (w.dest && a.x === w.dest.x && a.y === w.dest.y) {
          w.indoors = true; // a shift at work
          w.wait = 10 + Math.random() * 6;
        }
      } else {
        w.leaving = true; // home again
      }
      return;
    }
    const isHome = b.x === w.home.x && b.y === w.home.y;
    const isDest = !!w.dest && b.x === w.dest.x && b.y === w.dest.y;
    const fromDest = !!w.dest && a.x === w.dest.x && a.y === w.dest.y;
    if (!isHome && !isDest && !fromDest && !city.isWalkable(b.x, b.y)) {
      w.leaving = true;
      return;
    }
    w.moving = true;
    w.t += w.speed * dt;
    if (w.t >= 1) {
      w.t -= 1;
      w.i++;
    }
    const p = w.path[w.i];
    const q = w.path[w.i + 1] || p;
    // Fade the personal offset in and out so walkers leave and enter through the middle of a home.
    const atHomeEnd = (n) => n.x === w.home.x && n.y === w.home.y;
    const offsetScale = Math.min(1, (atHomeEnd(p) ? w.t : 1) * (atHomeEnd(q) ? 1 - w.t : 1) * 3);
    w.gx = p.x + (q.x - p.x) * w.t + 0.5 + w.ox * offsetScale;
    w.gy = p.y + (q.y - p.y) * w.t + 0.5 + w.oy * offsetScale;
  }
}

