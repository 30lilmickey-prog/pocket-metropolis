import test from 'node:test';
import assert from 'node:assert/strict';
import { CityState } from '../src/state.js';
import { WeatherSystem, seasonFor, DAYS_PER_SEASON } from '../src/weather.js';
import { mulberry32 } from '../src/utils.js';

test('seasons follow the day count and repeat every year', () => {
  const order = [];
  for (let d = 1; d <= DAYS_PER_SEASON * 5; d += DAYS_PER_SEASON) order.push(seasonFor(d).id);
  assert.deepEqual(order, ['spring', 'summer', 'autumn', 'winter', 'spring']);
});

// Run the weather for a whole season and record every kind of spell seen.
function kindsDuring(seasonIndex, seed) {
  const city = new CityState(8, 8);
  city.day = 1 + seasonIndex * DAYS_PER_SEASON;
  city.clock = 0;
  const weather = new WeatherSystem(city, mulberry32(seed));
  const kinds = new Set();
  for (let i = 0; i < DAYS_PER_SEASON * 300; i++) {
    city.clock += 1 / 300;
    if (city.clock >= 1) {
      city.clock -= 1;
      city.day++;
    }
    if (seasonFor(city.day).id !== seasonFor(1 + seasonIndex * DAYS_PER_SEASON).id) break;
    weather.update(1);
    kinds.add(city.systems.weather.kind);
  }
  return { kinds, city };
}

test('snow only falls in winter, and rain does not', () => {
  for (const seed of [1, 2, 3]) {
    assert.ok(!kindsDuring(1, seed).kinds.has('snow'), 'no snow in summer');
    assert.ok(!kindsDuring(3, seed).kinds.has('rain'), 'no rain in winter');
  }
});

test('weather changes over a season rather than sticking', () => {
  const { kinds } = kindsDuring(0, 9);
  assert.ok(kinds.size >= 2, `saw ${[...kinds]}`);
});

test('snow settles in winter and is gone by summer', () => {
  const { city } = kindsDuring(3, 4);
  assert.ok(city.derived.weather.snowCover > 0.3);
  assert.equal(kindsDuring(1, 4).city.derived.weather.snowCover, 0);
});
