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
import { LifeInterface } from './lifeUI.js';
import { worldToGrid, mapBounds, tileRectBounds, gridToWorld } from './iso.js';
import { History, lPath, tileLine } from './history.js';
import { Audio } from './audio.js';
import { daylightAt } from './time.js';

const MAX_STROKE = 160;
const TOOL_SOUNDS = { house: 'pop', shop: 'pop', tower: 'popBig', office: 'popBig', school: 'popBig', clinic: 'popBig', tree: 'plant', park: 'plant', road: 'road' };
const STROKE_LABELS = { road: 'road', water: 'water', bulldoze: 'bulldozing', tree: 'trees', park: 'parks' };

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
  const history = new History(city);
  const audio = new Audio();

  let tool = 'house';
  let hover = null; // { x, y } tile under the mouse
  let selected = null; // { x, y } tile shown in the inspector
  let overlay = 'none';
  let fitted = false;
  let framing = 'town'; // what the recenter button framed last
  let stroke = null; // drag-to-build in progress: { start, last, tiles }

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
      history.record('Random Town', city.tiles.map((t) => ({ x: t.x, y: t.y })), () => {
        generateTown(city);
        return true;
      });
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
    sound: {
      muted: () => audio.muted,
      toggle: () => {
        audio.setMuted(!audio.muted);
        if (!audio.muted) {
          audio.ensure();
          audio.play('click');
        }
        return audio.muted;
      },
    },
  });

  // ---- Undo and redo --------------------------------------------------------
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  const syncHistoryButtons = () => {
    undoBtn.hidden = !history.canUndo && !history.canRedo;
    redoBtn.hidden = !history.canRedo;
    undoBtn.disabled = !history.canUndo;
  };
  history.on(syncHistoryButtons);
  syncHistoryButtons();
  const doUndo = () => {
    const label = history.undo();
    if (label) ui.toast(`Undid ${label}`, 1600);
  };
  const doRedo = () => {
    const label = history.redo();
    if (label) ui.toast(`Redid ${label}`, 1600);
  };
  undoBtn.addEventListener('click', doUndo);
  redoBtn.addEventListener('click', doRedo);
  window.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.target.closest?.('input')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) doUndo();
    else if ((k === 'z' && e.shiftKey) || k === 'y') doRedo();
    else return;
    e.preventDefault();
  });

  const labelFor = (t, n = 1) => {
    if (t === 'bulldoze') return n > 1 ? `bulldozing ${n} tiles` : 'bulldozing';
    const name = STROKE_LABELS[t] || STRUCTURES[t]?.label.toLowerCase() || t;
    return n > 1 ? `${n} ${name}${name.endsWith('s') || name === 'water' || name === 'road' ? '' : 's'}` : name;
  };
  renderer.onGrow = () => audio.play('grow', { gap: 0.25 });
  const nope = (x, y) => {
    renderer.nudge(x, y);
    audio.play('nope');
  };

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

  const lifeUI = new LifeInterface({
    life: sim.life,
    onCreate: (draft) => {
      sim.life.create(draft);
      ui.toast(`${draft.first} was born. Watch for life events as the years go by.`, 3600);
    },
    onAgeUp: () => sim.life.ageUp(),
    onChoose: (i) => {
      const result = sim.life.choose(i);
      if (result) {
        const score = result.changes.reduce((n, c) => n + Math.sign(c.delta), 0);
        audio.play(score >= 0 ? 'good' : 'bad');
      }
      return result;
    },
    onContinue: () => sim.life.continueAsChild(),
    onNewLife: () => {
      const s = city.systems.life;
      if (s?.char) s.history = [...(s.history || []), { name: `${s.char.first} ${s.char.last}`, age: s.char.age }];
      city.systems.life = s ? { char: null, history: s.history } : null;
    },
    onFocus: () => {
      const home = sim.life.char?.home;
      if (!home) return;
      const w = gridToWorld(home.x + 0.5, home.y + 0.5);
      camera.tx = w.x;
      camera.ty = w.y - 20;
      camera.tzoom = Math.max(camera.tzoom, 1.1);
      camera.clampTarget();
    },
  });
  city.on((ev) => {
    // Sounds. Strokes fire many events; only the first few make a sound.
    const d = ev.delay || 0;
    if (ev.type === 'placed' && d < 0.5) audio.play(TOOL_SOUNDS[ev.structure.type] || 'pop', { delay: d, gap: 0.03 });
    else if (ev.type === 'removed' && d < 0.5) audio.play(ev.wasWater ? 'plant' : 'demolish', { delay: d, gap: 0.05 });
    else if (ev.type === 'watered' && d < 0.5) audio.play('water', { delay: d, gap: 0.05 });
    else if (ev.type === 'reset') audio.play('fanfare');
    else if (ev.type === 'restored') audio.play('undo');
    else if (ev.type === 'lifeEvent') audio.play('chime');

    if (ev.type === 'lifeEvent') lifeUI.eventArrived();
    else if (ev.type === 'lifeChanged') lifeUI.render();
    else if (['removed', 'watered', 'placed', 'reset', 'restored'].includes(ev.type)) {
      // A bulldozed home or workplace changes the character's life right away.
      if (sim.life.char?.alive) {
        sim.life.syncWithCity();
        lifeUI.render();
      }
    }
  });

  const input = new InputController(canvas, camera, {
    onTap: (sx, sy) => {
      const t = tileAt(sx, sy);
      if (tool === 'inspect') {
        selected = t && !(selected && selected.x === t.x && selected.y === t.y) ? t : null;
        ui.inspect(city, selected);
        if (selected) audio.play('click');
        return;
      }
      if (!t) return;
      if (!history.record(labelFor(tool), [t], () => city.apply(tool, t.x, t.y))) nope(t.x, t.y);
    },
    onBulldoze: (sx, sy) => {
      const t = tileAt(sx, sy);
      if (t && !history.record('bulldozing', [t], () => city.apply('bulldoze', t.x, t.y))) nope(t.x, t.y);
    },
    onHover: (sx, sy) => {
      hover = sx == null ? null : tileAt(sx, sy);
    },
    // Drag to build: roads follow an L from where the drag started; other tools paint as a brush.
    canPaint: () => tool !== 'inspect',
    onPaintStart: (sx, sy) => {
      const t = tileAt(sx, sy);
      stroke = t ? { tool, start: t, last: t, tiles: [t] } : null;
      hover = null;
    },
    onPaintMove: (sx, sy) => {
      const t = tileAt(sx, sy);
      if (!t) return;
      if (!stroke) {
        stroke = { tool, start: t, last: t, tiles: [t] };
        return;
      }
      if (t.x === stroke.last.x && t.y === stroke.last.y) return;
      if (stroke.tool === 'road') {
        stroke.tiles = lPath(stroke.start, t).slice(0, MAX_STROKE);
      } else {
        const seen = new Set(stroke.tiles.map((c) => c.y * city.width + c.x));
        for (const c of tileLine(stroke.last, t)) {
          if (stroke.tiles.length >= MAX_STROKE) break;
          const k = c.y * city.width + c.x;
          if (!seen.has(k)) {
            seen.add(k);
            stroke.tiles.push(c);
          }
        }
      }
      stroke.last = t;
    },
    onPaintEnd: (commit) => {
      const s = stroke;
      stroke = null;
      if (!commit || !s) return;
      const coords = s.tiles.filter((c) => city.canApply(s.tool, c.x, c.y));
      if (!coords.length) return nope(s.start.x, s.start.y);
      history.record(labelFor(s.tool, coords.length), coords, () => city.applyMany(s.tool, coords));
    },
  });

  if (fresh) {
    generateTown(city);
    sim.refresh();
    fitView(true);
    const touch = window.matchMedia?.('(pointer: coarse)').matches;
    ui.toast(
      touch ? 'Tap or drag to build · two fingers to move · long-press to bulldoze' : 'Click or drag to build · right-drag to move · right-click to bulldoze',
      6000
    );
  } else {
    sim.refresh();
    city.emit('loaded');
    ui.toast('Welcome back to your town', 2400);
  }

  const hot = window.claude?.hot;
  hot?.snapshot?.(() => ({ city: city.toJSON() }));

  function viewState() {
    const plan = stroke ? { tool: stroke.tool, tiles: stroke.tiles.map((c) => ({ ...c, valid: city.canApply(stroke.tool, c.x, c.y) })) } : null;
    if (!hover) return { overlay, selected, plan };
    const t = city.getTile(hover.x, hover.y);
    const valid = tool === 'inspect' || city.canApply(tool, hover.x, hover.y);
    const ghost =
      valid && STRUCTURES[tool] && !t.structure && t.terrain === 'grass'
        ? { x: hover.x, y: hover.y, structure: { type: tool, variant: 'blush', floors: tool === 'office' ? 4 : 5, shape: 0, residents: 0 } }
        : null;
    return { hover: { ...hover, tool, valid }, ghost, overlay, selected, plan };
  }

  let last = performance.now();
  let uiTimer = 0;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    sim.update(dt);
    input.edgeScroll(dt);
    camera.update(dt);
    audio.ambient(dt, { daylight: daylightAt(city.clock), rain: city.derived.weather?.rain || 0 });
    renderer.render(dt, viewState());
    saver.tick(dt);
    uiTimer -= dt;
    if (uiTimer <= 0) {
      ui.update(city);
      ui.inspect(city, selected);
      lifeUI.tick();
      uiTimer = 0.2;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Handy for poking at the simulation from the console.
  window.pocketMetropolis = { city, sim, camera, renderer, history, audio };
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
