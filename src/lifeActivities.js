// Life Story activities: things the character can choose to do any time between events, a few
// times a year. Many use real places in the city: the nearest playground, park, sports field, shop,
// school or clinic. Pure data plus small functions; LifeSystem.doActivity runs them.
//
// An activity: { id, group, label(ctx), hint(ctx), minAge, maxAge, when(ctx), cost, run(ctx, rng) }.
// `run` returns an outcome { text, effects, do } like an event outcome, or { launch: 'event_id' } to
// open an event card with choices (used for buying a home or job hunting).

import { STRUCTURES } from './config.js';
import { CAREERS } from './lifeData.js';

const o = (text, effects = {}, extra = {}) => ({ text, effects, ...extra });
const where = (t) => `the ${STRUCTURES[t.structure.type].label.toLowerCase()} at ${t.x}, ${t.y}`;
const chance = (rng, p) => rng() < p;

export const ACTIVITY_GROUPS = [
  { id: 'body', label: 'Mind & body' },
  { id: 'people', label: 'People' },
  { id: 'out', label: 'Out in the city' },
  { id: 'money', label: 'Work & home' },
];

// How many activities fit in a year at each age.
export function energyFor(age) {
  if (age < 3) return 0;
  if (age < 13) return 2;
  return 3;
}

