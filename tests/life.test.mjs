import test from 'node:test';
import assert from 'node:assert/strict';
import { CityState } from '../src/state.js';
import { Simulation } from '../src/simulation.js';
import { generateTown } from '../src/generator.js';
import { LifeSystem, YEAR_SECONDS } from '../src/life.js';
import { fill } from '../src/lifeEngine.js';
import { LIFE_EVENTS } from '../src/lifeEvents.js';
import { mulberry32 } from '../src/utils.js';
import { STRUCTURES } from '../src/config.js';

function town(seed = 5) {
  const city = new CityState(32, 32);
  generateTown(city, seed);
  const sim = new Simulation(city);
  sim.refresh();
  return { city, sim };
}

const baby = (life) => life.create({ first: 'Ava', last: 'Park', pronouns: 'she', look: {}, traits: ['curious', 'calm'] });

test('placeholders fill in pronouns and capitalise when asked', () => {
  const vars = { name: 'Ava', they: 'she', their: 'her' };
  assert.equal(fill('{name} lost {their} hat. {They} laughed.', vars), 'Ava lost her hat. She laughed.');
});

test('a life starts as a baby in a home in the city', () => {
  const { city } = town();
  const life = new LifeSystem(city, { rng: mulberry32(1) });
  const c = baby(life);
  assert.equal(c.age, 0);
  const home = city.getTile(c.home.x, c.home.y);
  assert.ok(home.structure && STRUCTURES[home.structure.type].capacity > 0, 'a home of any kind');
  assert.ok(c.family.mother.name.endsWith('Park'));
  assert.equal(city.systems.life.char, c);
});

test('time passes in the background and pauses while an event waits', () => {
  const { city } = town();
  const life = new LifeSystem(city, { rng: mulberry32(2) });
  const c = baby(life);
  c.age = 4;
  c.plan = [0.5];
  life.update(YEAR_SECONDS * 0.6);
  assert.ok(c.pending, 'an event fired halfway through the year');
  const progress = c.yearProgress;
  life.update(YEAR_SECONDS * 2);
  assert.equal(c.yearProgress, progress, 'no aging while the event waits');
  assert.equal(c.age, 4);
  const view = life.current();
  assert.ok(view.text.length > 0 && view.choices.length >= 2);
  const result = life.choose(0);
  assert.ok(result.text.length > 0);
  assert.equal(c.pending, null);
  life.update(YEAR_SECONDS);
  assert.equal(c.age, 5);
});

test('Age up skips to the next birthday and shows that year\'s first event', () => {
  const { city } = town();
  const life = new LifeSystem(city, { rng: mulberry32(3) });
  const c = baby(life);
  c.age = 9;
  assert.ok(life.ageUp());
  assert.equal(c.age, 10);
  assert.ok(c.pending);
  assert.equal(life.ageUp(), false, 'cannot age up past an open event');
});

test('job hunting offers real workplaces with openings', () => {
  const { city } = town();
  const life = new LifeSystem(city, { rng: () => 0.01 });
  const c = baby(life);
  c.age = 20;
  c.stats.smarts = 90;
  life.fireEvent('job_hunt');
  const offer = c.pending.choices.findIndex((ch) => ch.data);
  assert.ok(offer >= 0, 'at least one workplace is hiring');
  const { x, y } = c.pending.choices[offer].data;
  life.choose(offer);
  assert.deepEqual([c.job.x, c.job.y], [x, y]);
  assert.ok(['shop', 'office', 'school', 'clinic'].includes(c.job.type));
});

test('with no workplaces, job hunting says nobody is hiring', () => {
  const city = new CityState(8, 8);
  for (let x = 0; x < 8; x++) city.apply('road', x, 3);
  city.apply('house', 2, 2);
  city.getTile(2, 2).structure.residents = 2;
  new Simulation(city).refresh();
  const life = new LifeSystem(city, { rng: mulberry32(4) });
  const c = baby(life);
  c.age = 22;
  life.fireEvent('job_hunt');
  assert.equal(c.pending.choices.length, 1);
  assert.match(life.choose(0).text, /hiring/);
});

test('moving out picks one of the city\'s open homes', () => {
  const { city } = town();
  const life = new LifeSystem(city, { rng: mulberry32(6) });
  const c = baby(life);
  c.age = 19;
  life.fireEvent('move_out');
  const i = c.pending.choices.findIndex((ch) => ch.data);
  const target = c.pending.choices[i].data;
  life.choose(i);
  assert.deepEqual(c.home, target);
  assert.equal(c.livesWithParents, false);
});

test('a bulldozed home moves the family on the next birthday', () => {
  const { city } = town();
  const life = new LifeSystem(city, { rng: mulberry32(7) });
  const c = baby(life);
  const old = { ...c.home };
  city.apply('bulldoze', old.x, old.y);
  life.birthday();
  assert.ok(c.home);
  assert.notDeepEqual(c.home, old);
  assert.match(c.log[0].text + c.log[1]?.text, /demolished/);
});

test('whole lives play out to the end without errors', () => {
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    const { city } = town(seed);
    const rng = mulberry32(seed * 31);
    const life = new LifeSystem(city, { rng });
    const c = baby(life);
    let guard = 0;
    while (c.alive && guard++ < 400) {
      if (c.pending) {
        life.current();
        life.choose(Math.floor(rng() * c.pending.choices.length));
      } else life.ageUp();
    }
    assert.equal(c.alive, false, `seed ${seed} ended`);
    assert.ok(c.age > 20, `seed ${seed} lived to ${c.age}`);
    assert.ok(c.log.length > 10);
    for (const k of ['happiness', 'health', 'smarts', 'looks']) assert.ok(c.stats[k] >= 0 && c.stats[k] <= 100);
    if (c.children.length) {
      const kid = life.continueAsChild();
      assert.ok(kid.alive && kid.generation === 2);
      assert.equal(city.systems.life.history.length, 1);
    }
  }
});

test('a life is saved with the city and restored, waiting event included', () => {
  const { city } = town();
  const life = new LifeSystem(city, { rng: mulberry32(8) });
  const c = baby(life);
  c.age = 8;
  life.fireEvent('science_fair');
  const restored = CityState.fromJSON(JSON.parse(JSON.stringify(city.toJSON())));
  const life2 = new LifeSystem(restored);
  assert.equal(life2.char.first, 'Ava');
  assert.equal(life2.current().id, 'science_fair');
});

test('every event has text and choices', () => {
  const ids = new Set();
  for (const ev of LIFE_EVENTS) {
    assert.ok(!ids.has(ev.id), `duplicate id ${ev.id}`);
    ids.add(ev.id);
    assert.ok(ev.text);
    assert.ok(ev.choices);
    if (!ev.outcome) for (const ch of ev.choices) assert.ok(ch.outcomes.length && ch.label);
  }
});
