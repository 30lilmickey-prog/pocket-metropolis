// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { CityState } from '../src/state.js';
import { Simulation } from '../src/simulation.js';
import { generateTown, generateLand } from '../src/generator.js';
import { Milestones } from '../src/milestones.js';
import { encodeCity, decodeCity } from '../src/share.js';
import { LifeSystem } from '../src/life.js';
import { mulberry32 } from '../src/utils.js';

test('empty land has water and woods but nothing built, and room in the middle', () => {
  for (const size of [16, 32, 48]) {
    const city = new CityState(size, size);
    generateLand(city, 4);
    const built = city.tiles.filter((t) => t.structure && t.structure.type !== 'tree');
    assert.equal(built.length, 0, `${size}: nothing but trees`);
    assert.ok(city.tiles.some((t) => t.terrain === 'water'), `${size}: a river`);
    const mid = Math.floor(size / 2);
    let open = 0;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (!city.getTile(mid + dx, mid + dy).structure) open++;
    assert.ok(open >= 15, `${size}: open ground to start on (${open}/25)`);
  }
});

test('sandbox unlocks everything at once; milestone mode starts locked on empty land', () => {
  const city = new CityState(16, 16);
  generateLand(city, 1);
  const m = new Milestones(city);
  assert.equal(m.isUnlocked('tower'), false);
  assert.equal(m.isUnlocked('field'), false);
  city.systems.mode = 'sandbox';
  assert.equal(m.sandbox, true);
  for (const tool of ['tower', 'office', 'clinic', 'school', 'playground', 'field']) assert.ok(m.isUnlocked(tool), tool);
});

test('starter towns fit small and large maps, and both simulate', () => {
  for (const size of [16, 48]) {
    const city = new CityState(size, size);
    generateTown(city, 9);
    const sim = new Simulation(city);
    sim.refresh();
    for (let i = 0; i < 400; i++) sim.update(0.25);
    assert.ok(city.homes().length > 3, `${size}: homes`);
    assert.ok(city.stats.population > 0, `${size}: people`);
  }
});

test('a town built from scratch grows: road, houses and a shop', () => {
  const city = new CityState(16, 16);
  generateLand(city, 2);
  city.systems.mode = 'sandbox';
  const sim = new Simulation(city);
  sim.refresh();
  const y = 8;
  for (let x = 2; x < 14; x++) city.apply('road', x, y);
  for (const x of [3, 4, 5, 6]) city.apply('house', x, y - 1);
  city.apply('shop', 10, y - 1);
  for (let i = 0; i < 1200; i++) sim.update(0.25);
  assert.ok(city.stats.population > 0, 'people move in');
  assert.ok(city.stats.employed > 0, 'and find work');
});

test('a sandbox town keeps its mode in a share link', async () => {
  const city = new CityState(16, 16);
  generateLand(city, 3);
  city.systems.mode = 'sandbox';
  city.day = 9;
  const copy = await decodeCity(await encodeCity(city));
  assert.equal(copy.systems.mode, 'sandbox');
  assert.equal(copy.day, 9);
});

test('a Life Story survives moving to empty land and finds a home once one is built', () => {
  const city = new CityState(32, 32);
  generateTown(city, 5);
  new Simulation(city).refresh();
  const life = new LifeSystem(city, { rng: mulberry32(2) });
  life.create({ first: 'Ava', last: 'Park', look: {}, traits: [] });
  const fresh = new CityState(16, 16);
  generateLand(fresh, 1);
  fresh.systems.life = city.systems.life;
  city.copyFrom(fresh);
  life.syncWithCity();
  assert.equal(life.char.first, 'Ava');
  assert.equal(life.char.home, null, 'no homes yet');
  for (let x = 2; x < 10; x++) city.apply('road', x, 8);
  city.apply('house', 4, 7);
  life.syncWithCity();
  assert.ok(life.char.home, 'moves into the first house');
});
