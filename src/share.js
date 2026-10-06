// Share a town as a link. The map is packed into a few bytes per tile, deflated, and put in the URL
// hash (#town=…), so no server is needed. Residents, the Life Story and settings stay at home: the
// visitor's simulation grows the town again from its buildings.

import { STRUCTURES, VARIANT_KEYS } from './config.js';
import { CityState } from './state.js';

const FORMAT = 1;
const TYPES = Object.keys(STRUCTURES); // a type's code is its index + 1; 0 means empty
const HASH_KEY = 'town=';
const VARIANT_TYPES = new Set(['house', 'tower', 'shop', 'office']); // as CityState.createStructure

// Two bytes per tile: [water flag | type code] and [variant | shape | floors].
export function packCity(city) {
  const n = city.width * city.height;
  const out = new Uint8Array(4 + n * 2);
  out[0] = FORMAT;
  out[1] = city.width;
  out[2] = city.height;
  out[3] = Math.min(255, city.day);
  city.tiles.forEach((t, i) => {
    const s = t.structure;
    const code = s ? TYPES.indexOf(s.type) + 1 : 0;
    out[4 + i * 2] = (t.terrain === 'water' ? 0x80 : 0) | (code & 0x3f);
    const variant = Math.max(0, VARIANT_KEYS.indexOf(s?.variant));
    out[5 + i * 2] = (variant & 3) | (((s?.shape || 0) & 3) << 2) | (((s?.floors || 0) & 15) << 4);
  });
  return out;
}

export function unpackCity(bytes) {
  if (bytes[0] !== FORMAT) throw new Error('Unknown town link format');
  const w = bytes[1];
  const h = bytes[2];
  if (!w || !h || bytes.length < 4 + w * h * 2) throw new Error('Town link is incomplete');
  const city = new CityState(w, h);
  city.day = bytes[3] || 1;
  city.tiles.forEach((t, i) => {
    const a = bytes[4 + i * 2];
    const b = bytes[5 + i * 2];
    t.terrain = a & 0x80 ? 'water' : 'grass';
    const type = TYPES[(a & 0x3f) - 1];
    if (!type) return;
    const s = { id: city.nextId++, type, residents: 0 };
    if (VARIANT_TYPES.has(type)) s.variant = VARIANT_KEYS[b & 3];
    if ((b >> 2) & 3) s.shape = (b >> 2) & 3;
    if (b >> 4) s.floors = b >> 4;
    t.structure = s;
  });
  city.refreshAllRoadMasks();
  return city;
}

// Deflate with the browser's built-in compressor, then base64url (URL-safe, no padding).
async function deflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function inflate(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function toBase64Url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromBase64Url(text) {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0));
}

export async function encodeCity(city) {
  return toBase64Url(await deflate(packCity(city)));
}

export async function decodeCity(code) {
  return unpackCity(await inflate(fromBase64Url(code)));
}

export function shareUrl(code, location = window.location) {
  return `${location.origin}${location.pathname}#${HASH_KEY}${code}`;
}

// The code in a #town=… hash, if any.
export function codeFromHash(hash) {
  const h = (hash || '').replace(/^#/, '');
  return h.startsWith(HASH_KEY) ? h.slice(HASH_KEY.length) : null;
}
