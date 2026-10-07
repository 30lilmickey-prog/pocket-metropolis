// Run with: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';

// A tiny in-memory localStorage for the save slots.
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const { CityState } = await import('../src/state.js');
const { generateSeed } = await import('../src/generator.js');
const { saveCity, loadCity, slotInfo, activeSlot, setActiveSlot, deleteSlot, SLOT_COUNT } = await import('../src/persistence.js');

test('three save slots hold separate towns, and slot 1 keeps the old save key', () => {
  assert.equal(SLOT_COUNT, 3);
  assert.equal(activeSlot(), 1);
  const a = new CityState(16, 16);
  generateSeed(a, 1);
  a.systems.life = { char: { first: 'Ada', last: 'Park', generation: 2, alive: true }, history: [] };
  assert.ok(saveCity(a));
  assert.ok(store.has('pocket-metropolis:save'), 'slot 1 is the original save');

  const b = new CityState(32, 32);
  generateSeed(b, 2);
  setActiveSlot(2);
  assert.ok(saveCity(b));
  assert.equal(activeSlot(), 2);

  assert.equal(loadCity(1).width, 16);
  assert.equal(loadCity(2).width, 32);
  assert.equal(loadCity(3), null);
  const info = slotInfo(1);
  assert.equal(info.person, 'Ada Park');
  assert.equal(info.generation, 2);
  assert.equal(info.year, 1850);
  assert.equal(slotInfo(3), null);

  deleteSlot(2);
  assert.equal(slotInfo(2), null);
  assert.equal(loadCity(1).width, 16, 'other slots untouched');
});
