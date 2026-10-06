// Time of day as simulation data. `clock` runs 0..1 per day: 0 = midnight, 0.25 = sunrise, 0.5 = noon.

import { smoothstep } from './utils.js';

export function sunHeight(clock) {
  return Math.sin((clock - 0.25) * Math.PI * 2);
}

// 0 at night, 1 in full daylight. Agents use it to decide how busy the streets are.
export function daylightAt(clock) {
  return smoothstep(-0.18, 0.22, sunHeight(clock));
}

export function formatClock(clock) {
  const mins = Math.floor((((clock % 1) + 1) % 1) * 1440);
  const h24 = Math.floor(mins / 60);
  const m = String(mins % 60).padStart(2, '0');
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m} ${h24 < 12 ? 'AM' : 'PM'}`;
}
