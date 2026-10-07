// The town decision card: a question, two or three choices with what each one does, and a Later
// button that tucks it into a small "Decision waiting" pill. Unanswered questions lapse after a day.

import { effectTags } from './decisions.js';
import { ERAS } from './eras.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export class DecisionCard {
  constructor({ decisions, onChoose, onOpen }) {
    this.decisions = decisions; // () → Decisions
    this.onChoose = onChoose; // (index) → apply the choice
    this.onOpen = onOpen;
    this.el = document.getElementById('decision-card');
    this.pill = document.createElement('button');
    this.pill.type = 'button';
    this.pill.className = 'pill glass decision-pill';
    this.pill.hidden = true;
    this.pill.innerHTML = '<span aria-hidden="true">⚖</span><span>Town decision waiting</span>';
    document.getElementById('app').appendChild(this.pill);
    this.pill.addEventListener('click', () => this.show());
    this.el.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.later != null) return this.minimize();
      if (b.dataset.choice != null) this.onChoose(Number(b.dataset.choice));
    });
    this._id = null;
  }

  // `auto` is a question that just arrived: if a Life Story event is on screen, it waits in the pill
  // instead of covering it.
  show({ auto = false } = {}) {
    const p = this.decisions().pending;
    if (!p) return this.hide();
    if (auto && !document.getElementById('life-card')?.hidden) return this.minimize();
    this.onOpen?.();
    this.render(p);
    this.el.hidden = false;
    this.pill.hidden = true;
  }

  minimize() {
    this.el.hidden = true;
    this.pill.hidden = !this.decisions().pending;
  }

  hide() {
    this.el.hidden = true;
    this.pill.hidden = true;
    this._id = null;
  }

  // Keep the card in step with the simulation (a question can lapse while it's tucked away).
  tick() {
    const p = this.decisions().pending;
    if (!p) {
      if (!this.el.hidden || !this.pill.hidden) this.hide();
      return;
    }
    if (!this.el.hidden) this.render(p);
  }

  render(p) {
    const d = p.decision;
    const dec = this.decisions();
    const era = ERAS[dec.eras?.index ?? 0];
    const key = `${d.id}|${d.choices.map((c) => dec.canAfford(c)).join()}`;
    if (key === this._id) return;
    this._id = key;
    this.el.innerHTML =
      `<span class="insp-kicker">Town decision · ${esc(era?.label || '')}</span>` +
      `<h2>${esc(d.title)}</h2><p>${esc(d.text)}</p>` +
      `<div class="decision-choices">${d.choices
        .map((c, i) => {
          const ok = dec.canAfford(c);
          const tags = effectTags(c)
            .map((t) => `<span class="dtag ${t.tone}">${esc(t.text)}</span>`)
            .join('');
          return `<button type="button" class="decision-choice" data-choice="${i}" ${ok ? '' : 'disabled'}><b>${esc(c.label)}</b><span class="dtags">${tags || '<span class="dtag">No change</span>'}</span>${ok ? '' : '<small>Not enough money</small>'}</button>`;
        })
        .join('')}</div>` +
      '<div class="decision-foot"><small>If nobody decides within a day, the last choice happens.</small><button type="button" class="ghost-btn small" data-later>Later</button></div>';
  }
}
