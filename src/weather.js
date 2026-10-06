// Seasons and weather. Seasons follow the day count; weather changes every few in-game hours with
// odds that depend on the season. The current spell is saved in city.systems.weather; the smoothed
// intensities the renderer and agents read live in city.derived.weather.

import { clamp } from './utils.js';

export const DAYS_PER_SEASON = 2;
export const SEASONS = [
  { id: 'spring', label: 'Spring' },
  { id: 'summer', label: 'Summer' },
  { id: 'autumn', label: 'Autumn' },
  { id: 'winter', label: 'Winter' },
];

// Odds of each kind of weather per season. Snow only falls in winter.
const ODDS = {
  spring: { clear: 0.5, cloudy: 0.2, rain: 0.25, fog: 0.05 },
  summer: { clear: 0.72, cloudy: 0.13, rain: 0.15 },
  autumn: { clear: 0.38, cloudy: 0.24, rain: 0.28, fog: 0.1 },
  winter: { clear: 0.32, cloudy: 0.2, snow: 0.38, fog: 0.1 },
};

export const WEATHER_LABELS = { clear: 'Clear', cloudy: 'Cloudy', rain: 'Rain', snow: 'Snow', fog: 'Fog' };

export function seasonFor(day) {
  return SEASONS[Math.floor((Math.max(1, day) - 1) / DAYS_PER_SEASON) % SEASONS.length];
}

// How far through the current season we are, 0..1 (used to blend autumn into winter and so on).
export function seasonProgress(day, clock) {
  return (((Math.max(1, day) - 1) % DAYS_PER_SEASON) + clock) / DAYS_PER_SEASON;
}

export class WeatherSystem {
  constructor(city, rng = Math.random) {
    this.city = city;
    this.rng = rng;
    city.derived.weather = { kind: 'clear', rain: 0, snow: 0, fog: 0, cloud: 0, snowCover: 0 };
  }

  get spell() {
    const s = this.city.systems;
    if (!s.weather) s.weather = { kind: 'clear', ends: this.city.day + this.city.clock + 0.2 };
    return s.weather;
  }

  // Pick the next spell of weather for the season.
  roll() {
    const season = seasonFor(this.city.day).id;
    const odds = ODDS[season];
    let r = this.rng();
    let kind = 'clear';
    for (const [k, p] of Object.entries(odds)) {
      if ((r -= p) <= 0) {
        kind = k;
        break;
      }
    }
    // Fog belongs to mornings; outside them it becomes a grey sky.
    if (kind === 'fog' && (this.city.clock < 0.2 || this.city.clock > 0.45)) kind = 'cloudy';
    const length = kind === 'clear' ? 0.25 + this.rng() * 0.35 : 0.1 + this.rng() * 0.2;
    this.city.systems.weather = { kind, ends: this.city.day + this.city.clock + length };
  }

  update(dt) {
    const now = this.city.day + this.city.clock;
    if (now >= this.spell.ends) this.roll();
    const kind = this.spell.kind;
    const w = this.city.derived.weather;
    const ease = (cur, target, rate) => cur + (target - cur) * Math.min(1, dt * rate);
    w.kind = kind;
    w.rain = ease(w.rain, kind === 'rain' ? 1 : 0, 0.25);
    w.snow = ease(w.snow, kind === 'snow' ? 1 : 0, 0.25);
    w.fog = ease(w.fog, kind === 'fog' ? 1 : 0, 0.2);
    w.cloud = ease(w.cloud, kind === 'clear' ? 0 : kind === 'cloudy' || kind === 'fog' ? 0.6 : 1, 0.25);
    // Snow settles through winter and melts away early in spring.
    const season = seasonFor(this.city.day).id;
    const p = seasonProgress(this.city.day, this.city.clock);
    const coverTarget = season === 'winter' ? clamp(0.35 + p * 0.5 + w.snow * 0.3, 0, 1) : season === 'spring' ? clamp(0.4 - p * 2, 0, 1) : 0;
    w.snowCover = ease(w.snowCover, coverTarget, 0.1);
    w.season = season;
  }
}
