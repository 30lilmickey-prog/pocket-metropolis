// Renderer: reads the city, agents and clock and draws the isometric diorama. It never changes city state.

import { PALETTE, BUILDING_VARIANTS, STRUCTURES } from './config.js';
import { HALF_W, HALF_H, gridToWorld, worldToGrid } from './iso.js';
import { lightingAt } from './lighting.js';
import { lit, litA, rgba } from './color.js';
import { clamp, hash2 } from './utils.js';

const SLAB_DEPTH = 18;
// Unlit lighting for the cached ground layer; the frame's real light is multiplied on afterwards.
const NEUTRAL_LIGHT = { ambient: [1, 1, 1], daylight: 1, windowLit: 0, lamps: 0, shadow: { alpha: 0 }, clock: 0.5 };
const GROUND_SCALES = [0.5, 0.75, 1, 1.5, 2, 3];
const MAX_GROUND_PX = 4096;
const FLOWER_COLORS = ['#fff4f7', '#ffd3df', '#fff0b3', '#e2d3f5'];

// Tile edges in N, E, S, W order (matching road mask bits). `n` points into the tile.
const EDGES = [
  { a: [0, 0], b: [1, 0], n: [0, 1] },
  { a: [1, 0], b: [1, 1], n: [-1, 0] },
  { a: [0, 1], b: [1, 1], n: [0, -1] },
  { a: [0, 0], b: [0, 1], n: [1, 0] },
];

