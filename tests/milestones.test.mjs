// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { CityState } from '../src/state.js';
import { Milestones, tierFor, unlockTier } from '../src/milestones.js';
import { computeThoughts } from '../src/advisor.js';
import { computeCoverage } from '../src/coverage.js';
import { computeLaborMarket } from '../src/labor.js';
import { recomputeDesirability } from '../src/desirability.js';
import { MILESTONES } from '../src/config.js';

function derive(city) {
  computeCoverage(city);
  city.derived.labor = computeLaborMarket(city);
  recomputeDesirability(city);
}

test('titles follow population and unlocks are permanent', () => {
  const city = new CityState(8, 8);
  const events = [];
  city.on((e) => e.type === 'milestone' && events.push(e.milestone.id));
  const m = new Milestones(city);
  assert.equal(m.reached, 0);
  assert.equal(m.isUnlocked('house'), true, 'tools without a milestone are always available');
  assert.equal(m.isUnlocked('school'), false);
  city.stats.population = 75;
  assert.equal(m.update().id, 'village');
  assert.equal(m.isUnlocked('school'), true);
  assert.equal(m.isUnlocked('tower'), false);
  city.stats.population = 10; // everyone moves away…
  assert.equal(m.update(), null);
  assert.equal(m.isUnlocked('school'), true, '…but unlocks stay');
  city.stats.population = 5000;
  m.update();
  assert.deepEqual(events, ['village', 'metropolis']);
  assert.equal(m.progress().next, null);
  assert.equal(m.progress().fraction, 1);
});

test('milestone progress is saved and a loaded city settles quietly', () => {
  const city = new CityState(8, 8);
  city.stats.population = 250;
  const m = new Milestones(city);
  assert.equal(m.reached, tierFor(250), 'an old save starts at the title it has earned');
  const copy = CityState.fromJSON(JSON.parse(JSON.stringify(city.toJSON())));
  assert.equal(new Milestones(copy).reached, m.reached);
  assert.equal(unlockTier('field'), MILESTONES.findIndex((x) => x.id === 'city'));
  assert.equal(unlockTier('road'), -1);
});

test('settleForCapacity grants a ready-made town its title without a celebration', () => {
  const city = new CityState(8, 8);
  let fired = 0;
  city.on((e) => e.type === 'milestone' && fired++);
  city.stats.capacity = 400;
  const m = new Milestones(city);
  m.settleForCapacity();
  assert.equal(MILESTONES[m.reached].id, 'town');
  assert.equal(fired, 0);
  m.settle(0);
  assert.equal(MILESTONES[m.reached].id, 'town', 'settling never lowers the title');
});

test('playgrounds provide fun coverage that raises nearby desirability', () => {
  const city = new CityState(14, 14);
  for (let x = 0; x < 14; x++) city.apply('road', x, 7);
  city.apply('house', 3, 6);
  city.apply('house', 12, 8);
  derive(city);
  const before = city.getTile(3, 6).desirability;
  city.apply('playground', 4, 6);
  derive(city);
  assert.ok(city.getTile(3, 6).coverage.fun > 0.5);
  assert.ok(city.getTile(3, 6).factors.entertainment > 0);
  assert.ok(city.getTile(3, 6).desirability > before);
  assert.equal(city.getTile(12, 8).coverage.fun, 0, 'out of range');
  assert.ok(city.isWalkable(4, 6), 'kids can walk into the playground');
});

test('residents wish for roads, jobs and services, with a happy note last', () => {
  const city = new CityState(14, 14);
  for (let x = 0; x < 14; x++) city.apply('road', x, 7);
  city.apply('house', 2, 6);
  city.apply('house', 3, 6);
  city.apply('house', 10, 2); // no road
  for (const h of city.homes()) h.structure.residents = 4;
  derive(city);
  const m = new Milestones(city);
  m.state.reached = 1; // village: school and playground unlocked, clinic not yet
  const thoughts = computeThoughts(city, m);
  const ids = thoughts.map((t) => t.id);
  assert.equal(ids[0], 'no-road', 'the most urgent wish comes first');
  assert.equal(thoughts[0].x, 10);
  assert.ok(ids.includes('jobs'));
  assert.ok(ids.includes('school'));
  assert.ok(!ids.includes('health'), 'locked buildings are never asked for');
  assert.equal(ids[ids.length - 1], 'happy');
  assert.ok(thoughts.length <= 5);
  for (const t of thoughts) assert.ok(t.text && t.hint);
});

test('no thoughts in an empty town', () => {
  const city = new CityState(6, 6);
  derive(city);
  assert.deepEqual(computeThoughts(city, new Milestones(city)), []);
});
