// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { CityState } from '../src/state.js';
import { Simulation } from '../src/simulation.js';
import { generateTown } from '../src/generator.js';
import { LifeSystem, familyAt, homePrice, summaryOf } from '../src/life.js';
import { LIFE_EVENTS } from '../src/lifeEvents.js';
import { pickEvent } from '../src/lifeEngine.js';
import { AgentSystem } from '../src/agents.js';
import { mulberry32 } from '../src/utils.js';

function town(seed = 5) {
  const city = new CityState(32, 32);
  generateTown(city, seed);
  const sim = new Simulation(city);
  sim.refresh();
  return { city, sim };
}
const baby = (life) => life.create({ first: 'Ava', last: 'Park', pronouns: 'she', look: { outfit: '#ff8f7e' }, traits: ['curious', 'calm'] });

test('babies have no activities; older characters get a few a year', () => {
  const { city } = town();
  const life = new LifeSystem(city, { rng: mulberry32(1) });
  const c = baby(life);
  assert.equal(life.activities().filter((a) => !a.blocked).length, 0);
  c.age = 9;
  life.birthday(); // 10: energy refills
  assert.equal(c.energy, 2);
  const list = life.activities();
  assert.ok(list.some((a) => a.id === 'study'));
  for (const a of list) assert.ok(!/[{}]/.test(a.label + a.hint), `filled: ${a.label} / ${a.hint}`);
  const before = c.stats.smarts;
  const r = life.doActivity('study');
  assert.ok(r.text && !/[{}]/.test(r.text));
  assert.ok(c.stats.smarts >= before);
  assert.equal(c.energy, 1);
  assert.equal(c.log[0].text, r.text);
  life.doActivity('rest');
  assert.equal(c.energy, 0);
  assert.equal(life.doActivity('study'), null, 'out of energy');
  assert.ok(life.activities().every((a) => a.blocked));
  life.birthday();
  assert.equal(c.energy, 2, 'rested by the next birthday');
});

test('activities wait while an event is open, and cost money when they say so', () => {
  const { city } = town();
  const life = new LifeSystem(city, { rng: mulberry32(2) });
  const c = baby(life);
  c.age = 20;
  c.energy = 3;
  c.money = 50;
  const shop = life.activities().find((a) => a.id === 'shopping');
  if (shop) assert.match(shop.blocked, /Needs \$150/);
  c.money = 1000;
  life.fireEvent('quiet_day');
  assert.equal(life.doActivity('rest'), null);
  life.choose(0);
  if (shop) {
    life.doActivity('shopping');
    assert.ok(c.money <= 1000 - 150 + 80);
  }
});

test('buying a home spends savings on a real house in the city', () => {
  const { city } = town();
  const life = new LifeSystem(city, { rng: mulberry32(3) });
  const c = baby(life);
  c.age = 30;
  c.energy = 3;
  c.money = 500000;
  const old = { ...c.home };
  const r = life.doActivity('buy_home');
  assert.equal(r.launched, 'buy_home');
  assert.equal(c.pending.id, 'buy_home');
  const view = life.current();
  assert.match(view.text, /\$500,000/);
  const data = c.pending.choices[0].data;
  assert.ok(data.price > 10000);
  life.choose(0);
  assert.deepEqual(c.home, { x: data.x, y: data.y });
  assert.notDeepEqual(c.home, old);
  assert.equal(c.flags.ownsHome, true);
  assert.equal(c.livesWithParents, false);
  assert.equal(c.money, 500000 - data.price);
  assert.ok(city.systems.life.achievements.homeowner);
});

test('house prices follow desirability, and buying is never a random pop-up', () => {
  const { city } = town();
  const homes = city.homes();
  const t = homes[0];
  t.desirability = 0.2;
  const cheap = homePrice(t);
  t.desirability = 0.9;
  assert.ok(homePrice(t) > cheap);
  const life = new LifeSystem(city, { rng: mulberry32(4) });
  const c = baby(life);
  c.age = 30;
  c.money = 1e6;
  const ctx = life.ctx();
  for (let i = 0; i < 300; i++) assert.notEqual(pickEvent(LIFE_EVENTS, ctx, Math.random)?.id, 'buy_home');
});

