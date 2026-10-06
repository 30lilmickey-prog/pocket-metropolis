// Colour helpers for the renderer. `lit` applies a face shade and the current ambient light.

const cache = new Map();

export function rgbOf(hex) {
  let c = cache.get(hex);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    cache.set(hex, c);
  }
  return c;
}

const to255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

export function lit(hex, shade, L) {
  const [r, g, b] = rgbOf(hex);
  const a = L.ambient;
  return `rgb(${to255(r * shade * a[0])},${to255(g * shade * a[1])},${to255(b * shade * a[2])})`;
}

export function litA(hex, shade, L, alpha) {
  const [r, g, b] = rgbOf(hex);
  const a = L.ambient;
  return `rgba(${to255(r * shade * a[0])},${to255(g * shade * a[1])},${to255(b * shade * a[2])},${alpha})`;
}

export function rgba(hex, alpha) {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function mixHex(a, b, t) {
  const ca = rgbOf(a);
  const cb = rgbOf(b);
  const m = (i) => Math.round(ca[i] + (cb[i] - ca[i]) * t);
  return `#${((1 << 24) | (m(0) << 16) | (m(1) << 8) | m(2)).toString(16).slice(1)}`;
}
