// Isometric projection shared by the renderer and input. Grid units in, world pixels out.

import { TILE_W, TILE_H } from './config.js';

export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;

export function gridToWorld(gx, gy, z = 0) {
  return { x: (gx - gy) * HALF_W, y: (gx + gy) * HALF_H - z };
}

export function worldToGrid(wx, wy) {
  const a = wx / HALF_W;
  const b = wy / HALF_H;
  return { gx: (b + a) / 2, gy: (b - a) / 2 };
}

// World-space bounds of a width×height board, with headroom for tall buildings and the base slab.
export function mapBounds(width, height) {
  return {
    left: gridToWorld(0, height).x,
    right: gridToWorld(width, 0).x,
    top: -70,
    bottom: gridToWorld(width, height).y + 22,
  };
}
