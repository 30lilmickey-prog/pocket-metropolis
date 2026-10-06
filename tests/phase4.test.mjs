// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { CityState } from '../src/state.js';
import { Simulation, TREND_SAMPLES_PER_DAY } from '../src/simulation.js';
import { generateTown } from '../src/generator.js';
import { packCity, unpackCity, encodeCity, decodeCity, codeFromHash, shareUrl } from '../src/share.js';
import { settings, setSetting, rampStops } from '../src/settings.js';
import { SEVERITY_COLORS, DAY_LENGTH_SECONDS } from '../src/config.js';
import { trendsHTML } from '../src/trendsUI.js';

const sameMap = (a, b) =>
  a.tiles.every((t, i) => {
    const u = b.tiles[i];
    const s = t.structure;
    const r = u.structure;
    return t.terrain === u.terrain && s?.type === r?.type && s?.variant === r?.variant && (s?.floors || 0) === (r?.floors || 0) && (s?.shape || 0) === (r?.shape || 0);
  });

test('a town survives the trip through a share link', async () => {
  const city = new CityState(32, 32);
  generateTown(city, 7);
  city.day = 12;
  const code = await encodeCity(city);
  assert.match(code, /^[A-Za-z0-9_-]+$/, 'URL-safe');
  assert.ok(code.length < 1500, `short enough for a link (${code.length})`);
  const copy = await decodeCity(code);
  assert.equal(copy.width, 32);
  assert.equal(copy.day, 12);
  assert.ok(sameMap(city, copy));
  assert.ok(copy.homes().every((h) => h.structure.residents === 0), 'residents move in again on the other side');
  assert.ok(copy.tiles.some((t) => t.roadMask), 'roads reconnect');
  assert.equal(codeFromHash(`#town=${code}`), code);
  assert.equal(codeFromHash('#something'), null);
  assert.equal(shareUrl('abc', { origin: 'https://x.app', pathname: '/' }), 'https://x.app/#town=abc');
});

test('broken links are rejected', async () => {
  const bytes = packCity(new CityState(8, 8));
  bytes[0] = 99;
  assert.throws(() => unpackCity(bytes), /format/);
  await assert.rejects(decodeCity('not-a-real-town'));
});

test('copyFrom swaps in another town while keeping the same city object', async () => {
  const mine = new CityState(32, 32);
  generateTown(mine, 1);
  mine.systems.life = { char: { first: 'Ava' } };
  const theirs = await decodeCity(await encodeCity((() => {
    const c = new CityState(32, 32);
    generateTown(c, 2);
    return c;
  })()));
  const rev = mine.revision;
  const keep = mine;
  mine.copyFrom(theirs);
  assert.equal(mine, keep);
  assert.ok(sameMap(mine, theirs));
  assert.equal(mine.systems.life, undefined, 'a shared town has no Life Story of yours');
  assert.ok(mine.revision > rev, 'caches redraw');
});

test('trends sample a few times a day and keep the last six days', () => {
  const city = new CityState(32, 32);
  generateTown(city, 3);
  const sim = new Simulation(city);
  sim.refresh();
  const steps = Math.round((DAY_LENGTH_SECONDS * 8) / 0.25); // eight days
  for (let i = 0; i < steps; i++) sim.update(0.25);
  const tr = city.systems.trends;
  assert.equal(tr.t.length, 48, 'six days of samples');
  for (const k of ['pop', 'happy', 'employ', 'traffic']) assert.equal(tr[k].length, 48);
  assert.ok(tr.t[1] - tr.t[0] > 0.9 / TREND_SAMPLES_PER_DAY);
  assert.ok(tr.pop[tr.pop.length - 1] > 0);
  const html = trendsHTML(tr);
  assert.match(html, /Population/);
  assert.match(html, /<path class="spark-line" d="M/);
  assert.match(html, /<table>/, 'a table view for every chart');
  assert.match(trendsHTML({ t: [1] }), /appear after/);
  city.reset();
  assert.equal(city.systems.trends, undefined, 'a new town starts fresh trends');
});

test('colour-blind friendly colours swap the severities and ramps', () => {
  const before = { ...SEVERITY_COLORS };
  setSetting('colorBlind', true);
  assert.equal(settings.colorBlind, true);
  assert.equal(SEVERITY_COLORS.good, '#0072b2');
  assert.notDeepEqual(rampStops()[0][1], [246, 140, 140]);
  setSetting('colorBlind', false);
  assert.deepEqual({ ...SEVERITY_COLORS }, before);
});