test('neighbours are real nearby homes with stable family names', () => {
  const { city } = town();
  const life = new LifeSystem(city, { rng: mulberry32(5) });
  baby(life);
  const n = life.neighbour();
  assert.ok(n, 'the starter town has neighbours');
  const t = city.getTile(n.x, n.y);
  assert.ok(t.structure.residents > 0);
  assert.deepEqual(familyAt(t), n);
  assert.match(life.vars().neighbour, /^the \w+ family$/);
});

test('achievements are earned once and kept across lives; a finished life gets a ribbon', () => {
  const { city } = town();
  let earned = [];
  city.on((e) => e.type === 'achievement' && earned.push(e.achievement.id));
  const life = new LifeSystem(city, { rng: mulberry32(6) });
  const c = baby(life);
  assert.deepEqual(earned, ['first_breath']);
  c.stats.smarts = 95;
  life.checkAchievements();
  life.checkAchievements();
  assert.deepEqual(earned, ['first_breath', 'bookworm']);
  assert.equal(city.systems.life.achievements.bookworm.by, 'Ava Park');
  c.age = 101;
  life.die('old age');
  assert.equal(c.ribbon.label, 'Centenarian');
  assert.ok(earned.includes('centenarian'));
  assert.equal(summaryOf(c).ribbon.id, 'centenarian');
  life.create({ first: 'Kai', last: 'Osei', look: {}, traits: [] });
  assert.ok(city.systems.life.achievements.bookworm, 'kept for the next life');
});

test('the town growing into a City sets off a festival event', () => {
  const { city, sim } = town();
  const life = new LifeSystem(city, { rng: mulberry32(7) });
  const c = baby(life);
  c.age = 20;
  const tier = sim.milestones.reached;
  assert.equal(c.flags.townTier, tier);
  assert.ok(!LIFE_EVENTS.find((e) => e.id === 'town_milestone').when(life.ctx()));
  sim.milestones.state.reached = 3;
  assert.ok(LIFE_EVENTS.find((e) => e.id === 'town_milestone').when(life.ctx()));
  life.fireEvent('town_milestone');
  assert.match(life.current().text, /became a City/);
  life.choose(0);
  assert.equal(c.flags.sawCity, true);
  assert.ok(city.systems.life.achievements.witness);
});

test('lives with activities every year play out to the end without errors', () => {
  for (const seed of [11, 12, 13, 14]) {
    const { city } = town(seed);
    const rng = mulberry32(seed);
    const life = new LifeSystem(city, { rng });
    const c = baby(life);
    let guard = 0;
    while (c.alive && guard++ < 600) {
      if (c.pending) {
        const view = life.current();
        assert.ok(!/\{\w+\}/.test(view.text), `${c.pending.id}: ${view.text}`);
        life.choose(Math.floor(rng() * c.pending.choices.length));
        continue;
      }
      const open = life.activities().filter((a) => !a.blocked);
      if (open.length) {
        const r = life.doActivity(open[Math.floor(rng() * open.length)].id);
        assert.ok(r, 'an open activity runs');
        if (r.text) assert.ok(!/\{\w+\}/.test(r.text), r.text);
      } else life.ageUp();
    }
    assert.equal(c.alive, false, `seed ${seed} ended`);
    assert.ok(c.activityCount > 20);
    assert.ok(c.ribbon);
  }
});

test('the character walks out of their home on the map', () => {
  const { city } = town();
  const life = new LifeSystem(city, { rng: mulberry32(9) });
  const c = baby(life);
  const agents = new AgentSystem(city);
  agents.update(3, 1);
  assert.equal(agents.hero, null, 'babies stay in');
  c.age = 8;
  for (let i = 0; i < 40 && !agents.hero; i++) agents.update(0.25, 1);
  assert.ok(agents.hero, 'out and about');
  assert.deepEqual(agents.hero.home, c.home);
  assert.equal(agents.hero.shirt, '#ff8f7e');
  assert.ok(agents.walkers.includes(agents.hero));
  const job = city.workplaces().find((w) => city.accessRoad(w.x, w.y));
  const path = agents.pathTo(c.home, job);
  if (path) {
    assert.deepEqual(path[0], c.home);
    assert.deepEqual(path[path.length - 1], { x: job.x, y: job.y });
  }
});
