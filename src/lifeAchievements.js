// Life Story achievements (kept across lives) and the ribbon each finished life earns.
// Pure data: each test reads the character (and LifeSystem facts where needed).

import { CAREERS } from './lifeData.js';

export const ACHIEVEMENTS = [
  { id: 'first_breath', label: 'Hello world', desc: 'Start a Life Story', test: () => true },
  { id: 'bookworm', label: 'Bookworm', desc: 'Reach 90 Smarts', test: (c) => c.stats.smarts >= 90 },
  { id: 'fit', label: 'Fighting fit', desc: 'Reach 100 Health after age 40', test: (c) => c.stats.health >= 100 && c.age >= 40 },
  { id: 'sunshine', label: 'Ray of sunshine', desc: 'Reach 100 Happiness', test: (c) => c.stats.happiness >= 100 },
  { id: 'stunner', label: 'Head-turner', desc: 'Reach 90 Looks', test: (c) => c.stats.looks >= 90 },
  { id: 'butterfly', label: 'Social butterfly', desc: 'Have 6 close friends at once', test: (c) => c.friends.filter((f) => f.closeness >= 70).length >= 6 },
  { id: 'married', label: 'Happily ever after', desc: 'Get married', test: (c) => !!c.partner?.married },
  { id: 'full_house', label: 'Full house', desc: 'Have 3 children', test: (c) => c.children.length >= 3 },
  { id: 'pet', label: 'Best friend', desc: 'Adopt a pet', test: (c) => !!(c.flags.pet || c.flags.cat) },
  { id: 'hired', label: 'First paycheck', desc: 'Get a job', test: (c) => !!c.job },
  {
    id: 'top_job',
    label: 'Top of the ladder',
    desc: 'Reach the top of a career',
    test: (c) => !!c.job && c.job.level >= CAREERS[c.job.type].titles.length - 1,
  },
  { id: 'homeowner', label: 'Homeowner', desc: 'Buy a home in your city', test: (c) => !!c.flags.ownsHome },
  { id: 'dream_home', label: 'Dream home', desc: 'Have a place of your own that is 90% desirable', test: (c, f) => !!c.home && !c.livesWithParents && f.desirability >= 0.9 },
  { id: 'nest_egg', label: 'Nest egg', desc: 'Save $100,000', test: (c) => c.money >= 100000 },
  { id: 'busy', label: 'Busy bee', desc: 'Do 25 activities in one life', test: (c) => (c.activityCount || 0) >= 25 },
  { id: 'witness', label: 'Watched it grow', desc: 'See your town become a City', test: (c) => !!c.flags.sawCity },
  { id: 'centenarian', label: 'Centenarian', desc: 'Live to 100', test: (c) => c.age >= 100 },
  { id: 'dynasty', label: 'Dynasty', desc: 'Play the third generation of a family', test: (c) => c.generation >= 3 },
];

// The first ribbon whose test passes sums up a finished life.
export const RIBBONS = [
  { id: 'centenarian', label: 'Centenarian', color: '#ffd98f', test: (c) => c.age >= 100 },
  { id: 'tycoon', label: 'Tycoon', color: '#8fd0a5', test: (c) => c.money >= 250000 },
  { id: 'genius', label: 'Genius', color: '#b49ad1', test: (c) => c.stats.smarts >= 95 },
  { id: 'family', label: 'Family first', color: '#ff9f8f', test: (c) => c.children.length >= 3 },
  { id: 'boss', label: 'Big boss', color: '#86b5e6', test: (c) => !!c.job && c.job.level >= CAREERS[c.job.type].titles.length - 1 },
  { id: 'social', label: 'Life of the party', color: '#f49ab8', test: (c) => c.friends.filter((f) => f.closeness >= 70).length >= 5 },
  { id: 'romantic', label: 'Romantic', color: '#ff8fa3', test: (c) => !!c.partner?.married },
  { id: 'adventurer', label: 'Adventurer', color: '#ffcf6e', test: (c) => (c.activityCount || 0) >= 40 },
  { id: 'homeowner', label: 'Home sweet home', color: '#b8e0d2', test: (c) => !!c.flags.ownsHome },
  { id: 'homebody', label: 'Homebody', color: '#d6d0c4', test: (c) => c.livesWithParents && c.age >= 30 },
  { id: 'cheerful', label: 'Cheerful soul', color: '#ffe29a', test: (c) => c.stats.happiness >= 75 },
  { id: 'quiet', label: 'A quiet life', color: '#cdb4db', test: () => true },
];

export function ribbonFor(c) {
  return RIBBONS.find((r) => r.test(c));
}
