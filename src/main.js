// Wiring: creates each system, connects input to state, and runs the frame loop.

import { DEFAULT_MAP_SIZE, STRUCTURES } from './config.js';
import { CityState } from './state.js';
import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';
import { Camera } from './camera.js';
import { InputController } from './input.js';
import { AutoSaver, loadCity } from './persistence.js';
import { generateTown } from './generator.js';
import { Interface } from './ui.js';
import { worldToGrid, mapBounds, tileRectBounds } from './iso.js';

function start(hotData = {}) {
  const canvas = document.getElementById('city');
  let city = null;
  try {
    if (hotData.city) city = CityState.fromJSON(hotData.city);
  } catch {
    city = null;
  }
  city = city || loadCity();
  const fresh = !city;
  if (!city) city = new CityState(DEFAULT_MAP_SIZE, DEFAULT_MAP_SIZE);

  const camera = new Camera();
  camera.smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const sim = new Simulation(city);
  const renderer = new Renderer(canvas, city, camera, sim.agents);
  const saver = new AutoSaver(city);

  let tool = 'house';
  let hover = null; // { x, y } tile under the mouse
  let selected = null; // { x, y } tile shown in the inspector
  let overlay = 'none';
  let fitted = false;
  let framing = 'town'; // what the recenter button framed last

  const tileAt = (sx, sy) => {
    const w = camera.screenToWorld(sx, sy);
    const g = worldToGrid(w.x, w.y);
    const x = Math.floor(g.gx);
    const y = Math.floor(g.gy);
    return city.inBounds(x, y) ? { x, y } : null;
  };

  const ui = new Interface({
    onTool: (id) => {
      tool = id;
      if (id !== 'inspect') selected = null;
    },
    onRandom: () => {
      generateTown(city);
      sim.refresh();
      selected = null;
      fitView(false);
      ui.toast('A fresh town, with room to grow');
    },
    // First press frames the town; pressing again shows the whole map.
    onFit: () => fitView(false, framing === 'town' ? 'map' : 'town'),
    onSpeed: (speed) => {
      sim.speed = speed;
    },
    onView: (id) => {
      overlay = id;
    },
    onCloseInspect: () => {
      selected = null;
    },
  });

  function uiInsets() {
    const narrow = window.innerWidth < 560;
    return { top: narrow ? 96 : 76, bottom: narrow ? 92 : 100, left: narrow ? 4 : 16, right: narrow ? 4 : 16 };
  }

  // The part of the map that is built up: homes, workplaces and services.
  function townBounds() {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const t of city.tiles) {
      const s = t.structure;
      if (!s || s.type === 'tree' || s.type === 'road') continue;
      x0 = Math.min(x0, t.x);
      y0 = Math.min(y0, t.y);
      x1 = Math.max(x1, t.x);
      y1 = Math.max(y1, t.y);
    }
    if (x0 === Infinity) return null;
    // Portrait phones are narrow; frame the town's core so buildings read at a comfortable size.
    if (window.innerWidth < 560) {
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      const r = Math.max(3, Math.min(x1 - x0, y1 - y0) * 0.3);
      x0 = Math.round(cx - r);
      x1 = Math.round(cx + r);
      y0 = Math.round(cy - r);
      y1 = Math.round(cy + r);
    }
    const pad = 1;
    return tileRectBounds(Math.max(0, x0 - pad), Math.max(0, y0 - pad), Math.min(city.width - 1, x1 + pad), Math.min(city.height - 1, y1 + pad));
  }

  function fitView(immediate, target = 'town') {
    camera.setBounds(mapBounds(city.width, city.height));
    const rect = target === 'town' ? townBounds() : null;
    camera.fit(uiInsets(), immediate, rect || camera.bounds);
    framing = rect ? 'town' : 'map';
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.resize(w, h);
    camera.setViewport(w, h);
    camera.setBounds(mapBounds(city.width, city.height));
    if (!fitted) {
      fitView(true);
      fitted = true;
    }
  }
  window.addEventListener('resize', resize);
  resize();

  new InputController(canvas, camera, {
    onTap: (sx, sy) => {
      const t = tileAt(sx, sy);
      if (tool === 'inspect') {
        selected = t && !(selected && selected.x === t.x && selected.y === t.y) ? t : null;
        ui.inspect(city, selected);
        return;
      }
      if (!t) return;
      if (!city.apply(tool, t.x, t.y)) renderer.nudge(t.x, t.y);
    },
    onBulldoze: (sx, sy) => {
      const t = tileAt(sx, sy);
      if (t && !city.apply('bulldoze', t.x, t.y)) renderer.nudge(t.x, t.y);
    },
    onHover: (sx, sy) => {
      hover = sx == null ? null : tileAt(sx, sy);
    },
  });

  if (fresh) {
    generateTown(city);
    sim.refresh();
    fitView(true);
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    ui.toast(touch ? 'Tap to build · long-press to bulldoze' : 'Click to build · right-click to bulldoze', 5200);
  } else {
    sim.refresh();
    city.emit('loaded');
    ui.toast('Welcome back to your town', 2400);
  }

  const hot = window.claude?.hot;
  hot?.snapshot?.(() => ({ city: city.toJSON() }));

  function viewState() {
    if (!hover) return { overlay, selected };
    const t = city.getTile(hover.x, hover.y);
    const valid = tool === 'inspect' || city.canApply(tool, hover.x, hover.y);
    const ghost =
      valid && STRUCTURES[tool] && !t.structure && t.terrain === 'grass'
        ? { x: hover.x, y: hover.y, structure: { type: tool, variant: 'blush', floors: tool === 'office' ? 4 : 5, shape: 0, residents: 0 } }
        : null;
    return { hover: { ...hover, tool, valid }, ghost, overlay, selected };
  }

  let last = performance.now();
  let uiTimer = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    sim.update(dt);
    camera.update(dt);
    renderer.render(dt, viewState());
    saver.tick(dt);
    uiTimer -= dt;
    if (uiTimer <= 0) {
      ui.update(city);
      ui.inspect(city, selected);
      uiTimer = 0.2;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Handy for poking at the simulation from the console.
  window.pocketMetropolis = { city, sim, camera, renderer };
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
