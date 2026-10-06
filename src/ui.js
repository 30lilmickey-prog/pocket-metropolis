// Interface: the toolbar, stats bubble and buttons. Reads stats, never touches the simulation directly.

import { TOOLS } from './config.js';
import { formatClock } from './time.js';

const svg = (body) =>
  `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

const ICONS = {
  house: svg('<path d="M3.5 11 12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>'),
  tower: svg('<rect x="6.5" y="3" width="11" height="18" rx="1.5"/><path d="M10 7.5h.01M14 7.5h.01M10 11.5h.01M14 11.5h.01M10 15.5h.01M14 15.5h.01" stroke-width="2.6"/>'),
  tree: svg('<circle cx="12" cy="9.5" r="6"/><path d="M12 15.5V21M9 21h6"/>'),
  park: svg('<path d="M4 13.5h16M5.5 13.5v5M18.5 13.5v5"/><path d="M4.5 9.5h15"/><path d="M7 9.5V6.5M17 9.5V6.5"/>'),
  road: svg('<path d="M8.5 3 5 21M15.5 3 19 21"/><path d="M12 4v2.5M12 10.5V13M12 17v3"/>'),
  water: svg('<path d="M12 3.5c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-10Z"/><path d="M9.5 14.5a2.5 2.5 0 0 0 2.5 2.5"/>'),
  bulldoze: svg(
    '<rect x="2.5" y="10.5" width="10" height="5" rx="1.2"/><path d="M5 10.5V7h4.5l1.5 3.5"/><path d="M12.5 13h3.5"/><path d="M17 8.5c1.7 2.6 1.7 6.4 0 9h3.5"/><rect x="2.5" y="17" width="10" height="3.5" rx="1.75"/>'
  ),
};

const MOUTHS = {
  happy: 'M8.5 14c1.9 2.2 5.1 2.2 7 0',
  okay: 'M9 15h6',
  sad: 'M8.5 16.5c1.9-2.2 5.1-2.2 7 0',
};

export class Interface {
  constructor({ onTool, onRandom, onFit }) {
    this.toolbar = document.getElementById('toolbar');
    this.popEl = document.getElementById('stat-pop');
    this.capEl = document.getElementById('stat-cap');
    this.happyEl = document.getElementById('stat-happy');
    this.moodEl = document.getElementById('mood-mouth');
    this.meterEl = document.getElementById('happy-meter');
    this.clockEl = document.getElementById('stat-clock');
    this.toastEl = document.getElementById('toast');
    this.onTool = onTool;
    this.tool = 'house';
    this._last = {};

    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tool';
      b.id = `tool-${t.id}`;
      b.dataset.tool = t.id;
      b.title = `${t.label} (${t.key})`;
      b.setAttribute('aria-pressed', 'false');
      b.innerHTML = `<span class="tool-icon">${ICONS[t.id]}</span><span class="tool-label">${t.label}</span>`;
      b.addEventListener('click', () => this.setTool(t.id));
      this.toolbar.appendChild(b);
    }
    document.getElementById('btn-random').addEventListener('click', onRandom);
    document.getElementById('btn-fit').addEventListener('click', onFit);
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = TOOLS.find((tool) => tool.key === e.key);
      if (t) this.setTool(t.id);
    });
    this.setTool(this.tool);
  }

  setTool(id) {
    this.tool = id;
    for (const b of this.toolbar.querySelectorAll('.tool')) {
      b.setAttribute('aria-pressed', String(b.dataset.tool === id));
    }
    this.onTool(id);
  }

  update(city) {
    const s = city.stats;
    const set = (key, el, value, prop = 'textContent') => {
      if (this._last[key] === value) return;
      this._last[key] = value;
      if (prop === 'd') el.setAttribute('d', value);
      else el[prop] = value;
    };
    set('pop', this.popEl, s.population.toLocaleString());
    set('cap', this.capEl, `/${s.capacity.toLocaleString()}`);
    set('happy', this.happyEl, s.homes ? `${s.happiness}%` : '–');
    set('mood', this.moodEl, MOUTHS[s.happiness >= 60 ? 'happy' : s.happiness >= 40 ? 'okay' : 'sad'], 'd');
    if (this._last.meterW !== s.happiness) {
      this._last.meterW = s.happiness;
      this.meterEl.style.width = `${s.homes ? s.happiness : 0}%`;
    }
    set('clock', this.clockEl, `Day ${city.day} · ${formatClock(city.clock)}`);
  }

  toast(message, ms = 2600) {
    this.toastEl.textContent = message;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), ms);
  }
}
