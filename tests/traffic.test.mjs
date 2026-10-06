// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { CityState } from '../src/state.js';
import { Simulation } from '../src/simulation.js';
import { generateTown } from '../src/generator.js';
import { computeLaborMarket } from '../src/labor.js';
import { planRoad, trafficExcess } from '../src/roadPlanner.js';
import { computeThoughts } from '../src/advisor.js';

// Towers down the west side, offices down the east, joined by one road across the middle.
function corridorTown() {
  const city = new CityState(22, 22);
  for (let y = 1; y <= 20; y++) {
    city.apply('road', 3, y);
    city.apply('road', 17, y);
  }
  for (let x = 4; x <= 16; x++) city.apply('road', x, 10);
  for (let y = 1; y <= 20; y++) {
    if (y === 10) continue;
    city.apply('tower', 2, y);
    city.apply('office', 18, y);
  }
  const sim = new Simulation(city);
  sim.refresh();
  for (const h of city.homes()) h.structure.residents = 7;
  sim.refresh();
  return { city, sim };
}

test('only through traffic counts towards a jam, not turning in at your own door', () => {
  const city = new CityState(8, 4);
  for (let x = 0; x < 8; x++) city.apply('road', x, 1);
  city.apply('tower', 1, 0);
  city.apply('office', 2, 0);
  city.homes()[0].structure.residents = 16;
  computeLaborMarket(city);
  assert.ok(city.getTile(2, 0).workersFilled > 0, 'people still get to work');
  assert.equal(city.getTile(1, 1).congestion, 0, 'the home\'s doorstep');
  assert.equal(city.getTile(2, 1).congestion, 0, 'the office\'s doorstep');
});

test('busy roads cost more, so commuters spread onto a second route', () => {
  const { city } = corridorTown();
  const one = computeLaborMarket(city, { dryRun: true });
  for (let x = 4; x <= 16; x++) city.apply('road', x, 4);
  const two = computeLaborMarket(city, { dryRun: true });
  const onNew = two.load[4 * 22 + 10];
  assert.ok(onNew > 0, 'some drivers take the new road');
  assert.ok(trafficExcess(two.load) < trafficExcess(one.load) * 0.6, 'and total delay drops');
});

test('the planner suggests a road that clears a real bottleneck, without touching the city', () => {
  const { city } = corridorTown();
  const rev = city.revision;
  const filled = city.tiles.map((t) => t.workersFilled);
  const plan = planRoad(city);
  assert.equal(city.revision, rev, 'dry runs change nothing');
  assert.deepEqual(city.tiles.map((t) => t.workersFilled), filled);
  assert.ok(plan.best, 'a fix is found');
  assert.ok(plan.best.gain > 0.3, `gain ${plan.best.gain}`);
  for (const t of plan.best.tiles) assert.ok(!city.getTile(t.x, t.y).structure || city.getTile(t.x, t.y).structure.type === 'tree');
  const before = plan.before;
  city.applyMany('road', plan.best.tiles);
  const after = trafficExcess(computeLaborMarket(city).load);
  assert.ok(after < before * 0.7, 'building it really helps');
});

test('residents complain about traffic only where a new road would help, and say which street', () => {
  const { city } = corridorTown();
  const t = computeThoughts(city, null).find((x) => x.id === 'traffic');
  assert.ok(t, 'the corridor town gets a traffic thought');
  assert.match(t.text, /^\w+ \w+ is jammed with through traffic\.$/);
  assert.ok(t.plan.length > 0 && t.tiles.length > 0);
  assert.match(t.hint, /less delay/);
  // A quiet town has nothing to say about traffic.
  const quiet = new CityState(10, 10);
  for (let x = 0; x < 10; x++) quiet.apply('road', x, 5);
  quiet.apply('house', 2, 4);
  quiet.apply('shop', 7, 4);
  new Simulation(quiet).refresh();
  assert.ok(!computeThoughts(quiet, null).some((x) => x.id === 'traffic'));
});

test('generated towns still settle with jobs filled under the new routing', () => {
  const city = new CityState(32, 32);
  generateTown(city, 3);
  const sim = new Simulation(city);
  sim.refresh();
  for (let i = 0; i < 1200; i++) sim.update(0.25);
  assert.ok(city.stats.employment > 0.85);
});
