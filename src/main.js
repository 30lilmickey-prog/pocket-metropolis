// Wiring: creates each system, connects input to state, and runs the frame loop.

import { DEFAULT_MAP_SIZE, STRUCTURES, MILESTONES } from './config.js';
import { CityState } from './state.js';
import { Simulation } from './simulation.js';
import { Renderer } from './renderer.js';
import { Camera } from './camera.js';
import { InputController } from './input.js';
import { AutoSaver, loadCity, saveCity, saveBackup, loadBackup, clearBackup } from './persistence.js';
import { encodeCity, decodeCity, shareUrl, codeFromHash } from './share.js';
import { Minimap } from './minimap.js';
import { settings, loadSettings, setSetting, onSettings } from './settings.js';
import { generateTown, generateLand } from './generator.js';
import { NewTownSheet } from './newTownUI.js';
import { Interface } from './ui.js';
import { LifeInterface } from './lifeUI.js';
import { summaryOf } from './life.js';
import { addressOf } from './streets.js';
import { CityPanel } from './cityUI.js';
import { unlockTier } from './milestones.js';
import { computeCoverage } from './coverage.js';
import { recomputeDesirability } from './desirability.js';
import { worldToGrid, mapBounds, tileRectBounds, gridToWorld } from './iso.js';
import { History, lPath, tileLine } from './history.js';
import { Audio } from './audio.js';
import { daylightAt } from './time.js';

const MAX_STROKE = 160;
const TOOL_SOUNDS = {
  house: 'pop',
  shop: 'pop',
  tower: 'popBig',
  office: 'popBig',
  school: 'popBig',
  clinic: 'popBig',
  playground: 'pop',
  field: 'plant',
  tree: 'plant',
  park: 'plant',
  road: 'road',
};
const STROKE_LABELS = { road: 'road', water: 'water', bulldoze: 'bulldozing', tree: 'trees', park: 'parks', field: 'sports fields' };
const FEEDBACK_RADIUS = 7;

