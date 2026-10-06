// Undo and redo for player edits. Each entry stores the affected tiles before and after the edit,
// so a whole drag stroke (or a Random Town) undoes in one step.

const LIMIT = 40;

export class History {
  constructor(city) {
    this.city = city;
    this.undoStack = [];
    this.redoStack = [];
    this.listeners = new Set();
  }

  on(fn) {
    this.listeners.add(fn);
  }

  changed() {
    for (const fn of this.listeners) fn(this);
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  // Run `edit` and remember what it changed. `coords` lists every tile the edit may touch.
  record(label, coords, edit) {
    const before = this.city.snapshot(coords);
    const result = edit();
    if (!result) return result;
    const after = this.city.snapshot(coords);
    this.undoStack.push({ label, before, after });
    if (this.undoStack.length > LIMIT) this.undoStack.shift();
    this.redoStack.length = 0;
    this.changed();
    return result;
  }

  undo() {
    const e = this.undoStack.pop();
    if (!e) return null;
    this.city.restore(e.before);
    this.redoStack.push(e);
    this.changed();
    return e.label;
  }

  redo() {
    const e = this.redoStack.pop();
    if (!e) return null;
    this.city.restore(e.after);
    this.undoStack.push(e);
    this.changed();
    return e.label;
  }

  clear() {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
    this.changed();
  }
}

// Tiles between two points as an L: along the longer axis first, then the shorter. Used for roads.
export function lPath(a, b) {
  const out = [];
  const horizontalFirst = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y);
  const sx = Math.sign(b.x - a.x);
  const sy = Math.sign(b.y - a.y);
  let { x, y } = a;
  out.push({ x, y });
  if (horizontalFirst) {
    while (x !== b.x) out.push({ x: (x += sx), y });
    while (y !== b.y) out.push({ x, y: (y += sy) });
  } else {
    while (y !== b.y) out.push({ x, y: (y += sy) });
    while (x !== b.x) out.push({ x: (x += sx), y });
  }
  return out;
}

// Every tile a straight segment passes through, so fast brush strokes leave no gaps.
export function tileLine(a, b) {
  const out = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - x);
  const dy = -Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1;
  const sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}
