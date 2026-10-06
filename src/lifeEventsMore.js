// More Life Story events, many tied to the real city: neighbours who live in nearby homes, the
// nearest playground or sports field, the weather and season, and the town's milestones.
// Same format as lifeEvents.js. `text` may also be a function of ctx when it names a real place.
// Events marked `manual` never pop up on their own; activities open them (buying a home).

import { STRUCTURES, MILESTONES } from './config.js';
import { CAREERS } from './lifeData.js';

const o = (text, effects = {}, extra = {}) => ({ text, effects, ...extra });
const where = (t) => `the ${STRUCTURES[t.structure.type].label.toLowerCase()} at ${t.x}, ${t.y}`;
const season = (ctx) => ctx.city.derived.weather?.season;
const weather = (ctx) => ctx.city.derived.weather || {};

export const MORE_EVENTS = [
  // ---- Buying a home (opened from Activities) -------------------------------------
  {
    id: 'buy_home',
    manual: true,
    title: 'House hunting',
    text: (ctx) =>
      ctx.homesForSale().length
        ? '{name} has {money} saved. These homes in the city are for sale:'
        : 'No homes in the city have room right now. (Building more houses or towers would help.)',
    choices: (ctx) => {
      const sale = ctx.homesForSale();
      // The nicest homes within budget, so there's a real choice between price and appeal.
      const affordable = sale
        .filter((h) => h.price <= ctx.char.money)
        .sort((a, b) => b.tile.desirability - a.tile.desirability)
        .slice(0, 3)
        .sort((a, b) => a.price - b.price);
      const out = affordable.map((h) => ({
        label: `${STRUCTURES[h.tile.structure.type].label} at ${h.tile.x}, ${h.tile.y} · ${Math.round(h.tile.desirability * 100)}% desirable · $${h.price.toLocaleString()}`,
        data: { x: h.tile.x, y: h.tile.y, price: h.price },
      }));
      if (!affordable.length && sale.length) {
        const cheapest = sale.reduce((a, b) => (a.price < b.price ? a : b));
        out.push({ label: `Keep saving (the cheapest is $${cheapest.price.toLocaleString()})`, data: null });
      } else out.push({ label: 'Keep looking', data: null });
      return out;
    },
    outcome: (ctx, data) => {
      if (!data) return o('{name} will keep saving for the right place.', {});
      const t = ctx.city.getTile(data.x, data.y);
      if (!t?.structure || !STRUCTURES[t.structure.type].capacity) return o('Someone else bought it first.', { happiness: -3 });
      if (ctx.char.money < data.price) return o('The bank said no. A bit more saving needed.', { happiness: -2 });
      return o(`{name} got the keys to ${where(t)}. Home sweet home!`, { money: -data.price, happiness: 10 + Math.round(t.desirability * 6) }, {
        do: (c) => {
          c.moveTo(t);
          c.char.flags.ownsHome = true;
        },
      });
    },
  },

  // ---- Baby and child -----------------------------------------------------------
  {
    id: 'new_sibling',
    stages: ['baby', 'child'],
    minAge: 2,
    maxAge: 9,
    once: true,
    weight: 1.5,
    when: (ctx) => ctx.char.family.mother?.alive && ctx.char.family.father?.alive && !(ctx.char.siblings || []).length,
    text: '{mother} and {father} have news: a baby is on the way!',
    choices: [
      { label: 'Hope for a sister', outcomes: [o('Welcome home, baby {sibling}! {name} is a big sibling now.', { happiness: 6 }, { do: (c) => c.addSibling('she') })] },
      { label: 'Hope for a brother', outcomes: [o('Welcome home, baby {sibling}! {name} is a big sibling now.', { happiness: 6 }, { do: (c) => c.addSibling('he') })] },
      { label: 'Ask if it can be a puppy instead', outcomes: [o('It was not a puppy. It was baby {sibling}, who cries a lot.', { happiness: 2 }, { do: (c) => c.addSibling() })] },
    ],
  },
  {
    id: 'sibling_fight',
    stages: ['child', 'teen'],
    cooldown: 3,
    when: (ctx) => ctx.person('sibling'),
    text: '{sibling} has drawn on {name}\'s favourite book.',
    choices: [
      { label: 'Tell {mother}', outcomes: [o('{sibling} lost screen time for a week.', { happiness: 2, rel: { sibling: -6 } })] },
      { label: 'Draw on {sibling}\'s book back', outcomes: [o('A war of crayons broke out. Both were grounded.', { happiness: -2, rel: { sibling: 3 } })] },
      { label: 'Let it go', outcomes: [o('{name} let it go. {sibling} said sorry with a biscuit.', { happiness: 2, rel: { sibling: 8 } })] },
    ],
  },
  {
    id: 'swings',
    stages: ['child'],
    cooldown: 3,
    weight: 1.5,
    when: (ctx) => ctx.nearest('playground', 8),
    text: (ctx) => `At ${where(ctx.nearest('playground', 8))}, a big kid won't let anyone else on the swings.`,
    choices: [
      { label: 'Ask nicely', outcomes: [o('The big kid shrugged and gave {name} a turn.', { happiness: 4 }), o('"No." {name} went on the slide instead.', { happiness: -1 })] },
      { label: 'Start a queue', outcomes: [o('{name} organised a queue. Everyone got a go, and {name} made a friend.', { happiness: 5, smarts: 1 }, { do: (c) => c.addFriend(55) })] },
      { label: 'Go home', outcomes: [o('{name} sulked all the way home.', { happiness: -3 })] },
    ],
  },
  {
    id: 'no_playground',
    stages: ['child'],
    once: true,
    when: (ctx) => !ctx.nearest('playground', 8) && ctx.city.systems.milestones?.reached >= 1,
    title: 'Nowhere to play',
    text: 'There\'s no playground near {name}\'s home, so the kids play football against the garage door. (A playground nearby would make this a happier childhood.)',
    choices: [
      { label: 'Play anyway', outcomes: [o('Bang, bang, bang. The neighbours were not impressed.', { happiness: 2, health: 2 })] },
      { label: 'Write to the mayor', outcomes: [o('{name}\'s letter, in green crayon, was pinned to the town hall wall.', { happiness: 2, smarts: 1 })] },
    ],
  },
  {
    id: 'lost_cat',
    stages: ['child', 'teen'],
    cooldown: 6,
    when: (ctx) => ctx.neighbour(),
    text: (ctx) => {
      const n = ctx.neighbour();
      return `${n.family[0].toUpperCase() + n.family.slice(1)} at ${n.x}, ${n.y} has lost their cat, Mittens. There are posters everywhere.`;
    },
    choices: [
      {
        label: 'Search the street',
        outcomes: [
          o('{name} found Mittens asleep in a flowerpot! The family gave a $20 reward.', { happiness: 6, money: 20 }, { weight: 2, do: (c) => c.addFriend(50, c.neighbour()?.person) }),
          o('No sign of Mittens. (She came home on her own two days later.)', { happiness: 1 }),
        ],
      },
      { label: 'Make more posters', outcomes: [o('{name}\'s poster had glitter on it. Mittens was found by dinner.', { happiness: 4 })] },
    ],
  },
  {
    id: 'snow_day',
    stages: ['child', 'teen'],
    cooldown: 2,
    weight: 3,
    when: (ctx) => weather(ctx).snowCover > 0.3 || weather(ctx).snow > 0.3,
    title: 'Snow day!',
    text: 'It snowed overnight and school is closed.',
    choices: [
      { label: 'Build a snowman', outcomes: [o('{name}\'s snowman had a carrot nose and {father}\'s hat.', { happiness: 7 })] },
      { label: 'Snowball fight', outcomes: [o('{name} won the great snowball war of the street.', { happiness: 6, health: 2 }, { do: (c) => c.addFriend(50) }), o('Snow down the back of the neck. Brrr.', { happiness: 2 })] },
      { label: 'Stay in with hot chocolate', outcomes: [o('{name} watched the snow fall from the window.', { happiness: 4 })] },
    ],
  },
  {
    id: 'puddles',
    stages: ['child'],
    cooldown: 3,
    weight: 2,
    when: (ctx) => weather(ctx).rain > 0.3,
    text: 'It\'s pouring with rain, and there are puddles everywhere.',
    choices: [
      { label: 'Jump in every single one', outcomes: [o('{name} came home soaked and grinning.', { happiness: 6, health: -1 })] },
      { label: 'Stay dry inside', outcomes: [o('{name} read comics and listened to the rain.', { happiness: 2, smarts: 1 })] },
    ],
  },
  {
    id: 'lemonade',
    stages: ['child'],
    minAge: 6,
    once: true,
    text: 'It\'s a hot day. {name} wants to run a lemonade stand.',
    choices: [
      {
        label: 'Set up on the busiest street',
        outcomes: [o('{name} sold out by lunchtime: $35!', { money: 35, happiness: 6, smarts: 1 }, { weight: 2 }), o('A wasp moved in. Business closed early.', { money: 5, happiness: -1 })],
      },
      { label: 'Give it away free', outcomes: [o('Free lemonade made {name} the most popular kid on the street.', { happiness: 6 }, { do: (c) => c.addFriend(55) })] },
    ],
  },
  {
    id: 'sleepover',
    stages: ['child', 'teen'],
    cooldown: 3,
    when: (ctx) => ctx.person('friend'),
    text: '{friend} invited {name} to a sleepover.',
    choices: [
      { label: 'Stay up all night', outcomes: [o('{name} and {friend} told ghost stories till 4 a.m.', { happiness: 6, health: -2, rel: { friend: 8 } })] },
      { label: 'Go home before bedtime', outcomes: [o('{name} had fun, then slept in {their} own bed.', { happiness: 3, rel: { friend: 3 } })] },
    ],
  },
  {
    id: 'spelling_bee',
    stages: ['child'],
    minAge: 8,
    once: true,
    when: (ctx) => ctx.facts.schoolCoverage > 0.25,
    text: '{name} made the final of the school spelling bee. The last word is "rhythm".',
    choices: [
      { label: 'R-H-Y-T-H-M', outcomes: [o('Correct! {name} won the golden pencil.', { smarts: 4, happiness: 7 }, { weight: (c) => 1 + c.char.stats.smarts / 40 }), o('So close. Second place!', { smarts: 2, happiness: 2 })] },
      { label: 'R-I-T-H-U-M', outcomes: [o('Not quite. {name} got a cheer anyway.', { smarts: 1, happiness: -1 })] },
    ],
  },

  // ---- Teen ---------------------------------------------------------------------
  {
    id: 'team_trials',
    stages: ['teen'],
    once: true,
    when: (ctx) => ctx.nearest('field', 10),
    text: (ctx) => `The town team is holding trials at ${where(ctx.nearest('field', 10))}.`,
    choices: [
      {
        label: 'Try out',
        outcomes: [
          o('{name} made the team!', { happiness: 8, health: 5, set: ['team'] }, { weight: (c) => (c.has('sporty') ? 3 : 1) + c.char.stats.health / 100, do: (c) => c.addFriend(55) }),
          o('Not this year. {name} is training for next time.', { happiness: -3, health: 3 }),
        ],
      },
      { label: 'Cheer from the stands', outcomes: [o('{name} cheered so loudly {they} lost {their} voice.', { happiness: 3 })] },
    ],
  },
  {
    id: 'big_match',
    stages: ['teen', 'young'],
    cooldown: 2,
    when: (ctx) => ctx.char.flags.team && ctx.nearest('field', 12),
    text: (ctx) => `It's the final at ${where(ctx.nearest('field', 12))}. The score is tied and {name} has the ball.`,
    choices: [
      { label: 'Shoot!', outcomes: [o('GOAL! {name} was carried off the pitch.', { happiness: 10, looks: 2 }, { weight: 2 }), o('Over the bar. So close.', { happiness: -3 })] },
      { label: 'Pass to a teammate', outcomes: [o('The teammate scored, and {name} got the assist.', { happiness: 6 }, { do: (c) => c.addFriend(55) })] },
    ],
  },
  {
    id: 'first_phone',
    stages: ['teen'],
    once: true,
    text: 'Everyone at school has a phone except {name}.',
    choices: [
      { label: 'Beg {mother}', outcomes: [o('{mother} caved. {name} now has a very old phone.', { happiness: 5 }), o('"When you\'re older." Every parent ever.', { happiness: -3 })] },
      { label: 'Save up for one ($200)', outcomes: [o('{name} saved up and bought a phone. It feels earned.', { happiness: 5, money: -200 }, { weight: (c) => (c.char.money >= 200 ? 1 : 0) }), o('{name} is still saving. Slowly.', { happiness: -1 }, { weight: (c) => (c.char.money >= 200 ? 0 : 1) })] },
      { label: 'Who needs a phone?', outcomes: [o('{name} read three books that month.', { smarts: 3 })] },
    ],
  },
  {
    id: 'exam_cheat',
    stages: ['teen'],
    once: true,
    text: 'Someone is selling the answers to the maths exam.',
    choices: [
      { label: 'Buy them ($30)', outcomes: [o('The answers were fake. {name} failed and lost $30.', { money: -30, happiness: -5, smarts: -1 }, { weight: 2 }), o('{name} got caught. Detention for a month.', { money: -30, happiness: -6 })] },
      { label: 'Study for real', outcomes: [o('{name} earned every mark.', { smarts: 4, happiness: 2 })] },
      { label: 'Report it', outcomes: [o('The teacher was impressed. Some classmates were not.', { smarts: 1, happiness: -1 })] },
    ],
  },
  {
    id: 'prom',
    stages: ['teen'],
    minAge: 16,
    once: true,
    text: 'The school dance is on Friday.',
    choices: [
      { label: 'Ask someone', outcomes: [o('They said yes! {name} danced all night.', { happiness: 9, looks: 1 }, { weight: (c) => 1 + c.char.stats.looks / 60 }), o('They already had a date. Ouch.', { happiness: -5 })] },
      { label: 'Go with friends', outcomes: [o('{name} and friends ruled the dance floor.', { happiness: 7 })] },
      { label: 'Skip it', outcomes: [o('{name} had a film night instead.', { happiness: 1 })] },
    ],
  },
  {
    id: 'summer_job',
    stages: ['teen'],
    minAge: 15,
    once: true,
    when: (ctx) => ctx.nearest('shop', 30),
    text: (ctx) => `${where(ctx.nearest('shop', 30)).replace(/^the/, 'The')} is looking for summer help.`,
    choices: [
      { label: 'Apply', outcomes: [o('{name} stacked shelves all summer and earned $900.', { money: 900, happiness: 2, smarts: 1 })] },
      { label: 'Enjoy the summer', outcomes: [o('{name} spent the summer outdoors with friends.', { happiness: 6 })] },
    ],
  },

  // ---- Young adult and adult ------------------------------------------------------
  {
    id: 'new_neighbours',
    stages: ['young', 'adult', 'senior'],
    cooldown: 5,
    when: (ctx) => !ctx.char.livesWithParents && ctx.neighbour(),
    text: (ctx) => {
      const n = ctx.neighbour();
      return `${n.family[0].toUpperCase() + n.family.slice(1)} at ${n.x}, ${n.y} just moved in next door.`;
    },
    choices: [
      { label: 'Bring them cookies', outcomes: [o('{name} met {neighbourperson}, who turned out to be lovely.', { happiness: 5 }, { do: (c) => c.addFriend(55, c.neighbour()?.person) })] },
      { label: 'Wave from the window', outcomes: [o('A friendly wave. That\'ll do.', { happiness: 1 })] },
    ],
  },
  {
    id: 'noisy_neighbours',
    stages: ['young', 'adult', 'senior'],
    cooldown: 6,
    when: (ctx) => ctx.neighbour() && ctx.facts.home?.structure?.type === 'tower',
    text: (ctx) => `The flat above {name} at ${ctx.char.home.x}, ${ctx.char.home.y} is having its third party this week.`,
    choices: [
      { label: 'Join the party', outcomes: [o('Best night in ages. {name} knows everyone upstairs now.', { happiness: 6, health: -2 }, { do: (c) => c.addFriend(50) })] },
      { label: 'Knock and complain', outcomes: [o('They turned it down. Mostly.', { happiness: 1 })] },
      { label: 'Earplugs', outcomes: [o('{name} slept through it all.', { health: 1 })] },
    ],
  },
  {
    id: 'housewarming',
    stages: ['young', 'adult', 'senior'],
    once: true,
    when: (ctx) => ctx.char.flags.ownsHome,
    text: '{name} has finally unpacked the last box. Time for a housewarming party?',
    choices: [
      { label: 'Throw a party', outcomes: [o('Half the street came. Someone brought a very large plant.', { happiness: 7, money: -200 }, { do: (c) => c.addFriend(50) })] },
      { label: 'Enjoy the quiet', outcomes: [o('{name} sat in the new garden with a cup of tea.', { happiness: 5 })] },
    ],
  },
  {
    id: 'town_milestone',
    stages: ['child', 'teen', 'young', 'adult', 'senior'],
    weight: 6,
    cooldown: 0,
    when: (ctx) => (ctx.city.systems.milestones?.reached || 0) > (ctx.char.flags.townTier ?? ctx.city.systems.milestones?.reached ?? 0),
    title: 'A big day for the town',
    text: (ctx) => `The town just became a ${MILESTONES[ctx.city.systems.milestones.reached].label}! There's a festival with music and food stalls.`,
    choices: [
      { label: 'Dance in the street', outcomes: [o('{name} danced until the fireworks.', { happiness: 8 }, { do: (c) => c.markTownTier() })] },
      { label: 'Try every food stall', outcomes: [o('{name} ate eleven different things. No regrets.', { happiness: 6, health: -1 }, { do: (c) => c.markTownTier() })] },
      { label: 'Watch from the balcony', outcomes: [o('{name} watched the lights of the growing town.', { happiness: 4 }, { do: (c) => c.markTownTier() })] },
    ],
  },
  {
    id: 'coworker',
    stages: ['young', 'adult'],
    cooldown: 4,
    when: (ctx) => ctx.char.job,
    text: 'A new colleague at the {workplace} keeps asking {name} for help.',
    choices: [
      { label: 'Show them the ropes', outcomes: [o('They became a good friend.', { happiness: 4 }, { do: (c) => c.addFriend(55) })] },
      { label: 'Point them to the manual', outcomes: [o('{name} got more work done, but lunch was lonely.', { smarts: 1 })] },
    ],
  },
  {
    id: 'bad_boss',
    stages: ['young', 'adult'],
    cooldown: 6,
    when: (ctx) => ctx.char.job,
    text: '{name}\'s new boss at the {workplace} takes credit for everyone\'s work.',
    choices: [
      { label: 'Speak up in a meeting', outcomes: [o('The whole team backed {name} up. The boss apologised.', { happiness: 6 }, { weight: (c) => (c.has('outgoing') ? 2 : 1) }), o('Awkward silence. The boss is frosty now.', { happiness: -4 })] },
      { label: 'Keep your head down', outcomes: [o('{name} put up with it.', { happiness: -3 })] },
      { label: 'Quit', outcomes: [o('{name} walked out with {their} plant under one arm.', { happiness: 3 }, { do: (c) => c.loseJob() })] },
    ],
  },
  {
    id: 'burnout',
    stages: ['young', 'adult'],
    cooldown: 6,
    when: (ctx) => ctx.char.job && ctx.char.stats.happiness < 45,
    title: 'Running on empty',
    text: '{name} has been working too hard and feels worn out.',
    choices: [
      { label: 'Take a week off', outcomes: [o('{name} rested, slept and felt human again.', { happiness: 7, health: 4 })] },
      { label: 'Push through', outcomes: [o('{name} pushed through. It wasn\'t pretty.', { health: -5, happiness: -3 })] },
      {
        label: 'Ask for fewer hours',
        outcomes: [o('The {workplace} agreed. Less money, more life.', { happiness: 6, money: -1500 })],
      },
    ],
  },
  {
    id: 'friend_wedding',
    stages: ['young', 'adult'],
    cooldown: 5,
    when: (ctx) => ctx.person('friend'),
    text: '{friend} is getting married and wants {name} to give a speech.',
    choices: [
      { label: 'Write a heartfelt speech', outcomes: [o('Not a dry eye in the house.', { happiness: 6, rel: { friend: 10 } }, { weight: (c) => 1 + c.char.stats.smarts / 60 }), o('{name} forgot the middle bit but nobody noticed.', { happiness: 3, rel: { friend: 6 } })] },
      { label: 'Tell embarrassing stories', outcomes: [o('Huge laughs. {friend} is still recovering.', { happiness: 5, rel: { friend: 2 } })] },
    ],
  },
  {
    id: 'kid_first_day',
    stages: ['young', 'adult'],
    cooldown: 2,
    when: (ctx) => ctx.char.children.some((k) => k.age === 5 || k.age === 6) && !ctx.char.flags.kidSchool,
    text: (ctx) =>
      ctx.facts.schoolCoverage > 0.25
        ? `It's {child}'s first day at school. The school is just round the corner.`
        : `It's {child}'s first day at school, but the nearest school is a long way away. (A school near home would help.)`,
    choices: [
      { label: 'Walk {child} to the gate', outcomes: [o('{child} ran in without looking back. {name} cried a little.', { happiness: 5, set: ['kidSchool'] })] },
      { label: 'Take a photo first', outcomes: [o('The photo is on the fridge forever.', { happiness: 6, set: ['kidSchool'] })] },
    ],
  },
  {
    id: 'heatwave',
    stages: ['young', 'adult', 'senior'],
    cooldown: 3,
    when: (ctx) => season(ctx) === 'summer',
    text: 'A heatwave hits the city.',
    choices: [
      { label: 'Head for the water', outcomes: [o('{name} paddled in the river with half the town.', { happiness: 6 }, { weight: (c) => (c.nearestWater(6) ? 3 : 0) }), o('The nearest water is far away. {name} sat in front of a fan.', { happiness: 1 }, { weight: (c) => (c.nearestWater(6) ? 0 : 1) })] },
      { label: 'Shade under the trees', outcomes: [o('Cool and green under the trees.', { happiness: 4, health: 1 }, { weight: (c) => (c.facts.greenery > 0.1 ? 2 : 0) }), o('Not many trees around here. Too hot!', { happiness: -2 }, { weight: (c) => (c.facts.greenery > 0.1 ? 0 : 1) })] },
    ],
  },
  {
    id: 'blossom',
    stages: ['teen', 'young', 'adult', 'senior'],
    cooldown: 4,
    when: (ctx) => season(ctx) === 'spring' && ctx.nearest('park', 10),
    text: (ctx) => `The cherry blossom is out at ${where(ctx.nearest('park', 10))}.`,
    choices: [
      { label: 'Have a picnic', outcomes: [o('Pink petals in the sandwiches. Perfect.', { happiness: 6 })] },
      { label: 'Take photos', outcomes: [o('{name}\'s blossom photo got a lot of likes.', { happiness: 4, looks: 1 })] },
    ],
  },
  {
    id: 'side_hustle',
    stages: ['young', 'adult'],
    once: true,
    text: '{name} has an idea for a side business.',
    choices: [
      {
        label: 'Go for it ($1,000)',
        outcomes: [
          o('The handmade candles sold out! {name} made $4,000.', { money: 3000, happiness: 8 }, { weight: (c) => (c.has('creative') ? 2 : 1) }),
          o('It flopped. {name} owns 300 candles now.', { money: -1000, happiness: -4 }),
        ],
      },
      { label: 'Keep it as a dream', outcomes: [o('Maybe one day.', {})] },
    ],
  },

  // ---- Senior ---------------------------------------------------------------------
  {
    id: 'chess_park',
    stages: ['senior'],
    cooldown: 3,
    when: (ctx) => ctx.nearest('park', 10),
    text: (ctx) => `A group plays chess every morning at ${where(ctx.nearest('park', 10))}.`,
    choices: [
      { label: 'Join a game', outcomes: [o('{name} lost to an 8-year-old, then won the next five.', { happiness: 5, smarts: 2 }, { do: (c) => c.addFriend(55) })] },
      { label: 'Feed the pigeons instead', outcomes: [o('The pigeons know {name} by name now.', { happiness: 3 })] },
    ],
  },
  {
    id: 'school_reading',
    stages: ['senior'],
    once: true,
    when: (ctx) => ctx.nearest('school', 12),
    text: (ctx) => `${where(ctx.nearest('school', 12)).replace(/^the/, 'The')} is looking for volunteers to read with the children.`,
    choices: [
      { label: 'Volunteer', outcomes: [o('{name} became the children\'s favourite storyteller.', { happiness: 8, smarts: 1 })] },
      { label: 'Not for me', outcomes: [o('{name} enjoys the quiet.', { happiness: 1 })] },
    ],
  },
  {
    id: 'reunion',
    stages: ['senior'],
    once: true,
    text: 'It\'s {name}\'s 50-year school reunion.',
    choices: [
      { label: 'Go', outcomes: [o('Everyone looked older except {name}, obviously.', { happiness: 7 }, { do: (c) => c.addFriend(50) })] },
      { label: 'Send a card', outcomes: [o('{name}\'s card was read out to cheers.', { happiness: 3 })] },
    ],
  },
  {
    id: 'downsize',
    stages: ['senior'],
    once: true,
    when: (ctx) => ctx.char.flags.ownsHome,
    text: 'The house feels big now. {name} could sell up and move somewhere smaller.',
    choices: [
      { label: 'Sell and enjoy the money', outcomes: [o('{name} sold up and has money for travel.', { money: 20000, happiness: 4 })] },
      { label: 'Stay. Too many memories here', outcomes: [o('{name} stayed among the memories.', { happiness: 4 })] },
    ],
  },
  {
    id: 'career_award',
    stages: ['adult', 'senior'],
    once: true,
    when: (ctx) => ctx.char.job && ctx.char.job.level >= CAREERS[ctx.char.job.type].titles.length - 1 && ctx.char.age >= 45,
    text: 'The {workplace} wants to give {name} an award for {their} years of work.',
    choices: [
      { label: 'Give a speech', outcomes: [o('{name}\'s speech got a standing ovation.', { happiness: 8 })] },
      { label: 'Accept it quietly', outcomes: [o('{name} put the award on the mantelpiece.', { happiness: 6 })] },
    ],
  },
];
