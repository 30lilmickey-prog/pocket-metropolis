// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { CityState } from '../src/state.js';
import { Simulation } from '../src/simulation.js';
import { generateTown, generateLand } from '../src/generator.js';
import { soundness, KINDS } from '../src/disasters.js';
import { computeThoughts } from '../src/advisor.js';
import { mulberry32 } from '../src/utils.js';

function town(seed = 5) {
  const city = new CityState(32, 32);
  generateTown(city, seed);
  const sim = new Simulation(city);
  sim.economy.reset('town');
  sim.refresh();
  sim.disasters.rng = mulberry32(seed);
  return { city, sim };
}

// Run the simulation until the current extreme weather has passed; returns its damage report.
function weather(sim, kind) {
  let report = null;
  const off = sim.city.on((e) => {
    if (e.type === 'extremeWeather' && e.phase === 'end') report = e.report;
  });
  sim.disasters.trigger(kind);
  for (let i = 0; i < 20000 && !report; i++) sim.update(0.25);
  off?.();
  return report;
}

test('damage halves what a building can hold, and rubble holds nothing', () => {
  assert.equal(soundness({ type: 'house' }), 1);
  assert.equal(soundness({ type: 'house', damage: 0.2 }), 1);
  assert.equal(soundness({ type: 'house', damage: 0.5 }), 0.5);
  assert.equal(soundness({ type: 'rubble' }), 0);
});

test('a washed-out road blocks traffic until it is repaired or rebuilt', () => {
  const city = new CityState(12, 12);
  generateLand(city, 1);
  for (let x = 1; x < 10; x++) city.apply('road', x, 5);
  const sim = new Simulation(city);
  sim.refresh();
  const t = city.getTile(5, 5);
  sim.disasters.hit(t, 0.6, null, 'washed');
  assert.ok(t.structure.broken);
  assert.equal(city.isRoad(5, 5), false);
  assert.equal(city.getTile(4, 5).roadMask & 2, 0, 'neighbours no longer connect to it');
  assert.ok(city.canApply('road', 5, 5), 'building a road over it rebuilds it');
  city.apply('road', 5, 5);
  assert.equal(city.isRoad(5, 5), true);
});

test('a tornado wrecks buildings, makes the news, and can be repaired in one go', () => {
  const { city, sim } = town(5);
  const homes = city.homes().length;
  const r = weather(sim, 'tornado');
  assert.ok(r, 'the tornado finished');
  assert.ok(r.destroyed + r.damaged >= 5, JSON.stringify(r));
  const rubble = city.tiles.filter((t) => t.structure?.type === 'rubble').length;
  assert.equal(rubble, r.destroyed);
  assert.ok(city.homes().length <= homes);
  assert.ok(city.systems.chronicle.some((c) => c.kind === 'disaster' && /tornado/.test(c.text)));
  assert.ok(computeThoughts(city, sim.milestones).some((t) => t.id === 'repairs'), 'residents ask for repairs');
  const cost = sim.disasters.repairCost();
  sim.economy.state.money = cost.total + 100;
  const done = sim.disasters.repairAll();
  assert.equal(done.count, cost.count);
  assert.equal(Math.round(sim.economy.money), 100);
  assert.equal(sim.disasters.repairCost().count, 0);
  assert.ok(!city.tiles.some((t) => t.structure?.type === 'rubble'), 'rubble cleared');
});

test('a blizzard snows roads in, and they clear when it ends', () => {
  const { city, sim } = town(7);
  sim.disasters.trigger('blizzard');
  const snowed = city.tiles.filter((t) => t.structure?.snowed);
  assert.ok(snowed.length > 0);
  assert.equal(city.isRoad(snowed[0].x, snowed[0].y), false);
  for (let i = 0; i < 20000 && sim.disasters.active; i++) sim.update(0.25);
  assert.equal(city.tiles.filter((t) => t.structure?.snowed).length, 0);
});

test('extreme weather is warned about first, and preparing halves the damage', () => {
  const { city, sim } = town(9);
  city.stats.population = 200;
  sim.disasters.warn('tornado');
  assert.equal(sim.disasters.state.pending.kind, 'tornado');
  assert.equal(sim.decisions.state.pending?.id, 'prepare-tornado');
  const money = sim.economy.money;
  sim.decisions.choose(0);
  assert.ok(sim.disasters.state.prepared);
  assert.equal(sim.economy.money, money - 400);
  // Preparing halves damage from the extreme event.
  sim.disasters.start('tornado');
  const house = city.homes()[0];
  house.structure.damage = 0;
  sim.disasters.hit(house, 0.6, sim.disasters.active, 'tornado');
  assert.ok(Math.abs(house.structure.damage - 0.3) < 1e-9);
});

test('extreme weather respects the setting and gives a new town time to grow', () => {
  const { sim } = town(3);
  sim.disasters.rng = () => 0; // anything that can happen will
  sim.disasters.level = 'off';
  assert.equal(sim.disasters.roll(), null);
  sim.disasters.level = 'gentle';
  sim.city.stats.population = 5;
  assert.equal(sim.disasters.roll(), null, 'a hamlet of 5 is left alone');
  sim.city.stats.population = 300;
  const kind = sim.disasters.roll();
  assert.ok(kind && KINDS[kind]);
});

test('crews repair storm damage over time while there is money', () => {
  const { city, sim } = town(11);
  const r = weather(sim, 'hurricane');
  assert.ok(r.damaged + r.destroyed > 0);
  const before = sim.disasters.repairCost().count;
  for (let i = 0; i < 2400; i++) sim.update(0.25); // two days
  assert.ok(sim.disasters.repairCost().count < before, 'crews fixed something');
  // With no money, nothing more gets repaired.
  sim.disasters.trigger('tornado');
  for (let i = 0; i < 20000 && sim.disasters.active; i++) sim.update(0.25);
  sim.economy.state.money = 0;
  const left = sim.disasters.repairCost().count;
  sim.disasters.repairOne();
  assert.equal(sim.disasters.repairCost().count, left);
  void city;
});
