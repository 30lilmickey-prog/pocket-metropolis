// Lighting: turns the simulation clock into everything the renderer needs to light a frame.

import { daylightAt, sunHeight } from './time.js';
import { mixHex } from './color.js';
import { lerp, smoothstep } from './utils.js';

// [clock, sky top, sky bottom]
const SKY = [
  [0.0, '#262a55', '#4a437c'],
  [0.2, '#2f3263', '#5d4f88'],
  [0.26, '#9ba8da', '#ffc8b5'],
  [0.34, '#a8d5ee', '#f6ebe0'],
  [0.5, '#9fd4f0', '#e5f5f1'],
  [0.66, '#a9d0eb', '#f8e9dc'],
  [0.74, '#8d87ca', '#ffb8a7'],
  [0.8, '#3b3b70', '#6d5692'],
  [1.0, '#262a55', '#4a437c'],
];

function skyAt(clock) {
  for (let i = 0; i < SKY.length - 1; i++) {
    const a = SKY[i];
    const b = SKY[i + 1];
    if (clock >= a[0] && clock <= b[0]) {
      const t = smoothstep(0, 1, (clock - a[0]) / (b[0] - a[0]));
      return [mixHex(a[1], b[1], t), mixHex(a[2], b[2], t)];
    }
  }
  return [SKY[0][1], SKY[0][2]];
}

let lastLighting = null;

// Lighting only shifts visibly every few frames; reuse the previous object (and its colour cache) until it does.
export function lightingAt(clock) {
  if (lastLighting && Math.abs(lastLighting.clock - clock) < 0.0004) return lastLighting;
  lastLighting = computeLighting(clock);
  return lastLighting;
}

function computeLighting(clock) {
  const daylight = daylightAt(clock);
  const sun = sunHeight(clock);
  const warm = Math.exp(-(((sun - 0.05) / 0.2) ** 2)); // golden hour near the horizon
  const night = [0.5, 0.55, 0.82];
  const ambient = [
    lerp(night[0], 1, daylight) * (1 + 0.07 * warm),
    lerp(night[1], 1, daylight) * (1 - 0.01 * warm),
    lerp(night[2], 1, daylight) * (1 - 0.1 * warm),
  ];
  const [skyTop, skyBottom] = skyAt(clock);

  // Most windows light up in the evening; past midnight many residents are asleep.
  const lateNight = smoothstep(0.02, 0.1, clock) * (1 - smoothstep(0.19, 0.25, clock));
  const windowLit = (1 - daylight) * (1 - 0.6 * lateNight);
  const lamps = 1 - smoothstep(0.2, 0.55, daylight);

  // Shadows sweep from one side to the other as the sun crosses the sky.
  const az = Math.cos((clock - 0.25) * Math.PI * 2); // 1 at sunrise, -1 at sunset
  const len = 0.011 / Math.max(0.28, sun);
  const shadow = {
    alpha: 0.17 * smoothstep(0.02, 0.3, sun),
    dx: (0.35 - 0.65 * az) * len,
    dy: (0.35 + 0.65 * az) * len,
  };

  return { clock, daylight, ambient, skyTop, skyBottom, windowLit, lamps, shadow, warm };
}