function poly(ctx, pts) {
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const x = (p[0] - p[1]) * HALF_W;
    const y = (p[0] + p[1]) * HALF_H - (p[2] || 0);
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

function tilePoly(ctx, x, y, inset = 0) {
  poly(ctx, [
    [x + inset, y + inset],
    [x + 1 - inset, y + inset],
    [x + 1 - inset, y + 1 - inset],
    [x + inset, y + 1 - inset],
  ]);
}

function edgeStrip(x, y, e, w0, w1) {
  return [
    [x + e.a[0] + e.n[0] * w0, y + e.a[1] + e.n[1] * w0],
    [x + e.b[0] + e.n[0] * w0, y + e.b[1] + e.n[1] * w0],
    [x + e.b[0] + e.n[0] * w1, y + e.b[1] + e.n[1] * w1],
    [x + e.a[0] + e.n[0] * w1, y + e.a[1] + e.n[1] * w1],
  ];
}

function gridEllipse(ctx, gx, gy, z, r) {
  const p = gridToWorld(gx, gy, z);
  ctx.beginPath();
  ctx.ellipse(p.x, p.y, r * HALF_W * Math.SQRT2, r * HALF_H * Math.SQRT2, 0, 0, Math.PI * 2);
}

function convexHull(points) {
  const pts = points.slice().sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

// A soft round shadow drawn once and stamped under every building.
let contactCanvas = null;
function contactSprite() {
  if (contactCanvas) return contactCanvas;
  contactCanvas = document.createElement('canvas');
  contactCanvas.width = contactCanvas.height = 64;
  const c = contactCanvas.getContext('2d');
  const grad = c.createRadialGradient(32, 32, 9.6, 32, 32, 32);
  grad.addColorStop(0, 'rgba(52,44,96,0.26)');
  grad.addColorStop(1, 'rgba(52,44,96,0)');
  c.fillStyle = grad;
  c.fillRect(0, 0, 64, 64);
  return contactCanvas;
}

// Low → high: blush red, butter yellow, mint green.
function rampColor(v, alpha) {
  const t = Math.max(0, Math.min(1, v));
  const stops = [
    [0, [246, 140, 140]],
    [0.5, [255, 214, 120]],
    [1, [110, 200, 150]],
  ];
  const i = t < 0.5 ? 0 : 1;
  const [a0, c0] = stops[i];
  const [a1, c1] = stops[i + 1];
  const k = (t - a0) / (a1 - a0);
  const c = c0.map((v0, j) => Math.round(v0 + (c1[j] - v0) * k));
  return `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
}

export class Renderer {
  constructor(canvas, city, camera, agents) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.city = city;
    this.camera = camera;
    this.agents = agents;
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.time = 0;
    this.bounces = new Map();
    this.particles = [];
    this.glows = [];
    this.reduceMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.ground = { canvas: null, key: '' };
    city.on((ev) => this.onCityEvent(ev));
  }

  resize(w, h) {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
  }

  // ---- Event-driven effects ------------------------------------------------

  onCityEvent(ev) {
    const key = `${ev.x},${ev.y}`;
    switch (ev.type) {
      case 'placed': {
        const t = ev.structure.type;
        if (t === 'road' || t === 'park') this.ring(ev.x, ev.y, '#ffffff');
        if (t !== 'road') this.bounces.set(key, { start: this.time, delay: 0, kind: 'pop' });
        break;
      }
      case 'removed':
        this.bounces.delete(key);
        if (ev.wasWater) this.ring(ev.x, ev.y, '#ffffff');
        else this.dust(ev.x, ev.y, ev.previous?.type === 'tower' ? 16 : 10);
        break;
      case 'watered':
        this.bounces.delete(key);
        if (ev.previous) this.dust(ev.x, ev.y, 8);
        this.ring(ev.x, ev.y, PALETTE.water);
        this.ring(ev.x, ev.y, '#ffffff', 0.15);
        break;
      case 'movedIn':
        if (this.particles.filter((p) => p.kind === 'heart').length < 10) this.heart(ev.x, ev.y);
        break;
      case 'reset':
      case 'loaded':
        this.bounces.clear();
        this.particles.length = 0;
        if (this.reduceMotion) break;
        for (const t of this.city.tiles) {
          if (t.structure && t.structure.type !== 'road') {
            this.bounces.set(`${t.x},${t.y}`, {
              start: this.time,
              delay: (t.x + t.y) * 0.03 + hash2(t.x, t.y, 5) * 0.12,
              kind: 'pop',
            });
          }
        }
        break;
    }
  }

  nudge(x, y) {
    this.bounces.set(`${x},${y}`, { start: this.time, delay: 0, kind: 'wobble' });
  }

  dust(x, y, count) {
    const c = gridToWorld(x + 0.5, y + 0.5);
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.5;
      const sp = 14 + Math.random() * 22;
      this.particles.push({
        kind: 'dust',
        x: c.x + Math.cos(a) * 6,
        y: c.y + Math.sin(a) * 3 - 4,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp * 0.5 - 12,
        r: 3 + Math.random() * 3.5,
        age: 0,
        life: 0.7 + Math.random() * 0.35,
      });
    }
  }

  ring(x, y, color, delay = 0) {
    this.particles.push({ kind: 'ring', gx: x + 0.5, gy: y + 0.5, color, age: -delay, life: 0.6 });
  }

  heart(x, y) {
    const tile = this.city.getTile(x, y);
    const h = tile?.structure ? STRUCTURES[tile.structure.type].height : 20;
    const p = gridToWorld(x + 0.5, y + 0.5, h * (tile?.structure?.type === 'tower' ? (tile.structure.floors || 5) / 5 : 1) + 6);
    this.particles.push({ kind: 'heart', x: p.x + (Math.random() - 0.5) * 8, y: p.y, age: 0, life: 1.5 });
  }

  bounceFor(x, y) {
    const key = `${x},${y}`;
    const b = this.bounces.get(key);
    if (!b) return { sx: 1, sy: 1, hidden: false };
    const t = (this.time - b.start - b.delay) / (b.kind === 'wobble' ? 0.35 : 0.6);
    if (t < 0) return { sx: 1, sy: 1, hidden: true };
    if (t >= 1) {
      this.bounces.delete(key);
      return { sx: 1, sy: 1, hidden: false };
    }
    if (b.kind === 'wobble') {
      const s = Math.sin(t * 28) * 0.06 * (1 - t);
      return { sx: 1 + s, sy: 1 - s, hidden: false };
    }
    // Squash and stretch: grow from flat, overshoot tall and thin, settle.
    const sy = 1 - Math.exp(-5 * t) * Math.cos(9 * t);
    const sx = clamp(1 + (1 - sy) * 0.5, 0.86, 1.3);
    return { sx, sy: Math.max(0.02, sy), hidden: false };
  }

  // ---- Frame ----------------------------------------------------------------

  render(dt, view) {
    this.time += dt;
    const { ctx, camera: cam, city } = this;
    const L = lightingAt(city.clock);
    this.L = L;
    this.glows.length = 0;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawSky(ctx, L);

    const z = cam.zoom;
    ctx.setTransform(this.dpr * z, 0, 0, this.dpr * z, this.dpr * (this.w / 2 - cam.x * z), this.dpr * (this.h / 2 - cam.y * z));
    const rect = {
      left: cam.x - this.w / 2 / z - HALF_W,
      right: cam.x + this.w / 2 / z + HALF_W,
      top: cam.y - this.h / 2 / z - HALF_H,
      bottom: cam.y + this.h / 2 / z + 110,
    };
    const tiles = this.visibleTiles(rect);

    if (this.ensureGround()) {
      this.drawSlabShadow(ctx);
      this.drawCachedGround(ctx, L);
      for (const t of tiles) if (t.terrain === 'water') this.drawWaterMotion(ctx, t, L);
    } else {
      this.drawSlab(ctx, L);
      for (const t of tiles) this.drawGround(ctx, t, L);
    }
    if (view.overlay && view.overlay !== 'none') for (const t of tiles) this.drawOverlay(ctx, t, view.overlay);
    if (view.selected) this.drawSelected(ctx, view.selected);
    if (view.hover) this.drawHover(ctx, view.hover);
    for (const t of tiles) if (t.structure) this.drawShadow(ctx, t, L);

    // Everything with height is depth-sorted together: buildings, props, cars and people.
    const items = [];
    for (const t of tiles) {
      const s = t.structure;
      if (!s) continue;
      if (s.type === 'road') {
        const lamp = this.lampSpot(t);
        if (lamp) items.push({ d: lamp.gx + lamp.gy, kind: 'lamp', t, lamp });
      } else items.push({ d: t.x + t.y + 1, kind: s.type, t });
    }
    for (const c of this.agents.cars) {
      const pose = this.agents.carPose(c);
      items.push({ d: pose.gx + pose.gy + 0.05, kind: 'car', c, pose });
    }
    for (const w of this.agents.walkers) items.push({ d: w.gx + w.gy + 0.05, kind: 'walker', w });
    if (view.ghost) items.push({ d: view.ghost.x + view.ghost.y + 1.01, kind: 'ghost', ghost: view.ghost });
    items.sort((a, b) => a.d - b.d);
    for (const it of items) this.drawItem(ctx, it, L);
    this.drawLifePins(ctx, L);

    this.drawParticles(ctx, dt, L);
    this.drawGlows(ctx, L);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawVignette(ctx, L);
  }

  // Only walk the slice of the grid that can be on screen, so large maps stay cheap.
  visibleTiles(rect) {
    const city = this.city;
    const corners = [
      worldToGrid(rect.left, rect.top),
      worldToGrid(rect.right, rect.top),
      worldToGrid(rect.left, rect.bottom),
      worldToGrid(rect.right, rect.bottom),
    ];
    const gx0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.gx))));
    const gx1 = Math.min(city.width - 1, Math.ceil(Math.max(...corners.map((c) => c.gx))));
    const gy0 = Math.max(0, Math.floor(Math.min(...corners.map((c) => c.gy))));
    const gy1 = Math.min(city.height - 1, Math.ceil(Math.max(...corners.map((c) => c.gy))));
    const out = [];
    for (let y = gy0; y <= gy1; y++) {
      for (let x = gx0; x <= gx1; x++) {
        const c = gridToWorld(x + 0.5, y + 0.5);
        if (c.x < rect.left || c.x > rect.right || c.y < rect.top || c.y > rect.bottom) continue;
        out.push(city.tiles[y * city.width + x]);
      }
    }
    return out;
  }

  // ---- Backdrop ---------------------------------------------------------------

  drawSky(ctx, L) {
    const g = ctx.createLinearGradient(0, 0, 0, this.h);
    g.addColorStop(0, L.skyTop);
    g.addColorStop(1, L.skyBottom);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);

    const starAlpha = clamp(1 - L.daylight / 0.5, 0, 1);
    if (starAlpha > 0) {
      for (let i = 0; i < 60; i++) {
        const sx = hash2(i, 1, 9) * this.w;
        const sy = hash2(i, 2, 9) * this.h * 0.6;
        const tw = 0.6 + 0.4 * Math.sin(this.time * (0.8 + hash2(i, 3, 9)) + i);
        ctx.fillStyle = `rgba(255,248,235,${(starAlpha * tw * (0.35 + hash2(i, 4, 9) * 0.6)).toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 0.6 + hash2(i, 5, 9) * 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const cloudAlpha = 0.25 + 0.35 * L.daylight;
    for (let i = 0; i < 4; i++) {
      const speed = 6 + i * 2.5;
      const span = this.w + 360;
      const cx = ((hash2(i, 7, 3) * span + this.time * speed) % span) - 180;
      const cy = this.h * (0.07 + 0.11 * i);
      const s = 0.8 + hash2(i, 8, 3) * 0.7;
      ctx.fillStyle = L.daylight > 0.5 ? `rgba(255,255,255,${cloudAlpha})` : `rgba(220,214,245,${cloudAlpha * 0.6})`;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 46 * s, 14 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx - 22 * s, cy + 3, 26 * s, 11 * s, 0, 0, Math.PI * 2);
      ctx.ellipse(cx + 18 * s, cy - 8 * s, 24 * s, 15 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ---- Cached ground layer -------------------------------------------------------
  // Terrain, roads and lawns change only when the player edits the map, so they are drawn once
  // into an offscreen canvas at a resolution matched to the zoom. Returns false when the view is
  // zoomed in past what the cache can hold sharply; the caller then draws visible tiles live.
  ensureGround() {
    const city = this.city;
    const W = city.width;
    const H = city.height;
    const worldW = (W + H) * HALF_W;
    const worldH = (W + H) * HALF_H + SLAB_DEPTH + 4;
    const cap = Math.min(MAX_GROUND_PX / worldW, MAX_GROUND_PX / worldH);
    const want = this.camera.zoom * this.dpr;
    if (want > cap * 1.05) return false;
    const scale = Math.min(cap, GROUND_SCALES.find((s) => s >= want * 0.95) || cap);
    const key = `${city.revision}|${W}x${H}|${scale.toFixed(3)}`;
    if (this.ground.key === key) return true;
    const g = this.ground;
    if (!g.canvas) g.canvas = document.createElement('canvas');
    g.canvas.width = Math.ceil(worldW * scale);
    g.canvas.height = Math.ceil(worldH * scale);
    g.left = -H * HALF_W;
    g.top = 0;
    g.scale = scale;
    const c = g.canvas.getContext('2d');
    c.setTransform(scale, 0, 0, scale, -g.left * scale, -g.top * scale);
    c.clearRect(g.left, g.top, worldW, worldH);
    this._caching = true;
    this.drawSlab(c, NEUTRAL_LIGHT, false);
    for (const t of city.tiles) this.drawGround(c, t, NEUTRAL_LIGHT);
    this._caching = false;
    g.key = key;
    return true;
  }

  drawCachedGround(ctx, L) {
    const g = this.ground;
    const W = this.city.width;
    const H = this.city.height;
    ctx.drawImage(g.canvas, g.left, g.top, g.canvas.width / g.scale, g.canvas.height / g.scale);
    const a = L.ambient;
    if (a[0] > 0.995 && a[1] > 0.995 && a[2] > 0.995) return;
    // Apply the frame's light to the whole board in one multiply pass.
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    const ch = (v) => Math.round(Math.min(1, v) * 255);
    ctx.fillStyle = `rgb(${ch(a[0])},${ch(a[1])},${ch(a[2])})`;
    poly(ctx, [
      [0, 0, 0],
      [W, 0, 0],
      [W, 0, -SLAB_DEPTH],
      [W, H, -SLAB_DEPTH],
      [0, H, -SLAB_DEPTH],
      [0, H, 0],
    ]);
    ctx.fill();
    ctx.restore();
  }

  // Animated parts of water that can't live in the cache.
  drawWaterMotion(ctx, t, L) {
    if (this.camera.zoom < 0.5) return;
    const { x, y } = t;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 2; i++) {
      const ph = this.time * (0.7 + hash2(x, y, 70 + i) * 0.6) + hash2(x, y, 80 + i) * 6.28;
      const a = (Math.sin(ph) * 0.5 + 0.5) * (L.daylight > 0.3 ? 0.6 : 0.35);
      const p = gridToWorld(x + 0.25 + hash2(x, y, 90 + i) * 0.5, y + 0.25 + hash2(x, y, 95 + i) * 0.5);
      const drift = Math.sin(ph * 0.5) * 2;
      ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(p.x - 4 + drift, p.y);
      ctx.lineTo(p.x + 4 + drift, p.y);
      ctx.stroke();
    }
  }

  drawSlabShadow(ctx) {
    const W = this.city.width;
    const H = this.city.height;
    const D = SLAB_DEPTH;
    for (const [pad, a] of [
      [0.9, 0.05],
      [0.45, 0.07],
    ]) {
      ctx.fillStyle = `rgba(60,48,110,${a})`;
      poly(ctx, [
        [-pad, -pad, -D - 10],
        [W + pad, -pad, -D - 10],
        [W + pad, H + pad, -D - 10],
        [-pad, H + pad, -D - 10],
      ]);
      ctx.fill();
    }
  }

  drawSlab(ctx, L, withShadow = true) {
    const W = this.city.width;
    const H = this.city.height;
    const D = SLAB_DEPTH;
    // Soft drop shadow so the board floats like a diorama.
    if (withShadow) this.drawSlabShadow(ctx);
    const yTop = gridToWorld(W, H).y;
    const left = ctx.createLinearGradient(0, yTop - (W + H) * HALF_H * 0.5, 0, yTop + D);
    left.addColorStop(0, lit(PALETTE.earth, 0.95, L));
    left.addColorStop(1, lit(PALETTE.earthDark, 0.88, L));
    ctx.fillStyle = left;
    poly(ctx, [
      [0, H, 0],
      [W, H, 0],
      [W, H, -D],
      [0, H, -D],
    ]);
    ctx.fill();
    const right = ctx.createLinearGradient(0, yTop - (W + H) * HALF_H * 0.5, 0, yTop + D);
    right.addColorStop(0, lit(PALETTE.earth, 0.8, L));
    right.addColorStop(1, lit(PALETTE.earthDark, 0.72, L));
    ctx.fillStyle = right;
    poly(ctx, [
      [W, H, 0],
      [W, 0, 0],
      [W, 0, -D],
      [W, H, -D],
    ]);
    ctx.fill();
    // Turf lip along the top edge of the slab.
    ctx.fillStyle = lit(PALETTE.grass, 0.78, L);
    poly(ctx, [
      [0, H, 0],
      [W, H, 0],
      [W, H, -4],
      [0, H, -4],
    ]);
    ctx.fill();
    ctx.fillStyle = lit(PALETTE.grass, 0.66, L);
    poly(ctx, [
      [W, H, 0],
      [W, 0, 0],
      [W, 0, -4],
      [W, H, -4],
    ]);
    ctx.fill();
    // Fill the top under the tiles so antialiased seams show grass, not the sky.
    ctx.fillStyle = lit(PALETTE.grass, 0.97, L);
    poly(ctx, [
      [0, 0],
      [W, 0],
      [W, H],
      [0, H],
    ]);
    ctx.fill();
  }

  drawVignette(ctx, L) {
    const r = Math.max(this.w, this.h);
    const g = ctx.createRadialGradient(this.w / 2, this.h / 2, r * 0.3, this.w / 2, this.h / 2, r * 0.78);
    g.addColorStop(0, 'rgba(70,58,120,0)');
    g.addColorStop(1, `rgba(70,58,120,${(0.1 + 0.12 * (1 - L.daylight)).toFixed(3)})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.w, this.h);
  }

  // ---- Ground layer -------------------------------------------------------------

  drawGround(ctx, t, L) {
    const { x, y } = t;
    if (t.terrain === 'water') return this.drawWater(ctx, t, L);
    const s = t.structure;
    if (s?.type === 'road') return this.drawRoad(ctx, t, L);
    ctx.fillStyle = lit(PALETTE.grass, 0.97 + hash2(x, y, 1) * 0.06, L);
    tilePoly(ctx, x, y);
    ctx.fill();
    if (s?.type === 'park') this.drawParkGround(ctx, t, L);
    else if (!s) this.drawMeadow(ctx, t, L);
  }

  drawMeadow(ctx, t, L) {
    const { x, y } = t;
    ctx.strokeStyle = lit(PALETTE.grass, 0.8, L);
    ctx.lineWidth = 0.9;
    ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      if (hash2(x, y, 20 + i) > 0.55) continue;
      const p = gridToWorld(x + 0.15 + hash2(x, y, 30 + i) * 0.7, y + 0.15 + hash2(x, y, 40 + i) * 0.7);
      ctx.beginPath();
      ctx.moveTo(p.x - 2, p.y - 2.5);
      ctx.lineTo(p.x - 0.5, p.y);
      ctx.lineTo(p.x + 0.5, p.y - 3);
      ctx.lineTo(p.x + 1.5, p.y);
      ctx.lineTo(p.x + 3, p.y - 2);
      ctx.stroke();
    }
    if (hash2(x, y, 3) < 0.3) {
      for (let i = 0; i < 4; i++) {
        const p = gridToWorld(x + 0.15 + hash2(x, y, 50 + i) * 0.7, y + 0.15 + hash2(x, y, 60 + i) * 0.7);
        ctx.fillStyle = lit(FLOWER_COLORS[(i + x + y) % FLOWER_COLORS.length], 1, L);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawWater(ctx, t, L) {
    const { x, y } = t;
    const city = this.city;
    ctx.fillStyle = lit(PALETTE.water, 1, L);
    tilePoly(ctx, x, y);
    ctx.fill();
    // Slightly deeper centre where the tile is surrounded by water.
    let wet = 0;
    EDGES.forEach((e, i) => {
      const n = city.getTile(x + [0, 1, 0, -1][i], y + [-1, 0, 1, 0][i]);
      if (!n || n.terrain === 'water') wet++;
    });
    if (wet >= 3) {
      ctx.fillStyle = lit(PALETTE.water, 0.93, L);
      gridEllipse(ctx, x + 0.5, y + 0.5, 0, 0.28);
      ctx.fill();
    }
    // Sandy bank and foam on edges that meet land.
    EDGES.forEach((e, i) => {
      const n = city.getTile(x + [0, 1, 0, -1][i], y + [-1, 0, 1, 0][i]);
      if (!n || n.terrain === 'water') return;
      ctx.fillStyle = lit(PALETTE.sand, 1, L);
      poly(ctx, edgeStrip(x, y, e, 0, 0.09));
      ctx.fill();
      ctx.fillStyle = litA('#ffffff', 1, L, 0.55);
      poly(ctx, edgeStrip(x, y, e, 0.09, this._caching ? 0.13 : 0.13 + Math.sin(this.time * 1.6 + x + y) * 0.02));
      ctx.fill();
    });
    // Shimmer.
    if (this._caching || this.camera.zoom < 0.5) return;
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 2; i++) {
      const ph = this.time * (0.7 + hash2(x, y, 70 + i) * 0.6) + hash2(x, y, 80 + i) * 6.28;
      const a = (Math.sin(ph) * 0.5 + 0.5) * (L.daylight > 0.3 ? 0.6 : 0.35);
      const p = gridToWorld(x + 0.25 + hash2(x, y, 90 + i) * 0.5, y + 0.25 + hash2(x, y, 95 + i) * 0.5);
      const drift = Math.sin(ph * 0.5) * 2;
      ctx.strokeStyle = `rgba(255,255,255,${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(p.x - 4 + drift, p.y);
      ctx.lineTo(p.x + 4 + drift, p.y);
      ctx.stroke();
    }
  }

  drawRoad(ctx, t, L) {
    const { x, y, roadMask: m } = t;
    ctx.fillStyle = lit(PALETTE.road, 0.98 + hash2(x, y, 2) * 0.03, L);
    tilePoly(ctx, x, y);
    ctx.fill();
    EDGES.forEach((e, i) => {
      if (m & (1 << i)) return;
      ctx.fillStyle = lit(PALETTE.sidewalk, 1.02, L);
      poly(ctx, edgeStrip(x, y, e, 0, 0.15));
      ctx.fill();
      ctx.fillStyle = lit(PALETTE.road, 0.86, L);
      poly(ctx, edgeStrip(x, y, e, 0.15, 0.18));
      ctx.fill();
    });
    // Lane markings follow the connections.
    ctx.strokeStyle = lit(PALETTE.marking, 1, L);
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'butt';
    ctx.setLineDash([3.5, 3.5]);
    const c = gridToWorld(x + 0.5, y + 0.5);
    const mids = [
      [x + 0.5, y],
      [x + 1, y + 0.5],
      [x + 0.5, y + 1],
      [x, y + 0.5],
    ];
    ctx.beginPath();
    if (m === 5 || m === 10) {
      const a = gridToWorld(...mids[m === 5 ? 0 : 3]);
      const b = gridToWorld(...mids[m === 5 ? 2 : 1]);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    } else {
      for (let i = 0; i < 4; i++) {
        if (!(m & (1 << i))) continue;
        const p = gridToWorld(...mids[i]);
        ctx.moveTo(c.x, c.y);
        ctx.lineTo(p.x, p.y);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // Zebra crossing on busy junctions.
    const links = [1, 2, 4, 8].filter((b) => m & b).length;
    if (links >= 3) {
      ctx.fillStyle = litA(PALETTE.marking, 1, L, 0.85);
      for (let k = 0; k < 3; k++) {
        const off = 0.3 + k * 0.2;
        poly(ctx, [
          [x + off - 0.05, y + 0.06],
          [x + off + 0.05, y + 0.06],
          [x + off + 0.05, y + 0.16],
          [x + off - 0.05, y + 0.16],
        ]);
        ctx.fill();
      }
    }
  }

  drawParkGround(ctx, t, L) {
    const { x, y } = t;
    const city = this.city;
    ctx.fillStyle = lit(PALETTE.parkGrass, 1, L);
    tilePoly(ctx, x, y, 0.04);
    ctx.fill();
    // Paths run to the edge where they meet another park or a road.
    const opens = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ].map(([dx, dy]) => {
      const n = city.getTile(x + dx, y + dy);
      return !!n && (n.structure?.type === 'park' || n.structure?.type === 'road');
    });
    ctx.fillStyle = lit(PALETTE.path, 1, L);
    const w = 0.07;
    poly(ctx, [
      [x + 0.5 - w, y + (opens[0] ? 0 : 0.2)],
      [x + 0.5 + w, y + (opens[0] ? 0 : 0.2)],
      [x + 0.5 + w, y + (opens[2] ? 1 : 0.8)],
      [x + 0.5 - w, y + (opens[2] ? 1 : 0.8)],
    ]);
    ctx.fill();
    poly(ctx, [
      [x + (opens[3] ? 0 : 0.2), y + 0.5 - w],
      [x + (opens[1] ? 1 : 0.8), y + 0.5 - w],
      [x + (opens[1] ? 1 : 0.8), y + 0.5 + w],
      [x + (opens[3] ? 0 : 0.2), y + 0.5 + w],
    ]);
    ctx.fill();
    gridEllipse(ctx, x + 0.5, y + 0.5, 0, 0.2);
    ctx.fill();
    for (let i = 0; i < 6; i++) {
      const q = i % 4;
      const gx = x + (q === 0 || q === 3 ? 0.22 : 0.78) + (hash2(x, y, 100 + i) - 0.5) * 0.12;
      const gy = y + (q < 2 ? 0.22 : 0.78) + (hash2(x, y, 110 + i) - 0.5) * 0.12;
      const p = gridToWorld(gx, gy);
      ctx.fillStyle = lit(FLOWER_COLORS[(i + x) % FLOWER_COLORS.length], 1, L);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Data views tint the ground so buildings stay readable on top.
  drawOverlay(ctx, t, overlay) {
    let color = null;
    if (overlay === 'desirability') {
      if (t.terrain === 'water' || t.roadMask || t.structure?.type === 'road') return;
      color = rampColor(t.desirability, 0.62);
    } else if (overlay === 'traffic') {
      if (t.structure?.type !== 'road') {
        color = 'rgba(70,60,110,0.28)';
      } else {
        color = t.congestion < 0.02 ? 'rgba(255,255,255,0.35)' : rampColor(1 - t.congestion, 0.8);
      }
    } else if (overlay === 'services') {
      if (t.terrain === 'water') return;
      const c = t.coverage || {};
      const school = c.school || 0;
      const health = c.health || 0;
      if (school < 0.02 && health < 0.02) color = 'rgba(70,60,110,0.22)';
      else {
        // Schools tint lavender, clinics tint mint; both together read as a soft blue-violet.
        const r = Math.round(200 - 60 * health);
        const g = Math.round(180 + 40 * health - 20 * school);
        const b = Math.round(200 + 40 * school);
        color = `rgba(${r},${g},${b},${(0.25 + 0.45 * Math.max(school, health)).toFixed(3)})`;
      }
    }
    if (!color) return;
    ctx.fillStyle = color;
    tilePoly(ctx, t.x, t.y);
    ctx.fill();
  }

  drawSelected(ctx, sel) {
    const z = this.camera.zoom;
    const pulse = 0.6 + 0.4 * Math.sin(this.time * 4);
    ctx.lineWidth = 2.2 / z;
    ctx.setLineDash([5 / z, 4 / z]);
    ctx.lineDashOffset = -this.time * 12;
    ctx.strokeStyle = `rgba(255,255,255,${pulse.toFixed(3)})`;
    tilePoly(ctx, sel.x, sel.y, -0.02);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawHover(ctx, hover) {
    const z = this.camera.zoom;
    ctx.lineWidth = 1.6 / z;
    tilePoly(ctx, hover.x, hover.y, 0.02);
    const warn = hover.tool === 'bulldoze' || (!hover.valid && hover.tool !== 'inspect');
    ctx.fillStyle = warn ? 'rgba(255,143,128,0.22)' : 'rgba(255,255,255,0.28)';
    ctx.strokeStyle = warn ? 'rgba(255,128,112,0.95)' : 'rgba(255,255,255,0.95)';
    ctx.fill();
    ctx.stroke();
  }

  // ---- Shadows and ambient occlusion ------------------------------------------

  footprint(t) {
    const s = t.structure;
    if (s.type === 'house') return { inset: 0.2, h: 27 };
    if (s.type === 'tower') return { inset: 0.16, h: 6 + (s.floors || 5) * 11 };
    if (s.type === 'tree') return { inset: 0.32, h: 24, round: true };
    if (s.type === 'shop') return { inset: 0.16, h: 22 };
    if (s.type === 'office') return { inset: 0.14, h: 8 + (s.floors || 4) * 12 };
    if (s.type === 'school') return { inset: 0.12, h: 26 };
    if (s.type === 'clinic') return { inset: 0.15, h: 24 };
    return null;
  }

  drawShadow(ctx, t, L) {
    const f = this.footprint(t);
    if (!f) return;
    const b = this.bounceFor(t.x, t.y);
    if (b.hidden) return;
    const { x, y } = t;
    const g = gridToWorld(x + 0.5, y + 0.5);
    // Contact shadow: always present, anchors the object to the ground.
    const r = (1 - f.inset * 2) * HALF_W * 1.25 * b.sx;
    ctx.drawImage(contactSprite(), g.x - r, g.y - r / 2, r * 2, r);

    const sh = L.shadow;
    if (sh.alpha < 0.01) return;
    const h = f.h * b.sy;
    ctx.fillStyle = `rgba(64,58,120,${sh.alpha.toFixed(3)})`;
    if (f.round) {
      gridEllipse(ctx, x + 0.5 + sh.dx * h * 0.75, y + 0.5 + sh.dy * h * 0.75, 0, 0.22);
      ctx.fill();
      return;
    }
    const i0 = f.inset;
    const pts = [];
    for (const [gx, gy] of [
      [x + i0, y + i0],
      [x + 1 - i0, y + i0],
      [x + 1 - i0, y + 1 - i0],
      [x + i0, y + 1 - i0],
    ]) {
      pts.push(gridToWorld(gx, gy));
      pts.push(gridToWorld(gx + sh.dx * h, gy + sh.dy * h));
    }
    const hull = convexHull(pts);
    ctx.beginPath();
    hull.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
  }

  // ---- Depth-sorted objects -------------------------------------------------------

  drawItem(ctx, it, L) {
    if (it.kind === 'car') return this.drawCar(ctx, it.c, it.pose, L);
    if (it.kind === 'walker') return this.drawWalker(ctx, it.w, L);
    if (it.kind === 'lamp') return this.drawLamp(ctx, it.lamp, L);
    if (it.kind === 'ghost') {
      ctx.save();
      ctx.globalAlpha = 0.5;
      this.drawStructure(ctx, it.ghost.x, it.ghost.y, it.ghost.structure, L, true);
      ctx.restore();
      return;
    }
    const t = it.t;
    const b = this.bounceFor(t.x, t.y);
    if (b.hidden) return;
    const c = gridToWorld(t.x + 0.5, t.y + 0.5);
    ctx.save();
    if (b.sx !== 1 || b.sy !== 1) {
      ctx.translate(c.x, c.y);
      ctx.scale(b.sx, b.sy);
      ctx.translate(-c.x, -c.y);
    }
    this.drawStructure(ctx, t.x, t.y, t.structure, L, false);
    ctx.restore();
  }

  drawStructure(ctx, x, y, s, L, ghost) {
    switch (s.type) {
      case 'house':
        return this.drawHouse(ctx, x, y, s, L, ghost);
      case 'tower':
        return this.drawTower(ctx, x, y, s, L, ghost);
      case 'shop':
        return this.drawShop(ctx, x, y, s, L, ghost);
      case 'office':
        return this.drawOffice(ctx, x, y, s, L, ghost);
      case 'school':
        return this.drawSchool(ctx, x, y, s, L, ghost);
      case 'clinic':
        return this.drawClinic(ctx, x, y, s, L, ghost);
      case 'tree':
        return this.drawTree(ctx, x + 0.5, y + 0.5, s.shape || 0, L, hash2(x, y, 12) * 6.28, 1);
      case 'park':
        return this.drawParkProps(ctx, x, y, L);
      case 'road':
        if (ghost) {
          ctx.fillStyle = lit(PALETTE.road, 1, L);
          tilePoly(ctx, x, y, 0.04);
          ctx.fill();
        }
        return;
    }
  }

  // A box with soft ambient occlusion toward the ground on both visible faces.
  drawBox(ctx, L, x0, y0, x1, y1, z, h, color, top = true) {
    const ao = Math.min(h, 16);
    const face = (pts, shade, baseY) => {
      const g = ctx.createLinearGradient(0, baseY, 0, baseY - ao);
      g.addColorStop(0, lit(color, shade * 0.8, L));
      g.addColorStop(1, lit(color, shade, L));
      ctx.fillStyle = g;
      poly(ctx, pts);
      ctx.fill();
    };
    face(
      [
        [x0, y1, z],
        [x1, y1, z],
        [x1, y1, z + h],
        [x0, y1, z + h],
      ],
      0.92,
      gridToWorld((x0 + x1) / 2, y1, z).y
    );
    face(
      [
        [x1, y1, z],
        [x1, y0, z],
        [x1, y0, z + h],
        [x1, y1, z + h],
      ],
      0.78,
      gridToWorld(x1, (y0 + y1) / 2, z).y
    );
    if (top) {
      ctx.fillStyle = lit(color, 1.05, L);
      poly(ctx, [
        [x0, y0, z + h],
        [x1, y0, z + h],
        [x1, y1, z + h],
        [x0, y1, z + h],
      ]);
      ctx.fill();
    }
    // Soft highlight on the near edges, like light catching a painted model.
    ctx.strokeStyle = `rgba(255,255,255,${(0.18 + 0.22 * L.daylight).toFixed(3)})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    const a = gridToWorld(x0, y1, z + h);
    const b = gridToWorld(x1, y1, z + h);
    const c = gridToWorld(x1, y0, z + h);
    const d = gridToWorld(x1, y1, z);
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(d.x, d.y);
    ctx.stroke();
  }

  // Quad on the left (+y) or right (+x) face of a box, in face-relative u (0..1) and height v (px).
  faceQuad(face, x0, y0, x1, y1, u0, u1, v0, v1) {
    if (face === 'L') {
      const gx = (u) => x0 + (x1 - x0) * u;
      return [
        [gx(u0), y1, v0],
        [gx(u1), y1, v0],
        [gx(u1), y1, v1],
        [gx(u0), y1, v1],
      ];
    }
    const gy = (u) => y1 - (y1 - y0) * u;
    return [
      [x1, gy(u0), v0],
      [x1, gy(u1), v0],
      [x1, gy(u1), v1],
      [x1, gy(u0), v1],
    ];
  }

  drawWindow(ctx, L, pts, shade, isLit) {
    poly(ctx, pts);
    if (isLit) {
      ctx.fillStyle = PALETTE.windowLit;
      ctx.fill();
      const p = pts[0];
      const q = pts[2];
      const c = gridToWorld((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2);
      this.glows.push({ x: c.x, y: c.y, r: 7, a: 0.22, rgb: '255,214,140' });
    } else {
      ctx.fillStyle = lit(PALETTE.glass, shade, L);
      ctx.fill();
    }
  }

  isWindowLit(x, y, i, occupancy, L) {
    if (L.windowLit < 0.02 || occupancy <= 0) return false;
    const chance = L.windowLit * clamp(0.25 + occupancy, 0, 1);
    return hash2(x * 7 + i, y * 13 + (this.city.day % 4), 11) < chance;
  }

  drawHouse(ctx, x, y, s, L, ghost) {
    const v = BUILDING_VARIANTS[s.variant] || BUILDING_VARIANTS.peach;
    const x0 = x + 0.2;
    const x1 = x + 0.8;
    const y0 = y + 0.22;
    const y1 = y + 0.78;
    const h = 15;
    const rh = 12;
    const o = 0.05;
    const xm = (x0 + x1) / 2;
    const occ = ghost ? 0 : s.residents / STRUCTURES.house.capacity;
    this.drawBox(ctx, L, x0, y0, x1, y1, 0, h, v.wall, false);

    ctx.fillStyle = lit(v.roof, 0.72, L);
    poly(ctx, this.faceQuad('L', x0, y0, x1, y1, 0.6, 0.8, 0, 9));
    ctx.fill();
    this.drawWindow(ctx, L, this.faceQuad('L', x0, y0, x1, y1, 0.16, 0.4, 5, 11), 0.92, this.isWindowLit(x, y, 0, occ, L));
    this.drawWindow(ctx, L, this.faceQuad('R', x0, y0, x1, y1, 0.16, 0.4, 5, 11), 0.8, this.isWindowLit(x, y, 1, occ, L));
    this.drawWindow(ctx, L, this.faceQuad('R', x0, y0, x1, y1, 0.6, 0.84, 5, 11), 0.8, this.isWindowLit(x, y, 2, occ, L));

    // Gable end, then the two roof slopes with a small overhang.
    ctx.fillStyle = lit(v.wall, 0.92, L);
    poly(ctx, [
      [x0, y1, h],
      [x1, y1, h],
      [xm, y1, h + rh],
    ]);
    ctx.fill();
    ctx.fillStyle = lit(v.roof, 1.05, L);
    poly(ctx, [
      [x0 - o, y0 - o, h],
      [x0 - o, y1 + o, h],
      [xm, y1 + o, h + rh],
      [xm, y0 - o, h + rh],
    ]);
    ctx.fill();
    ctx.fillStyle = lit(v.roof, 0.82, L);
    poly(ctx, [
      [x1 + o, y0 - o, h],
      [x1 + o, y1 + o, h],
      [xm, y1 + o, h + rh],
      [xm, y0 - o, h + rh],
    ]);
    ctx.fill();
    // Chimney sitting on the right slope.
    const cx0 = xm + 0.08;
    const cx1 = xm + 0.16;
    const base = h + rh * (1 - (cx1 - xm) / (x1 + o - xm));
    this.drawBox(ctx, L, cx0, y0 + 0.06, cx1, y0 + 0.14, base - 1, 6 + rh * 0.2, v.trim);
    // Ridge and eave lines.
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = `rgba(255,255,255,${(0.25 + 0.25 * L.daylight).toFixed(3)})`;
    ctx.beginPath();
    const r0 = gridToWorld(xm, y0 - o, h + rh);
    const r1 = gridToWorld(xm, y1 + o, h + rh);
    ctx.moveTo(r0.x, r0.y);
    ctx.lineTo(r1.x, r1.y);
    ctx.stroke();
    ctx.strokeStyle = lit(v.roof, 0.66, L);
    ctx.beginPath();
    const e0 = gridToWorld(x0 - o, y1 + o, h);
    const e1 = gridToWorld(x1 + o, y1 + o, h);
    ctx.moveTo(e0.x, e0.y);
    ctx.lineTo(r1.x, r1.y);
    ctx.lineTo(e1.x, e1.y);
    ctx.stroke();
  }

  drawTower(ctx, x, y, s, L, ghost) {
    const v = BUILDING_VARIANTS[s.variant] || BUILDING_VARIANTS.lavender;
    const floors = s.floors || 5;
    const x0 = x + 0.16;
    const x1 = x + 0.84;
    const y0 = y + 0.16;
    const y1 = y + 0.84;
    const fh = 11;
    const h = 6 + floors * fh;
    const occ = ghost ? 0 : s.residents / STRUCTURES.tower.capacity;
    this.drawBox(ctx, L, x0, y0, x1, y1, 0, h, v.wall, false);

    // Plinth band.
    ctx.fillStyle = lit(v.roof, 0.85, L);
    poly(ctx, this.faceQuad('L', x0, y0, x1, y1, 0, 1, 0, 4));
    ctx.fill();
    ctx.fillStyle = lit(v.roof, 0.72, L);
    poly(ctx, this.faceQuad('R', x0, y0, x1, y1, 0, 1, 0, 4));
    ctx.fill();

    let wi = 0;
    for (let f = 0; f < floors; f++) {
      const v0 = 8 + f * fh;
      for (const face of ['L', 'R']) {
        for (let k = 0; k < 3; k++) {
          const u0 = 0.1 + k * 0.3;
          if (f === 0 && face === 'L' && k === 1) {
            ctx.fillStyle = lit(v.roof, 0.72, L);
            poly(ctx, this.faceQuad('L', x0, y0, x1, y1, u0, u0 + 0.2, 0, 9));
            ctx.fill();
            continue;
          }
          const pts = this.faceQuad(face, x0, y0, x1, y1, u0, u0 + 0.2, v0, v0 + 6);
          this.drawWindow(ctx, L, pts, face === 'L' ? 0.92 : 0.8, this.isWindowLit(x, y, wi++, occ, L));
        }
      }
    }

    // Roof deck with a parapet rim and a small rooftop unit.
    ctx.fillStyle = lit(v.trim, 1, L);
    poly(ctx, [
      [x0, y0, h],
      [x1, y0, h],
      [x1, y1, h],
      [x0, y1, h],
    ]);
    ctx.fill();
    ctx.fillStyle = lit(v.wall, 0.95, L);
    poly(ctx, [
      [x0 + 0.05, y0 + 0.05, h],
      [x1 - 0.05, y0 + 0.05, h],
      [x1 - 0.05, y1 - 0.05, h],
      [x0 + 0.05, y1 - 0.05, h],
    ]);
    ctx.fill();
    this.drawBox(ctx, L, x0 + 0.12, y0 + 0.12, x0 + 0.32, y0 + 0.3, h, 5, v.trim);
    if (floors >= 6) {
      const a = gridToWorld(x1 - 0.15, y1 - 0.15, h);
      ctx.strokeStyle = lit(PALETTE.pole, 1, L);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x, a.y - 12);
      ctx.stroke();
      ctx.fillStyle = L.daylight < 0.5 && Math.sin(this.time * 3) > 0 ? '#ff8f8f' : lit('#f3a5a5', 1, L);
      ctx.beginPath();
      ctx.arc(a.x, a.y - 12, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  workFill(x, y, s, ghost) {
    if (ghost) return 0;
    const t = this.city.getTile(x, y);
    return t ? t.workersFilled / STRUCTURES[s.type].jobs : 0;
  }

  // Shops stay lit through the evening and close late at night.
  shopOpen(L) {
    const c = L.clock;
    return c > 0.29 && c < 0.92;
  }

  drawShop(ctx, x, y, s, L, ghost) {
    const v = BUILDING_VARIANTS[s.variant] || BUILDING_VARIANTS.mint;
    const x0 = x + 0.16;
    const x1 = x + 0.84;
    const y0 = y + 0.2;
    const y1 = y + 0.8;
    const h = 16;
    const fill = this.workFill(x, y, s, ghost);
    this.drawBox(ctx, L, x0, y0, x1, y1, 0, h, v.wall);
    // Shop window: warm when open after dark.
    const open = !ghost && fill > 0 && this.shopOpen(L) && L.windowLit > 0.05;
    this.drawWindow(ctx, L, this.faceQuad('L', x0, y0, x1, y1, 0.08, 0.62, 2.5, 9.5), 0.92, open);
    ctx.fillStyle = lit(v.roof, 0.72, L);
    poly(ctx, this.faceQuad('L', x0, y0, x1, y1, 0.7, 0.9, 0, 9.5));
    ctx.fill();
    this.drawWindow(ctx, L, this.faceQuad('R', x0, y0, x1, y1, 0.2, 0.8, 4, 10), 0.8, open && hash2(x, y, 31) < 0.7);
    // Striped awning over the storefront.
    const segs = 5;
    for (let i = 0; i < segs; i++) {
      const a = x0 + ((x1 - x0) * i) / segs;
      const b = x0 + ((x1 - x0) * (i + 1)) / segs;
      ctx.fillStyle = lit(i % 2 ? v.trim : v.roof, i % 2 ? 1 : 0.95, L);
      poly(ctx, [
        [a, y1, 12],
        [b, y1, 12],
        [b, y1 + 0.12, 8.5],
        [a, y1 + 0.12, 8.5],
      ]);
      ctx.fill();
    }
    // Rooftop sign.
    this.drawBox(ctx, L, x0 + 0.12, y1 - 0.1, x1 - 0.12, y1 - 0.04, h, 6, v.trim);
    ctx.fillStyle = lit(v.roof, 0.85, L);
    poly(ctx, this.faceQuad('L', x0 + 0.12, y1 - 0.1, x1 - 0.12, y1 - 0.04, 0.12, 0.88, h + 1.6, h + 4.4));
    ctx.fill();
  }

  drawOffice(ctx, x, y, s, L, ghost) {
    const v = BUILDING_VARIANTS[s.variant] || BUILDING_VARIANTS.lavender;
    const floors = s.floors || 4;
    const x0 = x + 0.14;
    const x1 = x + 0.86;
    const y0 = y + 0.14;
    const y1 = y + 0.86;
    const fh = 12;
    const h = 8 + floors * fh;
    const fill = this.workFill(x, y, s, ghost);
    this.drawBox(ctx, L, x0, y0, x1, y1, 0, h, v.trim, false);
    // Glass ribbon windows; offices light up in the early evening while people work late.
    const evening = L.clock > 0.7 && L.clock < 0.86 ? 1 : 0.25;
    let wi = 0;
    for (let f = 0; f < floors; f++) {
      const v0 = 9 + f * fh;
      for (const face of ['L', 'R']) {
        for (let k = 0; k < 3; k++) {
          const u0 = 0.06 + k * 0.3;
          const isLit = !ghost && L.windowLit > 0.05 && hash2(x * 5 + wi, y * 11, 17) < fill * evening;
          wi++;
          this.drawWindow(ctx, L, this.faceQuad(face, x0, y0, x1, y1, u0, u0 + 0.28, v0, v0 + 7), face === 'L' ? 0.95 : 0.84, isLit);
        }
      }
    }
    // Lobby band and entrance.
    ctx.fillStyle = lit(v.wall, 0.85, L);
    poly(ctx, this.faceQuad('L', x0, y0, x1, y1, 0, 1, 0, 6));
    ctx.fill();
    ctx.fillStyle = lit(PALETTE.glass, 0.85, L);
    poly(ctx, this.faceQuad('L', x0, y0, x1, y1, 0.38, 0.62, 0, 6));
    ctx.fill();
    ctx.fillStyle = lit(v.wall, 0.7, L);
    poly(ctx, this.faceQuad('R', x0, y0, x1, y1, 0, 1, 0, 6));
    ctx.fill();
    // Roof deck in the accent colour with a small plant room.
    ctx.fillStyle = lit(v.wall, 1.02, L);
    poly(ctx, [
      [x0, y0, h],
      [x1, y0, h],
      [x1, y1, h],
      [x0, y1, h],
    ]);
    ctx.fill();
    this.drawBox(ctx, L, x0 + 0.38, y0 + 0.08, x1 - 0.08, y0 + 0.3, h, 6, v.trim);
  }

  drawSchool(ctx, x, y, s, L, ghost) {
    const wall = PALETTE.peach;
    const roof = '#e9968c';
    const x0 = x + 0.1;
    const x1 = x + 0.9;
    const y0 = y + 0.2;
    const y1 = y + 0.8;
    const h = 16;
    const fill = this.workFill(x, y, s, ghost);
    this.drawBox(ctx, L, x0, y0, x1, y1, 0, h, wall);
    for (let k = 0; k < 4; k++) {
      if (k === 2) continue;
      const u0 = 0.06 + k * 0.23;
      this.drawWindow(ctx, L, this.faceQuad('L', x0, y0, x1, y1, u0, u0 + 0.15, 5, 11), 0.92, this.isWindowLit(x, y, k, fill * 0.4, L));
    }
    ctx.fillStyle = lit(roof, 0.72, L);
    poly(ctx, this.faceQuad('L', x0, y0, x1, y1, 0.52, 0.66, 0, 10));
    ctx.fill();
    this.drawWindow(ctx, L, this.faceQuad('R', x0, y0, x1, y1, 0.15, 0.45, 5, 11), 0.8, false);
    this.drawWindow(ctx, L, this.faceQuad('R', x0, y0, x1, y1, 0.55, 0.85, 5, 11), 0.8, false);
    // Bell tower with a pitched cap and a little clock.
    const bx0 = x + 0.42;
    const bx1 = x + 0.58;
    const by0 = y + 0.38;
    const by1 = y + 0.54;
    this.drawBox(ctx, L, bx0, by0, bx1, by1, h, 10, PALETTE.blush);
    const bm = (by0 + by1) / 2;
    ctx.fillStyle = lit(roof, 1.04, L);
    poly(ctx, [
      [bx0 - 0.03, by0 - 0.03, h + 10],
      [bx0 - 0.03, by1 + 0.03, h + 10],
      [(bx0 + bx1) / 2, by1 + 0.03, h + 17],
      [(bx0 + bx1) / 2, by0 - 0.03, h + 17],
    ]);
    ctx.fill();
    ctx.fillStyle = lit(roof, 0.82, L);
    poly(ctx, [
      [bx1 + 0.03, by0 - 0.03, h + 10],
      [bx1 + 0.03, by1 + 0.03, h + 10],
      [(bx0 + bx1) / 2, by1 + 0.03, h + 17],
      [(bx0 + bx1) / 2, by0 - 0.03, h + 17],
    ]);
    ctx.fill();
    const c = gridToWorld((bx0 + bx1) / 2, by1, h + 5.5);
    ctx.fillStyle = lit('#fffaf2', 1, L);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 2.3, 2.3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Flag.
    const f = gridToWorld(x0 + 0.06, y0 + 0.06, h);
    ctx.strokeStyle = lit(PALETTE.pole, 1, L);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(f.x, f.y - 14);
    ctx.stroke();
    const wave = this.reduceMotion ? 0 : Math.sin(this.time * 3 + x) * 1.2;
    ctx.fillStyle = lit(PALETTE.lavender, 0.9, L);
    ctx.beginPath();
    ctx.moveTo(f.x, f.y - 14);
    ctx.quadraticCurveTo(f.x + 4, f.y - 14 + wave, f.x + 7, f.y - 13);
    ctx.lineTo(f.x + 7, f.y - 9.5);
    ctx.quadraticCurveTo(f.x + 4, f.y - 10.5 + wave, f.x, f.y - 10.5);
    ctx.closePath();
    ctx.fill();
  }

  drawClinic(ctx, x, y, s, L, ghost) {
    const wall = '#fff6f2';
    const accent = PALETTE.mint;
    const x0 = x + 0.15;
    const x1 = x + 0.85;
    const y0 = y + 0.15;
    const y1 = y + 0.85;
    const h = 20;
    const fill = this.workFill(x, y, s, ghost);
    this.drawBox(ctx, L, x0, y0, x1, y1, 0, h, wall);
    // Mint band and windows.
    ctx.fillStyle = lit(accent, 0.92, L);
    poly(ctx, this.faceQuad('L', x0, y0, x1, y1, 0, 1, 12.5, 14.5));
    ctx.fill();
    ctx.fillStyle = lit(accent, 0.78, L);
    poly(ctx, this.faceQuad('R', x0, y0, x1, y1, 0, 1, 12.5, 14.5));
    ctx.fill();
    // Clinics keep a few lights on all night.
    const night = Math.max(0.35, fill);
    for (let k = 0; k < 3; k++) {
      const u0 = 0.08 + k * 0.3;
      this.drawWindow(ctx, L, this.faceQuad('R', x0, y0, x1, y1, u0, u0 + 0.22, 5, 10.5), 0.8, this.isWindowLit(x, y, k, night, L));
      if (k !== 1) this.drawWindow(ctx, L, this.faceQuad('L', x0, y0, x1, y1, u0, u0 + 0.22, 5, 10.5), 0.92, this.isWindowLit(x, y, k + 3, night, L));
    }
    ctx.fillStyle = lit(PALETTE.glass, 0.8, L);
    poly(ctx, this.faceQuad('L', x0, y0, x1, y1, 0.4, 0.6, 0, 9));
    ctx.fill();
    // Rooftop cross.
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const a = 0.06;
    const b = 0.19;
    ctx.fillStyle = lit('#ff9a9a', 1, L);
    poly(ctx, [
      [cx - a, cy - b, h],
      [cx + a, cy - b, h],
      [cx + a, cy + b, h],
      [cx - a, cy + b, h],
    ]);
    ctx.fill();
    poly(ctx, [
      [cx - b, cy - a, h],
      [cx + b, cy - a, h],
      [cx + b, cy + a, h],
      [cx - b, cy + a, h],
    ]);
    ctx.fill();
    if (L.lamps > 0.1) {
      const p = gridToWorld(cx, cy, h);
      this.glows.push({ x: p.x, y: p.y, r: 14, a: 0.3 * L.lamps, rgb: '255,150,150', flat: true });
    }
  }

  drawTree(ctx, gx, gy, shape, L, phase, scale) {
    const p = gridToWorld(gx, gy);
    const sway = this.reduceMotion ? 0 : Math.sin(this.time * 1.2 + phase) * 0.7;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.scale(scale, scale);
    ctx.fillStyle = lit(PALETTE.trunk, 0.9, L);
    ctx.beginPath();
    ctx.roundRect(-1.6, -9, 3.2, 9.5, 1.2);
    ctx.fill();
    const blob = (cx, cy, r, color, shade) => {
      ctx.fillStyle = lit(color, shade, L);
      ctx.beginPath();
      ctx.arc(cx + sway, cy, r, 0, Math.PI * 2);
      ctx.fill();
    };
    if (shape === 1) {
      // Pine: stacked tiers, darker on the shaded right side.
      for (let i = 0; i < 3; i++) {
        const base = -6 - i * 7;
        const w = 9 - i * 2;
        const s = sway * (0.5 + i * 0.25);
        ctx.fillStyle = lit(PALETTE.leafDeep, 1, L);
        ctx.beginPath();
        ctx.moveTo(-w + s * 0.5, base);
        ctx.lineTo(w + s * 0.5, base);
        ctx.lineTo(s, base - 11);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = lit(PALETTE.leaf, 1, L);
        ctx.beginPath();
        ctx.moveTo(-w + s * 0.5, base);
        ctx.lineTo(s * 0.7, base);
        ctx.lineTo(s, base - 11);
        ctx.closePath();
        ctx.fill();
      }
    } else if (shape === 2) {
      ctx.fillStyle = lit(PALETTE.leafDeep, 1, L);
      ctx.beginPath();
      ctx.ellipse(sway + 0.8, -17, 7, 11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = lit(PALETTE.leaf, 1, L);
      ctx.beginPath();
      ctx.ellipse(sway - 0.6, -18, 5.8, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      blob(-2.5, -22, 2.6, PALETTE.leafLight, 1);
    } else {
      const blossom = shape === 3;
      const deep = blossom ? '#e9aab6' : PALETTE.leafDeep;
      const mid = blossom ? PALETTE.blossom : PALETTE.leaf;
      const light = blossom ? PALETTE.blossomLight : PALETTE.leafLight;
      blob(1, -15, 9, deep, 1);
      blob(-4, -16, 6.5, mid, 1);
      blob(3, -20, 6.5, mid, 1);
      blob(-1, -22, 6, mid, 1.02);
      blob(-3.2, -22.5, 3, light, 1);
    }
    ctx.restore();
  }

  drawParkProps(ctx, x, y, L) {
    this.drawTree(ctx, x + 0.2, y + 0.8, 2, L, hash2(x, y, 13) * 6, 0.62);
    // Fountain.
    const c = gridToWorld(x + 0.5, y + 0.5);
    ctx.fillStyle = lit(PALETTE.stone, 0.82, L);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lit(PALETTE.stone, 1, L);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y - 2.5, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lit(PALETTE.water, 1.04, L);
    ctx.beginPath();
    ctx.ellipse(c.x, c.y - 2.7, 7.6, 3.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lit(PALETTE.stone, 0.95, L);
    ctx.fillRect(c.x - 1, c.y - 8, 2, 6);
    ctx.fillStyle = litA('#ffffff', 1, L, 0.85);
    for (let i = 0; i < 4; i++) {
      const ph = (this.time * 0.9 + i / 4) % 1;
      const side = i % 2 ? 1 : -1;
      ctx.beginPath();
      ctx.arc(c.x + side * ph * 6, c.y - 8 - Math.sin(ph * Math.PI) * 5 + ph * 4, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    this.drawTree(ctx, x + 0.8, y + 0.2, 0, L, hash2(x, y, 14) * 6, 0.55);
    // Bench.
    const b = gridToWorld(x + 0.78, y + 0.66);
    ctx.fillStyle = lit(PALETTE.trunk, 0.95, L);
    ctx.beginPath();
    ctx.moveTo(b.x - 5, b.y - 3);
    ctx.lineTo(b.x + 2, b.y - 6.5);
    ctx.lineTo(b.x + 2, b.y - 4.5);
    ctx.lineTo(b.x - 5, b.y - 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = lit(PALETTE.trunk, 0.7, L);
    ctx.fillRect(b.x - 4.5, b.y - 1.5, 1, 2);
    ctx.fillRect(b.x + 1, b.y - 5, 1, 2);
  }

  // Street lamps sit on a sidewalk edge of some road tiles; four-way junctions stay clear.
  lampSpot(t) {
    if (hash2(t.x, t.y, 7) > 0.5) return null;
    for (const i of [3, 0, 1, 2]) {
      if (t.roadMask & (1 << i)) continue;
      const e = EDGES[i];
      return {
        gx: t.x + (e.a[0] + e.b[0]) / 2 + e.n[0] * 0.08,
        gy: t.y + (e.a[1] + e.b[1]) / 2 + e.n[1] * 0.08,
      };
    }
    return null;
  }

  drawLamp(ctx, lamp, L) {
    const base = gridToWorld(lamp.gx, lamp.gy);
    const top = base.y - 20;
    ctx.strokeStyle = lit(PALETTE.pole, 1, L);
    ctx.lineWidth = 1.3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(base.x, top);
    ctx.stroke();
    const on = L.lamps > 0.05;
    ctx.fillStyle = on ? PALETTE.lampOn : lit(PALETTE.lampOff, 1, L);
    ctx.beginPath();
    ctx.arc(base.x, top - 1.5, 2.4, 0, Math.PI * 2);
    ctx.fill();
    if (on) {
      this.glows.push({ x: base.x, y: top - 1.5, r: 15, a: 0.45 * L.lamps, rgb: '255,236,180' });
      this.glows.push({ x: base.x, y: base.y, r: 26, a: 0.22 * L.lamps, rgb: '255,226,160', flat: true });
    }
  }

  drawCar(ctx, c, pose, L) {
    if (c.alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = c.alpha;
    const alongX = Math.abs(pose.dx) >= Math.abs(pose.dy);
    const hl = 0.17;
    const hw = 0.1;
    const ex = alongX ? hl : hw;
    const ey = alongX ? hw : hl;
    const { gx, gy } = pose;
    const g = gridToWorld(gx, gy);
    ctx.fillStyle = 'rgba(52,44,96,0.2)';
    ctx.beginPath();
    ctx.ellipse(g.x, g.y + 1, (ex + ey) * HALF_W * 0.95, (ex + ey) * HALF_H * 0.95, 0, 0, Math.PI * 2);
    ctx.fill();
    this.drawBox(ctx, L, gx - ex, gy - ey, gx + ex, gy + ey, 1.5, 4.5, c.color);
    const cx = alongX ? ex * 0.55 : ex * 0.85;
    const cy = alongX ? ey * 0.85 : ey * 0.55;
    const back = 0.03;
    const ox = -pose.dx * back;
    const oy = -pose.dy * back;
    this.drawBox(ctx, L, gx - cx + ox, gy - cy + oy, gx + cx + ox, gy + cy + oy, 6, 3, '#e9f1f7');
    ctx.fillStyle = lit(c.color, 1.05, L);
    poly(ctx, [
      [gx - cx + ox, gy - cy + oy, 9.2],
      [gx + cx + ox, gy - cy + oy, 9.2],
      [gx + cx + ox, gy + cy + oy, 9.2],
      [gx - cx + ox, gy + cy + oy, 9.2],
    ]);
    ctx.fill();
    ctx.restore();
    if (L.lamps > 0.1) {
      const f = gridToWorld(gx + pose.dx * (hl + 0.08), gy + pose.dy * (hl + 0.08), 3);
      this.glows.push({ x: f.x, y: f.y, r: 12, a: 0.5 * L.lamps * c.alpha, rgb: '255,244,200' });
      const r = gridToWorld(gx - pose.dx * hl, gy - pose.dy * hl, 3);
      this.glows.push({ x: r.x, y: r.y, r: 5, a: 0.5 * L.lamps * c.alpha, rgb: '255,120,120' });
    }
  }

  drawWalker(ctx, w, L) {
    if (w.alpha <= 0) return;
    const p = gridToWorld(w.gx, w.gy);
    const bob = w.moving ? Math.abs(Math.sin(this.time * 9 + w.phase)) * 1.1 : 0;
    ctx.save();
    ctx.globalAlpha = w.alpha;
    ctx.fillStyle = 'rgba(52,44,96,0.22)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 2.4, 1.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = lit(w.shirt, 1, L);
    ctx.beginPath();
    ctx.roundRect(p.x - 1.6, p.y - 6.2 - bob, 3.2, 5.4, 1.4);
    ctx.fill();
    ctx.fillStyle = lit(w.skin, 1, L);
    ctx.beginPath();
    ctx.arc(p.x, p.y - 7.8 - bob, 1.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Pins over the Life Story character's home and workplace, drawn above everything else.
  drawLifePins(ctx, L) {
    const c = this.city.systems.life?.char;
    if (!c?.alive) return;
    const pin = (spot, color, size, icon) => {
      const t = this.city.getTile(spot.x, spot.y);
      if (!t) return;
      const f = t.structure ? this.footprint(t) : null;
      const bob = this.reduceMotion ? 0 : Math.sin(this.time * 2.4 + spot.x) * 2;
      const p = gridToWorld(spot.x + 0.5, spot.y + 0.5, (f?.h || 10) + 14 + bob);
      const z = Math.max(0.7, 1 / Math.sqrt(this.camera.zoom));
      const r = size * z;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.fillStyle = 'rgba(52,44,96,0.25)';
      ctx.beginPath();
      ctx.ellipse(0, r * 1.9, r * 0.5, r * 0.2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.6 * z;
      ctx.beginPath();
      ctx.moveTo(0, r * 1.6);
      ctx.bezierCurveTo(-r * 0.6, r * 0.6, -r, r * 0.1, -r, -r * 0.2);
      ctx.arc(0, -r * 0.2, r, Math.PI, 0);
      ctx.bezierCurveTo(r, r * 0.1, r * 0.6, r * 0.6, 0, r * 1.6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      if (icon === 'home') {
        ctx.beginPath();
        ctx.moveTo(-r * 0.5, -r * 0.1);
        ctx.lineTo(0, -r * 0.6);
        ctx.lineTo(r * 0.5, -r * 0.1);
        ctx.lineTo(r * 0.35, -r * 0.1);
        ctx.lineTo(r * 0.35, r * 0.35);
        ctx.lineTo(-r * 0.35, r * 0.35);
        ctx.lineTo(-r * 0.35, -r * 0.1);
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(-r * 0.42, -r * 0.35, r * 0.84, r * 0.62);
        ctx.fillStyle = color;
        ctx.fillRect(-r * 0.18, -r * 0.5, r * 0.36, r * 0.18);
      }
      ctx.restore();
      if (L.lamps > 0.1) this.glows.push({ x: p.x, y: p.y, r: r * 2.4, a: 0.35 * L.lamps, rgb: '255,240,220' });
    };
    if (c.job) pin(c.job, '#a98bd0', 7.5, 'work');
    if (c.home) pin(c.home, c.look?.outfit || '#ff8f7e', 9.5, 'home');
  }

  // ---- Particles and light ----------------------------------------------------------

  drawParticles(ctx, dt, L) {
    const keep = [];
    for (const p of this.particles) {
      p.age += dt;
      if (p.age >= p.life) continue;
      keep.push(p);
      if (p.age < 0) continue;
      const t = p.age / p.life;
      if (p.kind === 'dust') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vx *= 0.92;
        p.vy = p.vy * 0.92 - 4 * dt;
        ctx.fillStyle = litA('#f3ebdf', 1, L, (0.85 * (1 - t)).toFixed(3));
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1 + t * 1.4), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'ring') {
        const r = 0.2 + t * 0.55;
        ctx.strokeStyle = rgba(p.color, (0.8 * (1 - t)).toFixed(3));
        ctx.lineWidth = 2 * (1 - t) + 0.5;
        gridEllipse(ctx, p.gx, p.gy, 0, r);
        ctx.stroke();
      } else if (p.kind === 'heart') {
        const y = p.y - t * 22;
        const s = 3.2 * (t < 0.15 ? t / 0.15 : 1);
        ctx.fillStyle = `rgba(255,128,150,${(1 - t * t).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(p.x, y + s * 0.9);
        ctx.bezierCurveTo(p.x - s * 1.6, y - s * 0.2, p.x - s * 0.7, y - s * 1.3, p.x, y - s * 0.4);
        ctx.bezierCurveTo(p.x + s * 0.7, y - s * 1.3, p.x + s * 1.6, y - s * 0.2, p.x, y + s * 0.9);
        ctx.fill();
      }
    }
    this.particles = keep;
  }

  drawGlows(ctx, L) {
    if (!this.glows.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const g of this.glows) {
      if (g.a <= 0.005) continue;
      ctx.save();
      ctx.translate(g.x, g.y);
      if (g.flat) ctx.scale(1, 0.5);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, g.r);
      grad.addColorStop(0, `rgba(${g.rgb},${g.a.toFixed(3)})`);
      grad.addColorStop(1, `rgba(${g.rgb},0)`);
      ctx.fillStyle = grad;
      ctx.fillRect(-g.r, -g.r, g.r * 2, g.r * 2);
      ctx.restore();
    }
    ctx.restore();
  }
}
