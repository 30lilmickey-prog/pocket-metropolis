// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { CityState } from '../src/state.js';
import { Simulation } from '../src/simulation.js';
import { generateLand, generateTown } from '../src/generator.js';
import { Townsfolk, chemistry, moodOf, MAX_TOWNSFOLK } from '../src/townsfolk.js';
import { computeThoughts } from '../src/advisor.js';
import { mulberry32 } from '../src/utils.js';

// A street of full houses with a café and an office, so people can eat out and work.
function street({ cafe = true } = {}) {
  const city = new CityState(24, 24);
  generateLand(city, 3);
  const sim = new Simulation(city);
  for (let x = 2; x < 20; x++) city.apply('road', x, 8);
  for (let x = 2; x < 10; x++) city.apply('house', x, 7);
  if (cafe) city.apply('cafe', 12, 7);
  city.apply('office', 14, 7);
  city.apply('park', 16, 9);
  sim.refresh();
  for (const h of city.homes()) h.structure.residents = 4;
  sim.refresh();
  const tf = new Townsfolk(city, { rng: mulberry32(5) });
  sim.townsfolk = tf;
  return { city, sim, tf };
}

const person = (tf, over = {}) => {
  tf.sync();
  const p = tf.people[0];
  Object.assign(p, over);
  return p;
};

test('the cast follows the population, one named person per few residents', () => {
  const { city, tf } = street();
  tf.sync();
  assert.equal(tf.people.length, Math.ceil(city.stats.population / 8));
  for (const p of tf.people) {
    const home = city.getTile(p.home.x, p.home.y);
    assert.ok(home.structure && home.structure.residents > 0, 'everyone lives in a lived-in home');
    for (const k of ['o', 'c', 'e', 'a', 'n']) assert.ok(p.traits[k] >= 0 && p.traits[k] <= 1);
  }
  assert.ok(MAX_TOWNSFOLK >= 20);
});

test('the utility AI sleeps at night, works on weekdays and eats out when hungry', () => {
  const { tf } = street();
  const p = person(tf, { quirk: 'homebody', age: 30, job: { x: 14, y: 7 } });
  const ctx = (hour, weekend = false) => ({ hour, weekend, wet: 0, venues: tf.venues(), unmet: { eat: [], play: [], social: [] } });
  p.needs = { energy: 0.4, hunger: 0.9, social: 0.9, fun: 0.9 };
  assert.equal(tf.choose(p, ctx(2)).act, 'sleep');
  p.needs = { energy: 0.9, hunger: 0.9, social: 0.9, fun: 0.9 };
  assert.equal(tf.choose(p, ctx(10)).act, 'work');
  assert.notEqual(tf.choose(p, ctx(10, true)).act, 'work', 'weekends off');
  p.needs = { energy: 0.9, hunger: 0.05, social: 0.9, fun: 0.9 };
  const lunch = tf.choose(p, ctx(12, true));
  assert.ok(['eat', 'cook'].includes(lunch.act), lunch.act);
  p.quirk = 'foodie';
  assert.equal(tf.choose(p, ctx(12, true)).act, 'eat');
});

test('a day of town life restores needs and keeps moods sensible', () => {
  const { tf } = street();
  tf.sync();
  for (let h = 0; h < 72; h++) tf.hourTick(h);
  for (const p of tf.people) {
    assert.ok(p.mood > 0.3, `mood ${p.mood}`);
    for (const v of Object.values(p.needs)) assert.ok(v >= 0 && v <= 1);
  }
  const s = tf.summary();
  assert.equal(s.count, tf.people.length);
});

test('people who meet at the same place become friends and make the news', () => {
  const { tf } = street();
  tf.sync();
  const [a, b] = tf.people;
  a.traits = b.traits = { o: 0.5, c: 0.5, e: 0.7, a: 0.9, n: 0.2 };
  assert.ok(chemistry(a, b) > 0.8);
  a.doing = b.doing = 'social';
  a.at = b.at = { x: 12, y: 7 };
  for (let i = 0; i < 12; i++) tf.meet(a, b, i);
  assert.ok(a.rel[b.id].a >= 0.5 && b.rel[a.id].a >= 0.5);
  const news = tf.state.news.find((n) => n.kind === 'friends');
  assert.ok(news, 'friendship made the news');
  assert.match(news.text, /café/);
  assert.deepEqual(tf.friendsOf(a)[0].person, b);
});

test('needs nobody can meet nearby show up as resident wishes on the map', () => {
  const { city, sim, tf } = street({ cafe: false });
  // No café, shop or mall: hungry people have nowhere to eat out.
  for (const t of city.tiles) if (t.structure?.type === 'park') city.apply('bulldoze', t.x, t.y);
  tf.sync();
  for (const p of tf.people) p.needs = { energy: 0.9, hunger: 0.1, social: 0.1, fun: 0.1 };
  tf.hourTick(12);
  assert.ok(city.derived.townsfolkUnmet.eat.length >= 2);
  const thoughts = computeThoughts(city, sim.milestones);
  assert.ok(thoughts.some((t) => t.id === 'folk-eat'), thoughts.map((t) => t.id).join());
});

test('notable people join the townsfolk, and a bulldozed home sends people elsewhere', () => {
  const { city, sim, tf } = street();
  sim.notables.arrive('artist');
  tf.sync();
  const star = tf.people.find((p) => p.notable === 'artist');
  assert.ok(star, 'the artist is one of the townsfolk');
  const home = { ...star.home };
  city.apply('bulldoze', home.x, home.y);
  sim.notables.syncHomes();
  tf.sync();
  const after = tf.people.find((p) => p.notable === 'artist');
  assert.ok(after && !(after.home.x === home.x && after.home.y === home.y), 'they moved, not vanished');
  for (const p of tf.people) assert.ok(city.getTile(p.home.x, p.home.y).structure);
});

test('townsfolk save with the city and the whole system runs inside the simulation', () => {
  const city = new CityState(32, 32);
  generateTown(city, 4);
  const sim = new Simulation(city);
  sim.refresh();
  for (let i = 0; i < 400; i++) sim.update(0.25);
  const st = city.systems.townsfolk;
  assert.ok(st.people.length > 0);
  const copy = JSON.parse(JSON.stringify(city));
  assert.equal(copy.systems.townsfolk.people.length, st.people.length);
  assert.ok(JSON.stringify(st).length < 120000, 'save stays small');
  assert.ok(moodOf(st.people[0]) >= 0);
});