function start(hotData = {}) {
  loadSettings();
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
  const minimap = new Minimap(document.getElementById('minimap'), city, camera);
  // Automatic minimap: on for roomy screens, off on phones, unless the player chose.
  const minimapOn = () => settings.minimap ?? (window.innerWidth >= 760 && window.innerHeight >= 560);
  let hasBackup = !!loadBackup();

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
    onRandom: () => newTownSheet.toggle(true),
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
    locks: {
      isUnlocked: (id) => sim.milestones.isUnlocked(id),
      unlockLabel: (id) => MILESTONES[unlockTier(id)]?.label || '',
    },
    onShare: () => shareTown(),
    onBackHome: () => backHome(),
    hasBackup: () => hasBackup,
    display: {
      get: (k) => (k === 'minimap' ? minimapOn() : settings[k]),
      set: (k, v) => setSetting(k, v),
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

  // ---- Placement feedback ------------------------------------------------------
  // Edits run through here so nearby homes can show how much more (or less) appealing they became.
  const isHome = (t) => t?.structure && STRUCTURES[t.structure.type].capacity > 0;
  function withFeedback(coords, edit) {
    if (!coords.length) return edit();
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const c of coords) {
      x0 = Math.min(x0, c.x);
      y0 = Math.min(y0, c.y);
      x1 = Math.max(x1, c.x);
      y1 = Math.max(y1, c.y);
    }
    const before = new Map();
    for (let y = y0 - FEEDBACK_RADIUS; y <= y1 + FEEDBACK_RADIUS; y++) {
      for (let x = x0 - FEEDBACK_RADIUS; x <= x1 + FEEDBACK_RADIUS; x++) {
        const t = city.getTile(x, y);
        if (isHome(t)) before.set(t, { id: t.structure.id, d: t.desirability });
      }
    }
    const changed = edit();
    if (!changed) return changed;
    computeCoverage(city);
    recomputeDesirability(city);
    city.dirty = true; // let the simulation refresh jobs and traffic on its next tick
    const ups = [];
    const downs = [];
    for (const [t, b] of before) {
      if (!isHome(t) || t.structure.id !== b.id) continue;
      const delta = Math.round((t.desirability - b.d) * 100);
      if (delta >= 1) ups.push({ t, delta });
      else if (delta <= -1) downs.push({ t, delta });
    }
    ups.sort((a, b) => b.delta - a.delta);
    downs.sort((a, b) => a.delta - b.delta);
    [...ups.slice(0, 6), ...downs.slice(0, 4)].forEach(({ t, delta }, i) =>
      renderer.floatText(t.x, t.y, `${delta > 0 ? '+' : '−'}${Math.abs(delta)}%`, delta > 0 ? '#3f9a68' : '#d0605a', 0.25 + i * 0.06)
    );
    // A brand-new home shows how appealing its lot is.
    const placed = coords.map((c) => city.getTile(c.x, c.y)).filter((t) => isHome(t) && !before.has(t));
    placed.slice(0, 4).forEach((t, i) => renderer.floatText(t.x, t.y, `${Math.round(t.desirability * 100)}% appeal`, '#7a5fa8', 0.35 + i * 0.08, 40));
    return changed;
  }
  const build = (label, coords, edit) => history.record(label, coords, () => withFeedback(coords, edit));

  // ---- Milestones -------------------------------------------------------------
  const cityPanel = new CityPanel({
    milestones: () => sim.milestones,
    onOpen: () => {
      lifeUI.toggle(false);
      ui.toggleMore(false);
      ui.closeTray();
    },
    onShow: (th) => {
      focusTile(th.x, th.y);
      if (window.innerWidth < 560) cityPanel.toggle(false);
    },
    // Build a suggested road in one go (one undo step), skipping anything built there since.
    onBuild: (th) => {
      const coords = th.plan.filter((c) => city.canApply('road', c.x, c.y) && city.getTile(c.x, c.y).terrain === 'grass' && (!city.getTile(c.x, c.y).structure || city.getTile(c.x, c.y).structure.type === 'tree'));
      if (!coords.length) return ui.toast('That spot has changed. A new suggestion will come along shortly', 3000);
      build(`${coords.length} road${coords.length > 1 ? 's' : ''}`, coords, () => city.applyMany('road', coords));
      cityPanel.focus(null);
      sim.refresh();
      ui.toast('New road built. Drivers will start using it right away', 3200);
    },
  });
  function focusTile(x, y) {
    const w = gridToWorld(x + 0.5, y + 0.5);
    camera.tx = w.x;
    camera.ty = w.y - 20;
    camera.tzoom = Math.max(camera.tzoom, 1.2);
    camera.clampTarget();
    renderer.ring(x, y, '#ffffff');
    // On phones the inspector would cover the highlighted area, so only open it on wider screens.
    if (window.innerWidth >= 560) {
      selected = { x, y };
      ui.inspect(city, selected);
    }
  }
  ui.onOpenMore = () => {
    cityPanel.toggle(false);
    lifeUI.toggle(false);
  };
  let milestoneTimer = null;
  function celebrate(m) {
    audio.play('fanfare');
    renderer.confetti();
    ui.refreshLocks();
    let card = document.getElementById('milestone-card');
    if (!card) {
      card = document.createElement('section');
      card.id = 'milestone-card';
      card.className = 'milestone-card glass';
      card.setAttribute('role', 'status');
      document.getElementById('app').appendChild(card);
      card.addEventListener('click', () => (card.hidden = true));
    }
    const names = sim.milestones.sandbox ? [] : m.unlocks.map((u) => STRUCTURES[u]?.label || u);
    card.innerHTML =
      `<span class="insp-kicker">New milestone</span><h2>You're a ${m.label}!</h2>` +
      `<p>${m.pop.toLocaleString()} people now call your town home.</p>` +
      (names.length ? `<p class="tier-unlocks">Unlocked ${names.map((n) => `<span class="unlock-chip">${n}</span>`).join('')}</p>` : '');
    card.hidden = false;
    clearTimeout(milestoneTimer);
    milestoneTimer = setTimeout(() => (card.hidden = true), 5200);
  }

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

  // ---- New town ----------------------------------------------------------------
  const newTownSheet = new NewTownSheet({
    onOpen: () => {
      ui.toggleMore(false);
      cityPanel.toggle(false);
      lifeUI.toggle(false);
      ui.closeTray();
    },
    onStart: (opts) => newTown(opts),
  });

  // Build a fresh town of the chosen size and mode. The Life Story and achievements carry over;
  // a character whose home is gone moves into whatever the new town offers (or waits for one).
  function newTown({ mode, size, start }) {
    const fresh = new CityState(size, size);
    if (start === 'town') generateTown(fresh);
    else generateLand(fresh);
    fresh.systems.mode = mode;
    if (city.systems.life) fresh.systems.life = city.systems.life;
    swapCity(fresh);
    if (start === 'town') sim.milestones.settleForCapacity();
    ui.refreshLocks();
    if (sim.life.char?.alive) sim.life.syncWithCity();
    lifeUI.render();
    saveCity(city);
    audio.play('fanfare');
    const where = start === 'town' ? 'A fresh town' : 'Open land';
    ui.toast(mode === 'sandbox' ? `${where}, sandbox mode: everything is unlocked` : `${where}. Grow it to unlock new buildings`, 4200);
  }

  // ---- Sharing -----------------------------------------------------------------
  async function shareTown() {
    try {
      const url = shareUrl(await encodeCity(city));
      const touch = window.matchMedia?.('(pointer: coarse)').matches;
      if (touch && navigator.share) {
        await navigator.share({ title: 'My Pocket Metropolis town', text: 'Come and see my little town!', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      ui.toast('Link copied. Anyone who opens it gets a copy of your town to play with', 4200);
    } catch (err) {
      if (err?.name === 'AbortError') return; // closed the share sheet
      window.prompt('Copy this link to share your town:', shareUrl(await encodeCity(city)));
    }
  }

  // Swap in another town (shared or your own back), keeping every system attached to this city.
  function swapCity(other) {
    city.copyFrom(other);
    history.clear();
    sim.refresh();
    selected = null;
    city.emit('loaded');
    fitView(false);
  }

  async function visitShared(code) {
    let other;
    try {
      other = await decodeCity(code);
    } catch {
      ui.toast('That town link is broken or incomplete', 3600);
      return;
    }
    if (!hasBackup) hasBackup = saveBackup(city); // keep your own town (and Life Story) safe
    swapCity(other);
    sim.milestones.settleForCapacity();
    ui.refreshLocks();
    saveCity(city);
    ui.toast(hasBackup ? 'Visiting a shared town. Your own town is saved: ☰ → Back to my town' : 'Visiting a shared town', 6000);
  }

  function backHome() {
    const own = loadBackup();
    if (!own) {
      hasBackup = false;
      return;
    }
    swapCity(own);
    ui.refreshLocks();
    saveCity(city);
    clearBackup();
    hasBackup = false;
    ui.toast('Welcome back to your town', 2400);
  }

  const sharedCode = codeFromHash(window.location.hash);
  if (sharedCode) {
    window.history.replaceState(null, '', window.location.pathname + window.location.search); // a reload won't re-import
    queueMicrotask(() => visitShared(sharedCode));
  }
  window.addEventListener('hashchange', () => {
    const code = codeFromHash(window.location.hash);
    if (!code) return;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    visitShared(code);
  });

  onSettings(() => {
    minimap.setVisible(minimapOn());
    renderer.textScale = settings.largeText ? 1.2 : 1;
    ui.renderMore();
  });

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
  window.addEventListener('resize', () => {
    resize();
    minimap.setVisible(minimapOn());
  });
  resize();
  minimap.setVisible(minimapOn());
  renderer.textScale = settings.largeText ? 1.2 : 1;

  const lifeUI = new LifeInterface({
    life: sim.life,
    onCreate: (draft) => {
      sim.life.create(draft);
      ui.toast(`${draft.first} was born. Watch for life events as the years go by.`, 3600);
    },
    onAgeUp: () => sim.life.ageUp(),
    onChoose: (i) => {
      const before = homeKey();
      const result = sim.life.choose(i);
      if (homeKey() !== before) showNewHome();
      if (result) {
        const score = result.changes.reduce((n, c) => n + Math.sign(c.delta), 0);
        audio.play(score >= 0 ? 'good' : 'bad');
      }
      return result;
    },
    onActivity: (id) => {
      const result = sim.life.doActivity(id);
      if (result?.text) {
        const score = result.changes.reduce((n, c) => n + Math.sign(c.delta), 0);
        audio.play(score >= 0 ? 'good' : 'bad');
      } else if (result?.launched) audio.play('chime');
      else audio.play('nope');
      return result;
    },
    onContinue: () => sim.life.continueAsChild(),
    onNewLife: () => {
      const s = city.systems.life;
      if (s?.char) s.history = [...(s.history || []), summaryOf(s.char)];
      city.systems.life = s ? { char: null, history: s.history, achievements: s.achievements || {} } : null;
    },
    onOpen: () => {
      cityPanel.toggle(false);
      ui.toggleMore(false);
    },
    onFocus: () => {
      const home = sim.life.char?.home;
      if (!home) return;
      const w = gridToWorld(home.x + 0.5, home.y + 0.5);
      camera.tx = w.x;
      camera.ty = w.y - 20;
      camera.tzoom = Math.max(camera.tzoom, 1.1);
      camera.clampTarget();
      renderer.ring(home.x, home.y, '#ffffff');
    },
  });
  // After a move, fly to the new home and say its address.
  const homeKey = () => {
    const h = sim.life.char?.home;
    return h ? `${h.x},${h.y}` : '';
  };
  function showNewHome() {
    const h = sim.life.char?.home;
    if (!h) return;
    sim.updateStreets();
    lifeUI.h.onFocus();
    ui.toast(`${sim.life.char.first}'s new home: ${addressOf(city.getTile(h.x, h.y))}`, 4200);
  }
  city.on((ev) => {
    // Sounds. Strokes fire many events; only the first few make a sound.
    const d = ev.delay || 0;
    if (ev.type === 'placed' && d < 0.5) audio.play(TOOL_SOUNDS[ev.structure.type] || 'pop', { delay: d, gap: 0.03 });
    else if (ev.type === 'removed' && d < 0.5) audio.play(ev.wasWater ? 'plant' : 'demolish', { delay: d, gap: 0.05 });
    else if (ev.type === 'watered' && d < 0.5) audio.play('water', { delay: d, gap: 0.05 });
    else if (ev.type === 'reset') audio.play('fanfare');
    else if (ev.type === 'restored') audio.play('undo');
    else if (ev.type === 'lifeEvent') audio.play('chime');
    if (ev.type === 'milestone') celebrate(ev.milestone);
    if (ev.type === 'achievement') {
      audio.play('fanfare', { gap: 1 });
      ui.toast(`★ Achievement: ${ev.achievement.label}. ${ev.achievement.desc}`, 3600);
    }

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
      const th = renderer.thoughtAt(sx, sy);
      if (th) {
        audio.play('click');
        cityPanel.focus(th.id);
        if (!cityPanel.open && window.innerWidth >= 560) cityPanel.toggle(true);
        return focusTile(th.x, th.y);
      }
      const t = tileAt(sx, sy);
      if (tool === 'inspect') {
        selected = t && !(selected && selected.x === t.x && selected.y === t.y) ? t : null;
        ui.inspect(city, selected);
        if (selected) audio.play('click');
        return;
      }
      if (!t) return;
      if (!sim.milestones.isUnlocked(tool)) return ui.setTool(tool);
      if (!build(labelFor(tool), [t], () => city.apply(tool, t.x, t.y))) nope(t.x, t.y);
    },
    onBulldoze: (sx, sy) => {
      const t = tileAt(sx, sy);
      if (t && !build('bulldozing', [t], () => city.apply('bulldoze', t.x, t.y))) nope(t.x, t.y);
    },
    onHover: (sx, sy) => {
      hover = sx == null ? null : tileAt(sx, sy);
    },
    // Drag to build: roads follow an L from where the drag started; other tools paint as a brush.
    canPaint: () => tool !== 'inspect' && sim.milestones.isUnlocked(tool),
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
      build(labelFor(s.tool, coords.length), coords, () => city.applyMany(s.tool, coords));
    },
  });

  if (fresh) {
    generateTown(city);
    sim.refresh();
    sim.milestones.settleForCapacity();
    ui.refreshLocks();
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
    const issues = cityPanel.issues();
    if (!hover) return { overlay, selected, plan, issues };
    const t = city.getTile(hover.x, hover.y);
    const valid = tool === 'inspect' || city.canApply(tool, hover.x, hover.y);
    const ghost =
      valid && STRUCTURES[tool] && !t.structure && t.terrain === 'grass'
        ? { x: hover.x, y: hover.y, structure: { type: tool, variant: 'blush', floors: tool === 'office' ? 4 : 5, shape: 0, residents: 0 } }
        : null;
    return { hover: { ...hover, tool, valid }, ghost, overlay, selected, plan, issues };
  }

  let last = performance.now();
  let uiTimer = 0;
  function frame(now) {
    const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)); // the first frame can be stamped before `last`
    last = now;
    sim.update(dt);
    input.edgeScroll(dt);
    camera.update(dt);
    audio.ambient(dt, { daylight: daylightAt(city.clock), rain: city.derived.weather?.rain || 0 });
    renderer.render(dt, viewState());
    minimap.render();
    saver.tick(dt);
    uiTimer -= dt;
    if (uiTimer <= 0) {
      ui.update(city);
      ui.inspect(city, selected);
      lifeUI.tick();
      cityPanel.update(city);
      uiTimer = 0.2;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Handy for poking at the simulation from the console.
  window.pocketMetropolis = { city, sim, camera, renderer, history, audio, ui, cityPanel };
}

const hot = window.claude?.hot;
if (hot?.ready) hot.ready(start);
else start(hot?.data ?? {});
