// Advisor: turns the city's state into a few short resident "thoughts". Each one is a wish (something
// residents would like) or a happy note, with a tile to point the camera at. Read-only: nothing is changed.

import { STRUCTURES } from './config.js';

const MAX_THOUGHTS = 5;

function isHome(t) {
  return !!t.structure && STRUCTURES[t.structure.type].capacity > 0;
}

// The occupied home that best stands for a problem: the most residents, ties broken by position.
function worstOf(tiles) {
  let best = null;
  for (const t of tiles) if (!best || t.structure.residents > best.structure.residents) best = t;
  return best;
}

function hasWaterNear(city, tile, r = 2) {
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) if (city.getTile(tile.x + dx, tile.y + dy)?.terrain === 'water') return true;
  }
  return false;
}

export function computeThoughts(city, milestones) {
  const out = [];
  const add = (id, kind, priority, text, hint, tile) =>
    out.push({ id, kind, priority, text, hint, x: tile ? tile.x : null, y: tile ? tile.y : null });
  const unlocked = (tool) => !milestones || milestones.isUnlocked(tool);

  const homes = city.tiles.filter(isHome);
  const lived = homes.filter((h) => h.structure.residents > 0);

  const cutOff = homes.filter((h) => !city.accessRoad(h.x, h.y));
  if (cutOff.length) {
    add('no-road', 'wish', 5, cutOff.length === 1 ? 'A home has no road. Nobody can get to work.' : `${cutOff.length} homes have no road. Nobody there can get to work.`, 'Connect them with a road', cutOff[0]);
  }

  const labor = city.derived.labor;
  const workers = labor ? labor.employed + labor.unemployed : 0;
  if (workers >= 6 && labor.unemployed / workers > 0.15) {
    const jobless = lived.filter((h) => h.employment < 0.5);
    add('jobs', 'wish', 4, `We need jobs! ${labor.unemployed} people are looking for work.`, 'Build shops or offices near homes', worstOf(jobless) || worstOf(lived));
  }

  if (unlocked('school')) {
    const far = lived.filter((h) => (h.coverage.school || 0) < 0.1);
    if (far.length) add('school', 'wish', 3, 'Our kids have no school nearby.', 'Build a school', worstOf(far));
  }

  let jam = null;
  for (const t of city.tiles) if (t.roadMask && t.congestion >= 0.85 && (!jam || t.congestion > jam.congestion)) jam = t;
  if (jam) add('traffic', 'wish', 3, 'The roads are jammed at rush hour.', 'Add another route or put jobs closer to homes', jam);

  if (unlocked('clinic')) {
    const far = lived.filter((h) => (h.coverage.health || 0) < 0.1);
    if (far.length) add('health', 'wish', 2.5, "There's no clinic if someone gets sick.", 'Build a clinic', worstOf(far));
  }

  const bare = lived.filter((h) => (h.factors.greenery || 0) < 0.02);
  if (bare.length) add('green', 'wish', 2, "It's all concrete here. A few trees would be lovely.", 'Plant trees or a park', worstOf(bare));

  const quiet = city.tiles.filter(
    (t) => t.structure && STRUCTURES[t.structure.type].jobs >= 4 && t.workersFilled < STRUCTURES[t.structure.type].jobs * 0.5,
  );
  if (quiet.length && homes.length) add('workers', 'wish', 2, 'Some workplaces are short of staff.', 'Build homes nearby, linked by road', quiet[0]);

  if (unlocked('playground')) {
    const far = lived.filter((h) => (h.coverage.fun || 0) < 0.1);
    if (far.length) add('fun', 'wish', 1.5, 'Nowhere to play around here!', 'Build a playground', worstOf(far));
  }

  // Always one happy note from the nicest occupied home.
  let best = null;
  for (const h of lived) if (!best || h.desirability > best.desirability) best = h;
  if (best) {
    const text = hasWaterNear(city, best)
      ? 'I love waking up to the water view.'
      : (best.factors.greenery || 0) > 0.15
        ? 'So much green on our street. Love it here!'
        : 'This is a lovely little neighbourhood.';
    add('happy', 'happy', 1, text, 'Your happiest home', best);
  }

  // Keep the happy note even on a bad day: the top wishes first, then the happy one.
  const happy = out.filter((t) => t.kind === 'happy');
  const wishes = out.filter((t) => t.kind !== 'happy').sort((a, b) => b.priority - a.priority);
  return [...wishes.slice(0, MAX_THOUGHTS - happy.length), ...happy];
}