export const ACTIVITIES = [
  // ---- Mind & body -------------------------------------------------------------
  {
    id: 'study',
    group: 'body',
    minAge: 5,
    label: (ctx) => (ctx.char.age >= 22 ? 'Take an evening class' : 'Study hard'),
    hint: (ctx) => (ctx.facts.schoolCoverage > 0.25 ? 'School nearby: +Smarts' : 'No school nearby: smaller gain'),
    cost: (ctx) => (ctx.char.age >= 22 ? 300 : 0),
    run: (ctx, rng) => {
      const near = ctx.facts.schoolCoverage > 0.25;
      const curious = ctx.has('curious') ? 1 : 0;
      if (chance(rng, 0.15)) return o('{name} fell asleep on the books. Still, some of it went in.', { smarts: 1, health: 1 });
      return near
        ? o('{name} studied at the school library until closing time.', { smarts: 4 + curious, happiness: -1 })
        : o('With no school nearby, {name} studied alone at the kitchen table.', { smarts: 2 + curious, happiness: -1 });
    },
  },
  {
    id: 'exercise',
    group: 'body',
    minAge: 6,
    label: (ctx) => {
      const field = ctx.nearest('field', 10);
      if (field) return 'Play sport at the field';
      return ctx.facts.greenery > 0.1 ? 'Go for a run in the park' : 'Go for a jog';
    },
    hint: (ctx) => (ctx.nearest('field', 10) ? `Sports field at ${ctx.nearest('field', 10).x}, ${ctx.nearest('field', 10).y}: +Health` : '+Health'),
    run: (ctx, rng) => {
      const field = ctx.nearest('field', 10);
      const sporty = ctx.has('sporty') ? 2 : 0;
      if (field) {
        return chance(rng, 0.12)
          ? o(`{name} twisted an ankle at ${where(field)}.`, { health: -3, happiness: -1 })
          : o(`{name} played a game at ${where(field)} and scored twice.`, { health: 6 + sporty, happiness: 4, looks: 1 });
      }
      if (ctx.facts.greenery > 0.1) return o('{name} ran laps under the trees and felt great.', { health: 5 + sporty, happiness: 3 });
      return o('{name} jogged along busy roads. Fresh air would be nicer. (A park or sports field nearby would help.)', { health: 3 + sporty, happiness: -1 });
    },
  },
  {
    id: 'doctor',
    group: 'body',
    minAge: 10,
    label: () => 'See a doctor',
    hint: (ctx) => (ctx.facts.clinicCoverage > 0.25 ? 'Clinic nearby: +Health' : 'No clinic nearby: long trip'),
    cost: () => 100,
    run: (ctx) =>
      ctx.facts.clinicCoverage > 0.25
        ? o('The clinic down the road gave {name} a full check-up and some good advice.', { health: 7 })
        : o('The nearest clinic was a long trip away, but {name} got seen in the end.', { health: 3, happiness: -2 }),
  },
  {
    id: 'rest',
    group: 'body',
    minAge: 3,
    label: (ctx) => (ctx.char.age < 13 ? 'Build a blanket fort' : 'Have a lazy day'),
    hint: () => '+Happiness',
    run: (ctx) => (ctx.char.age < 13 ? o('{name} built the greatest blanket fort of all time.', { happiness: 5 }) : o('{name} slept in, read a book and ordered pizza.', { happiness: 5, health: 1 })),
  },
  {
    id: 'makeover',
    group: 'body',
    minAge: 14,
    label: () => 'Get a new look',
    hint: () => '+Looks',
    cost: () => 250,
    run: (ctx, rng) =>
      chance(rng, 0.2)
        ? o('The new haircut was… brave. It will grow back.', { looks: -2, happiness: -2 })
        : o('{name} got a fresh haircut and new clothes, and feels fantastic.', { looks: 5, happiness: 3 }),
  },

  // ---- People ---------------------------------------------------------------------
  {
    id: 'family',
    group: 'people',
    minAge: 3,
    when: (ctx) => ctx.person('mother') || ctx.person('father'),
    label: (ctx) => (ctx.char.livesWithParents ? 'Family games night' : 'Visit {mother} and {father}'),
    hint: () => '+Closeness with parents',
    run: (ctx) => o(ctx.char.livesWithParents ? '{name} won at cards and {father} demanded a rematch.' : '{name} came home for Sunday lunch. {mother} sent leftovers.', { happiness: 3, rel: { mother: 7, father: 7 } }),
  },
  {
    id: 'sibling',
    group: 'people',
    minAge: 3,
    when: (ctx) => ctx.person('sibling'),
    label: () => 'Hang out with {sibling}',
    hint: () => '+Closeness',
    run: (ctx, rng) =>
      chance(rng, 0.2)
        ? o('{name} and {sibling} argued over the TV remote.', { happiness: -1, rel: { sibling: -3 } })
        : o('{name} and {sibling} laughed until their sides hurt.', { happiness: 4, rel: { sibling: 8 } }),
  },
  {
    id: 'friend',
    group: 'people',
    minAge: 4,
    when: (ctx) => ctx.person('friend'),
    label: () => 'Hang out with {friend}',
    hint: () => '+Closeness, +Happiness',
    run: (ctx) => {
      const park = ctx.nearest(['park', 'playground'], 8);
      return park
        ? o(`{name} and {friend} spent the afternoon at ${where(park)}.`, { happiness: 5, rel: { friend: 8 } })
        : o('{name} and {friend} hung out at home playing games.', { happiness: 4, rel: { friend: 7 } });
    },
  },
  {
    id: 'meet',
    group: 'people',
    minAge: 4,
    label: () => 'Make a new friend',
    hint: (ctx) => (ctx.has('outgoing') ? 'Outgoing: good odds' : 'Might be awkward'),
    run: (ctx, rng) => {
      const n = ctx.neighbour();
      const odds = 0.55 + (ctx.has('outgoing') ? 0.25 : 0) + (ctx.char.stats.looks - 50) / 250;
      if (!chance(rng, odds)) return o('{name} said hello to a few people, but nothing clicked.', { happiness: -1 });
      if (n) return o(`{name} got chatting with ${n.person} from ${n.family} at ${n.x}, ${n.y}. A new friend!`, { happiness: 4 }, { do: (c) => c.addFriend(55, n.person) });
      return o('{name} met someone nice and swapped numbers.', { happiness: 4 }, { do: (c) => c.addFriend(50) });
    },
  },
  {
    id: 'date',
    group: 'people',
    minAge: 16,
    maxAge: 75,
    label: (ctx) => (ctx.char.partner ? 'Date night with {partner}' : 'Go on a date'),
    hint: (ctx) => (ctx.char.partner ? '+Closeness' : 'Looks and Outgoing help'),
    cost: () => 60,
    run: (ctx, rng) => {
      if (ctx.char.partner) {
        const park = ctx.nearest('park', 10);
        return park
          ? o(`{name} and {partner} had a picnic at ${where(park)} at sunset.`, { happiness: 5, rel: { partner: 9 } })
          : o('{name} and {partner} cooked dinner together and burned the rice.', { happiness: 4, rel: { partner: 7 } });
      }
      const odds = 0.3 + ctx.char.stats.looks / 250 + (ctx.has('outgoing') ? 0.15 : 0);
      if (chance(rng, odds)) return o('{name} met someone wonderful over coffee. It\'s official!', { happiness: 9 }, { do: (c) => c.setPartner(55) });
      return o('The date talked about their ex all night. Next!', { happiness: -3 });
    },
  },
  {
    id: 'kids',
    group: 'people',
    minAge: 18,
    when: (ctx) => ctx.char.children.some((k) => k.alive !== false && k.age < 18),
    label: () => 'Play with {child}',
    hint: (ctx) => (ctx.nearest('playground', 8) ? 'Playground nearby' : '+Happiness'),
    run: (ctx) => {
      const pg = ctx.nearest('playground', 8);
      return pg
        ? o(`{name} pushed {child} on the swings at ${where(pg)}.`, { happiness: 6 })
        : o('{name} and {child} built a cardboard rocket. (A playground nearby would be fun.)', { happiness: 4 });
    },
  },

  // ---- Out in the city ------------------------------------------------------------
  {
    id: 'playground',
    group: 'out',
    minAge: 3,
    maxAge: 12,
    label: () => 'Go to the playground',
    hint: (ctx) => {
      const pg = ctx.nearest('playground', 8);
      return pg ? `At ${pg.x}, ${pg.y}` : 'None nearby: build a playground';
    },
    when: (ctx) => ctx.nearest('playground', 8),
    run: (ctx, rng) => {
      const pg = ctx.nearest('playground', 8);
      if (chance(rng, 0.15)) return o(`{name} fell off the slide at ${where(pg)}. A plaster and a lolly fixed it.`, { health: -1, happiness: 2 });
      return chance(rng, 0.35)
        ? o(`{name} made a friend on the climbing frame at ${where(pg)}.`, { happiness: 6, health: 2 }, { do: (c) => c.addFriend(50) })
        : o(`{name} went down the slide at ${where(pg)} about a hundred times.`, { happiness: 7, health: 2 });
    },
  },
  {
    id: 'park',
    group: 'out',
    minAge: 3,
    label: () => 'Walk in the park',
    hint: (ctx) => {
      const p = ctx.nearest('park', 10);
      return p ? `At ${p.x}, ${p.y}` : 'None nearby: build a park';
    },
    when: (ctx) => ctx.nearest('park', 10),
    run: (ctx) => {
      const p = ctx.nearest('park', 10);
      const season = ctx.city.derived.weather?.season;
      const extra = season === 'spring' ? ' The blossom was out.' : season === 'autumn' ? ' The leaves were turning orange.' : season === 'winter' ? ' Everything was frosty.' : '';
      return o(`{name} took a long walk round the fountain at ${where(p)}.${extra}`, { happiness: 5, health: 2 });
    },
  },
  {
    id: 'shopping',
    group: 'out',
    minAge: 10,
    label: () => 'Go shopping',
    hint: (ctx) => {
      const s = ctx.nearest('shop', 40);
      return s ? `Shop at ${s.x}, ${s.y}` : 'No shops in town yet';
    },
    when: (ctx) => ctx.nearest('shop', 40),
    cost: () => 150,
    run: (ctx, rng) => {
      const s = ctx.nearest('shop', 40);
      return chance(rng, 0.25)
        ? o(`{name} found a bargain at ${where(s)} and spent less than planned.`, { happiness: 4, looks: 2, money: 80 })
        : o(`{name} came home from ${where(s)} with bags of new things.`, { happiness: 4, looks: 2 });
    },
  },
  {
    id: 'volunteer',
    group: 'out',
    minAge: 12,
    label: () => 'Volunteer',
    hint: () => '+Happiness, maybe a friend',
    when: (ctx) => ctx.nearest(['clinic', 'school', 'park'], 40),
    run: (ctx, rng) => {
      const t = ctx.nearest(['clinic', 'school', 'park'], 40);
      const what = t.structure.type === 'clinic' ? 'helped out at the reception desk' : t.structure.type === 'school' ? 'read stories to the little ones' : 'picked litter and planted bulbs';
      return o(`{name} ${what} at ${where(t)}.`, { happiness: 5, smarts: 1 }, chance(rng, 0.4) ? { do: (c) => c.addFriend(50) } : {});
    },
  },

  // ---- Work & home ------------------------------------------------------------------
  {
    id: 'babysit',
    group: 'money',
    minAge: 13,
    maxAge: 17,
    label: () => 'Babysit for neighbours',
    hint: () => '+$150',
    when: (ctx) => ctx.neighbour(),
    run: (ctx, rng) => {
      const n = ctx.neighbour();
      return chance(rng, 0.2)
        ? o(`The ${n.family.replace(/^the /, '')} kids at ${n.x}, ${n.y} painted the cat. {name} still got paid.`, { money: 150, happiness: -2 })
        : o(`{name} babysat for ${n.family} at ${n.x}, ${n.y}. Easy money.`, { money: 150, happiness: 1 });
    },
  },
  {
    id: 'job_hunt',
    group: 'money',
    minAge: 18,
    maxAge: 62,
    label: () => 'Look for a job',
    hint: (ctx) => `${ctx.openJobs().length} workplaces hiring`,
    when: (ctx) => !ctx.char.job && !ctx.char.flags.retired,
    run: () => ({ launch: 'job_hunt' }),
  },
  {
    id: 'overtime',
    group: 'money',
    minAge: 16,
    when: (ctx) => ctx.char.job,
    label: () => 'Work overtime',
    hint: (ctx) => (ctx.char.job.level < CAREERS[ctx.char.job.type].titles.length - 1 ? 'Money, and a shot at promotion' : 'Extra money'),
    run: (ctx, rng) => {
      const c = ctx.char;
      const career = CAREERS[c.job.type];
      const pay = Math.round(career.pay[c.job.level] * 0.04);
      const top = c.job.level >= career.titles.length - 1;
      if (!top && c.job.years >= 1 && chance(rng, 0.12 + c.stats.smarts / 600)) {
        return o(`The boss noticed! {name} was promoted to ${career.titles[c.job.level + 1].toLowerCase()}.`, { money: pay, happiness: 6, health: -2 }, { do: (x) => ((x.char.job.level += 1), (x.char.job.years = 0)) });
      }
      return o('{name} stayed late at the {workplace} all month.', { money: pay, health: -3, happiness: -1 });
    },
  },
  {
    id: 'buy_home',
    group: 'money',
    minAge: 18,
    when: (ctx) => !ctx.char.flags.ownsHome || ctx.homesForSale().length,
    label: (ctx) => (ctx.char.flags.ownsHome ? 'Move to a new home' : 'Buy a home'),
    hint: (ctx) => {
      const cheapest = ctx.homesForSale()[0];
      return cheapest ? `From $${Math.min(...ctx.homesForSale().map((h) => h.price)).toLocaleString()}` : 'Nothing for sale';
    },
    run: () => ({ launch: 'buy_home' }),
  },
];
