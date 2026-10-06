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
import { worldToGrid, mapBounds } from './iso.js';

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
  let fitted = false;

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
    },
    onRandom: () => {
      generateTown(city);
      fitView(false);
      ui.toast('A fresh little town, ready for you');
    },
    onFit: () => fitView(false),
  });

  function uiInsets() {
    const narrow = window.innerWidth < 560;
    return { top: narrow ? 96 : 76, bottom: narrow ? 92 : 100, left: narrow ? 4 : 16, right: narrow ? 4 : 16 };
  }

  function fitView(immediate) {
    camera.setBounds(mapBounds(city.width, city.height));
    camera.fit(uiInsets(), immediate);
  }

  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.resize(w, h);
    camera.setViewport(w, h);
    camera.setBounds(mapBounds(city.width, city.height));
    if (!fitted || window.innerWidth < 760) {
      fitView(!fitted);
      fitted = true;
    }
  }
  window.addEventListener('resize', resize);
  resize();

  new InputController(canvas, camera, {
    onTap: (sx, sy) => {
      const t = tileAt(sx, sy);
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
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    ui.toast(touch ? 'Tap to build · long-press to bulldoze' : 'Click to build · right-click to bulldoze', 5200);
  } else {
    city.emit('loaded');
    ui.toast('Welcome back to your town', 2400);
  }

  const hot = window.claude?.hot;
  hot?.snapshot?.(() => ({ city: city.toJSON() }));

  function viewState() {
    if (!hover) return {};
    const t = city.getTile(hover.x, hover.y);
    const valid = city.canApply(tool, hover.x, hover.y);
    const ghost =
      valid && STRUCTURES[tool] && !t.structure && t.terrain === 'grass'
        ? { x: hover.x, y: hover.y, structure: { type: tool, variant: 'blush', floors: 5, shape: 0, residents: 0 } }
        : null;
    return { hover: { ...hover, tool, valid }, ghost };
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
