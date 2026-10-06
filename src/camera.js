// Camera: smooth pan and zoom. Holds a target the view eases toward; input moves the target.

import { clamp } from './utils.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
    this.tx = 0;
    this.ty = 0;
    this.tzoom = 1;
    this.minZoom = 0.4;
    this.maxZoom = 3.5;
    this.viewW = 1;
    this.viewH = 1;
    this.bounds = null;
    this.smooth = true;
  }

  setViewport(w, h) {
    this.viewW = w;
    this.viewH = h;
  }

  setBounds(b) {
    this.bounds = b;
    this.clampTarget();
  }

  update(dt) {
    const k = this.smooth ? 1 - Math.exp(-dt * 12) : 1;
    this.x += (this.tx - this.x) * k;
    this.y += (this.ty - this.y) * k;
    this.zoom = Math.exp(Math.log(this.zoom) + (Math.log(this.tzoom) - Math.log(this.zoom)) * k);
  }

  screenToWorld(sx, sy) {
    return {
      x: (sx - this.viewW / 2) / this.zoom + this.x,
      y: (sy - this.viewH / 2) / this.zoom + this.y,
    };
  }

  // Dragging moves the view exactly with the finger; the target follows so nothing snaps back.
  panBy(dx, dy) {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.tx = this.x;
    this.ty = this.y;
    this.clampTarget();
  }

  fling(vx, vy) {
    this.tx -= (vx * 0.22) / this.zoom;
    this.ty -= (vy * 0.22) / this.zoom;
    this.clampTarget();
  }

  zoomAt(factor, sx, sy, immediate = false) {
    const nz = clamp(this.tzoom * factor, this.minZoom, this.maxZoom);
    const ox = sx - this.viewW / 2;
    const oy = sy - this.viewH / 2;
    const wx = ox / this.tzoom + this.tx;
    const wy = oy / this.tzoom + this.ty;
    this.tzoom = nz;
    this.tx = wx - ox / nz;
    this.ty = wy - oy / nz;
    this.clampTarget();
    if (immediate) {
      this.x = this.tx;
      this.y = this.ty;
      this.zoom = this.tzoom;
    }
  }

  // Frame the whole board inside the area left free by the interface.
  fit(insets = { top: 0, right: 0, bottom: 0, left: 0 }, immediate = false) {
    const b = this.bounds;
    if (!b) return;
    const availW = Math.max(120, this.viewW - insets.left - insets.right);
    const availH = Math.max(120, this.viewH - insets.top - insets.bottom);
    const z = clamp(Math.min(availW / (b.right - b.left), availH / (b.bottom - b.top)) * 0.94, 0.3, 2.2);
    this.minZoom = Math.min(0.4, z * 0.7);
    this.tzoom = z;
    this.tx = (b.left + b.right) / 2 - (insets.left - insets.right) / 2 / z;
    this.ty = (b.top + b.bottom) / 2 - (insets.top - insets.bottom) / 2 / z;
    if (immediate) {
      this.x = this.tx;
      this.y = this.ty;
      this.zoom = z;
    }
  }

  clampTarget() {
    const b = this.bounds;
    if (!b) return;
    this.tx = clamp(this.tx, b.left, b.right);
    this.ty = clamp(this.ty, b.top, b.bottom);
    this.x = clamp(this.x, b.left - 200, b.right + 200);
    this.y = clamp(this.y, b.top - 200, b.bottom + 200);
  }
}
