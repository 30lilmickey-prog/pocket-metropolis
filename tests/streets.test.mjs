// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { CityState } from '../src/state.js';
import { Simulation } from '../src/simulation.js';
import { generateTown } from '../src/generator.js';
import { computeStreets, shortName, addressOf } from '../src/streets.js';
import { LifeSystem } from '../src/life.js';
import { mulberry32 } from '../src/utils.js';

const road = (city, x0, y0, x1, y1) => {
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) city.apply('road', x, y);
};

test('a straight road is one named street; a crossing road gets its own name', () => {
  const city = new CityState(12, 12);
  road(city, 0, 5, 11, 5);
  road(city, 6, 0, 6, 11);
  computeStreets(city);
  const main = city.getTile(1, 5).street;
  const cross = city.getTile(6, 1).street;
  assert.ok(main && cross && main !== cross);
  for (let x = 0; x < 12; x++) if (x !== 6) assert.equal(city.getTile(x, 5).street, main);
  assert.match(main, /(Street|Road|Lane)$/, 'roads along x are streets, roads or lanes');
  assert.match(cross, /(Avenue|Way|Row)$/);
});

test('buildings get house numbers: odd on one side, even on the other, rising along the street', () => {
  const city = new CityState(12, 12);
  road(city, 0, 5, 11, 5);
  for (const x of [1, 2, 3]) {
    city.apply('house', x, 4);
    city.apply('house', x, 6);
  }
  city.apply('shop', 8, 4);
  computeStreets(city);
  const num = (x, y) => Number(city.getTile(x, y).address.split(' ')[0]);
  const name = city.getTile(1, 5).street;
  assert.ok(city.getTile(1, 4).address.endsWith(name));
  assert.notEqual(num(1, 4) % 2, num(1, 6) % 2, 'opposite sides');
  assert.ok(num(1, 4) < num(2, 4) && num(2, 4) < num(3, 4));
  const all = city.tiles.filter((t) => t.address).map((t) => t.address);
  assert.equal(new Set(all).size, all.length, 'every address is unique');
  assert.match(addressOf(city.getTile(8, 4)), /^\d+ /);
  city.apply('house', 10, 10); // no road
  computeStreets(city);
  assert.equal(addressOf(city.getTile(10, 10)), '10, 10');
});

test('names stay put when a road grows, are saved, and the longer half keeps the name when split', () => {
  const city = new CityState(16, 16);
  road(city, 0, 5, 9, 5);
  computeStreets(city);
  const name = city.getTile(0, 5).street;
  road(city, 10, 5, 15, 5);
  computeStreets(city);
  assert.equal(city.getTile(15, 5).street, name, 'extended street keeps its name');
  const copy = CityState.fromJSON(JSON.parse(JSON.stringify(city.toJSON())));
  computeStreets(copy);
  assert.equal(copy.getTile(3, 5).street, name, 'saved with the city');
  city.apply('bulldoze', 4, 5);
  computeStreets(city);
  assert.equal(city.getTile(10, 5).street, name, 'the longer piece keeps the name');
  assert.notEqual(city.getTile(1, 5).street, name);
  city.reset();
  assert.equal(city.systems.streets, undefined, 'a new town gets new names');
});

test('a generated town has addresses for every building on a road, and the simulation keeps them fresh', () => {
  const city = new CityState(32, 32);
  generateTown(city, 3);
  const sim = new Simulation(city);
  sim.refresh();
  const homes = city.homes().filter((h) => city.accessRoad(h.x, h.y));
  assert.ok(homes.length > 10);
  for (const h of homes) assert.match(h.address, /^\d+ \w+ (Street|Road|Lane|Avenue|Way|Row)$/);
  const names = new Set(city.derived.streets.map((r) => r.name));
  assert.equal(names.size, city.derived.streets.length, 'no two streets share a name');
  const t = city.tiles.find((x) => !x.structure && x.terrain === 'grass' && city.accessRoad(x.x, x.y));
  city.apply('house', t.x, t.y);
  sim.tick();
  assert.ok(t.address, 'a new house gets an address on the next tick');
  assert.equal(shortName('Lavender Avenue'), 'Lavender Ave');
});

test('Life Story text uses addresses instead of map coordinates', () => {
  const city = new CityState(32, 32);
  generateTown(city, 5);
  new Simulation(city).refresh();
  const life = new LifeSystem(city, { rng: mulberry32(1) });
  const c = life.create({ first: 'Ava', last: 'Park', look: {}, traits: [] });
  const home = city.getTile(c.home.x, c.home.y);
  assert.ok(c.log[0].text.includes(home.address), c.log[0].text);
  assert.equal(life.vars().address, home.address);
  const n = life.neighbour();
  assert.equal(n.address, city.getTile(n.x, n.y).address);
});
