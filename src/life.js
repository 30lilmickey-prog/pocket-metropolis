// Life Story: one resident's life, played through text events. The character's state is saved in
// city.systems.life; their home and job are real tiles in the city, so building choices shape the
// events, schooling and careers they get.

import { STRUCTURES, DAY_LENGTH_SECONDS } from './config.js';
import { FIRST_NAMES, LAST_NAMES, PRONOUNS, CAREERS, stageFor } from './lifeData.js';
import { pickEvent, fill, choicesFor, rollOutcome, applyEffects } from './lifeEngine.js';
import { LIFE_EVENTS } from './lifeEvents.js';
import { pick } from './utils.js';

// One year of life passes per in-game day; Age up skips ahead.
export const YEAR_SECONDS = DAY_LENGTH_SECONDS;
const MAX_LOG = 200;
const FALLBACKS = new Set(['job', 'work', 'a classmate', 'someone special', 'the little one']);

export class LifeSystem {
  constructor(city, { rng = Math.random, events = LIFE_EVENTS } = {}) {
    this.city = city;
    this.rng = rng;
    this.events = events;
  }

  get state() {
    return this.city.systems.life || null;
  }

  get char() {
    return this.state?.char || null;
  }

  // ---- Creating a life ---------------------------------------------------

  randomName() {
    return { first: pick(FIRST_NAMES, this.rng), last: pick(LAST_NAMES, this.rng) };
  }

  // Born as a baby into a family living in one of the city's homes.
  create({ first, last, pronouns = 'they', look, traits = [] }, parentsOverride = null) {
    const rng = this.rng;
    const r = (a, b) => a + Math.floor(rng() * (b - a + 1));
    const home = this.bestHome({ occupiedOk: true, preferOccupied: true });
    const parentName = () => `${pick(FIRST_NAMES, rng)} ${last}`;
    const prev = this.state;
    const char = {
      first,
      last,
      pronouns: PRONOUNS[pronouns] ? pronouns : 'they',
      look,
      traits: traits.slice(0, 2),
      age: 0,
      yearProgress: 0,
      stats: { happiness: r(70, 85), health: r(70, 90), smarts: r(35, 60), looks: r(40, 75) },
      money: 0,
      home: home ? { x: home.x, y: home.y } : null,
      livesWithParents: true,
      family: parentsOverride || {
        mother: { name: parentName(), closeness: r(65, 90), age: r(24, 36), alive: true },
        father: { name: parentName(), closeness: r(60, 90), age: r(25, 38), alive: true },
      },
      friends: [],
      partner: null,
      children: [],
      job: null,
      flags: {},
      seen: {},
      log: [],
      plan: [],
      pending: null,
      alive: true,
      death: null,
      generation: (prev?.char?.generation || 0) + 1,
    };
    this.city.systems.life = { char, history: prev?.history || [] };
    const where = home ? `a ${STRUCTURES[home.structure.type].label.toLowerCase()} at ${home.x}, ${home.y}` : 'a city with no homes yet';
    this.log(`${first} ${last} was born in ${where}.`);
    this.planYear();
    this.city.emit('lifeChanged');
    return char;
  }

  // Keep playing as your oldest child after a life ends.
  continueAsChild() {
    const s = this.state;
    const parent = s?.char;
    const kid = parent?.children?.find((c) => c.alive !== false);
    if (!kid) return null;
    s.history.push(summaryOf(parent));
    const otherParent = parent.partner ? { name: parent.partner.name, closeness: 70, age: parent.age, alive: true } : null;
    const family = {
      mother: { name: `${parent.first} ${parent.last}`, closeness: 80, age: parent.age, alive: false },
      father: otherParent || { name: `${pick(FIRST_NAMES, this.rng)} ${parent.last}`, closeness: 50, age: parent.age, alive: false },
    };
    const char = this.create({ first: kid.name.split(' ')[0], last: parent.last, pronouns: kid.pronouns, look: kid.look || parent.look, traits: parent.traits }, family);
    char.age = kid.age;
    char.livesWithParents = kid.age < 18;
    char.money = Math.round(parent.money * 0.6);
    char.home = parent.home;
    char.log = [];
    this.log(`${char.first} carries on the ${parent.last} family story, inheriting $${char.money.toLocaleString()}.`);
    this.planYear();
    this.city.emit('lifeChanged');
    return char;
  }

  // ---- Time --------------------------------------------------------------

  // Background aging. Life time stops while an event waits for an answer.
  update(dt) {
    const c = this.char;
    if (!c || !c.alive || c.pending) return;
    c.yearProgress += dt / YEAR_SECONDS;
    while (c.plan.length && c.yearProgress >= c.plan[0] && !c.pending) {
      c.plan.shift();
      this.fireEvent();
    }
    if (!c.pending && c.yearProgress >= 1) this.birthday();
  }

  // Skip to the next birthday; the new year's first event shows straight away.
  ageUp() {
    const c = this.char;
    if (!c || !c.alive || c.pending) return false;
    this.birthday();
    if (c.alive && c.plan.length) {
      c.plan.shift();
      this.fireEvent();
    }
    return true;
  }

  birthday() {
    const c = this.char;
    c.age += 1;
    c.yearProgress = 0;
    this.yearly();
    if (c.alive) this.planYear();
    this.city.emit('lifeChanged');
  }

  planYear() {
    const c = this.char;
    const n = c.age < 3 ? (this.rng() < 0.7 ? 1 : 0) : 1 + (this.rng() < 0.5 ? 1 : 0);
    c.plan = Array.from({ length: n }, () => 0.15 + this.rng() * 0.75).sort((a, b) => a - b);
  }

  // Yearly drift: school, health, money, family, and keeping home and job in sync with the city.
  yearly() {
    const c = this.char;
    const f = this.facts();
    const has = (t) => c.traits.includes(t);
    for (const k of c.children) k.age += 1;
    for (const p of [c.family.mother, c.family.father]) {
      if (!p?.alive) continue;
      p.age += 1;
      if (p.age > 72 && this.rng() < ((p.age - 72) / 30) ** 2) {
        p.alive = false;
        c.stats.happiness = Math.max(0, c.stats.happiness - 12);
        this.log(`${p.name} passed away at ${p.age}.`);
      }
    }

    if (c.age >= 6 && c.age <= 17) c.stats.smarts += (f.schoolCoverage > 0.25 ? 3 : 1) + (has('curious') ? 1 : 0);
    let dHealth = 0;
    if (c.age >= 50) dHealth -= 1 + Math.floor((c.age - 50) / 12);
    if (f.clinicCoverage > 0.25) dHealth += 1;
    if (f.greenery > 0.15) dHealth += 1;
    if (has('sporty')) dHealth += 1;
    c.stats.health += dHealth;
    if (c.age > 55) c.stats.looks -= 1;
    const target = 35 + f.desirability * 40 + (c.job ? 6 : 0) + (c.partner ? 6 : 0) + Math.min(10, c.friends.length * 3);
    const pull = has('calm') ? 0.25 : 0.15;
    c.stats.happiness += (target - c.stats.happiness) * pull;
    for (const k of ['happiness', 'health', 'smarts', 'looks']) c.stats[k] = Math.max(0, Math.min(100, Math.round(c.stats[k])));
    for (const fr of c.friends) fr.closeness = Math.max(0, fr.closeness - 2);

    // Money: savings from work, minus rent once living alone.
    if (c.job) {
      const career = CAREERS[c.job.type];
      const pay = career.pay[c.job.level] || career.pay[0];
      c.money += Math.round(pay * (has('thrifty') ? 0.25 : 0.15));
      c.job.years += 1;
    } else if (c.flags.partTime && c.age < 18) c.money += 1500;
    if (!c.livesWithParents && !c.job) c.money = Math.max(0, c.money - 3000);

    this.syncWithCity();

    // Old age.
    const risk = c.age >= 65 ? ((c.age - 65) / 35) ** 3 * (1.3 - c.stats.health / 100) : 0;
    if (c.stats.health <= 0 || this.rng() < risk) this.die(c.stats.health <= 0 ? 'ill health' : 'old age');
  }

  // The city can change under a life: bulldozed homes and workplaces. Called yearly and after edits.
  syncWithCity() {
    const c = this.char;
    if (!c?.alive) return;
    if (c.job) {
      const t = this.city.getTile(c.job.x, c.job.y);
      if (t?.structure?.type !== c.job.type) {
        this.log(`The ${c.job.type} where ${c.first} worked closed down.`);
        c.stats.happiness = Math.max(0, c.stats.happiness - 8);
        c.job = null;
      }
    }
    const home = c.home && this.city.getTile(c.home.x, c.home.y);
    if (!home?.structure || !STRUCTURES[home.structure.type].capacity) {
      const next = this.bestHome({ occupiedOk: c.livesWithParents });
      if (next) {
        c.home = { x: next.x, y: next.y };
        this.log(`${c.first}'s home was demolished. ${c.livesWithParents ? 'The family' : c.first} moved to ${next.x}, ${next.y}.`);
      } else {
        c.home = null;
        this.log(`${c.first}'s home was demolished and there was nowhere free to move.`);
      }
      c.stats.happiness = Math.max(0, c.stats.happiness - 6);
    }
  }

  die(cause) {
    const c = this.char;
    c.alive = false;
    c.death = { age: c.age, cause };
    c.plan = [];
    c.pending = null;
    this.log(`${c.first} ${c.last} died of ${cause} at ${c.age}.`);
    this.city.emit('lifeChanged');
  }

  // ---- Events ------------------------------------------------------------

  fireEvent(forceId = null) {
    const c = this.char;
    const ctx = this.ctx();
    const ev = forceId ? this.events.find((e) => e.id === forceId) : pickEvent(this.events, ctx, this.rng);
    if (!ev) return null;
    c.seen[ev.id] = c.age;
    c.pending = { id: ev.id, age: c.age, choices: choicesFor(ev, ctx) };
    this.city.emit('lifeEvent', { id: ev.id });
    return c.pending;
  }

  // What the event card shows for the waiting event.
  current() {
    const c = this.char;
    if (!c?.pending) return null;
    const ev = this.events.find((e) => e.id === c.pending.id);
    if (!ev) {
      c.pending = null;
      return null;
    }
    const vars = this.vars();
    return {
      id: ev.id,
      title: ev.title ? fill(ev.title, vars) : null,
      text: fill(ev.text, vars),
      choices: c.pending.choices.map((ch) => fill(ch.label, vars)),
    };
  }

  choose(index) {
    const c = this.char;
    const p = c?.pending;
    if (!p || !p.choices[index]) return null;
    const ev = this.events.find((e) => e.id === p.id);
    const ctx = this.ctx();
    const choice = p.choices[index];
    const outcome = rollOutcome(ev, choice.index, choice.data, ctx, this.rng) || { text: 'Life goes on.' };
    const before = this.vars();
    const changes = applyEffects(outcome.effects, ctx);
    if (outcome.do) outcome.do(ctx, choice.data);
    // Name things as they were when the choice was made (the job just left), plus anything new (a baby's name).
    const after = this.vars();
    const vars = { ...after };
    for (const k of Object.keys(before)) if (FALLBACKS.has(after[k]) && !FALLBACKS.has(before[k])) vars[k] = before[k];
    const text = fill(outcome.text, vars);
    this.log(text);
    c.pending = null;
    if (outcome.next) this.fireEvent(outcome.next);
    this.city.emit('lifeChanged');
    return { text, changes };
  }

  // ---- Helpers events use --------------------------------------------------

  log(text) {
    const c = this.char;
    c.log.unshift({ age: c.age, text });
    if (c.log.length > MAX_LOG) c.log.length = MAX_LOG;
  }

  vars() {
    const c = this.char;
    const pr = PRONOUNS[c.pronouns];
    const friend = [...c.friends].sort((a, b) => b.closeness - a.closeness)[0];
    return {
      name: c.first,
      fullname: `${c.first} ${c.last}`,
      last: c.last,
      age: c.age,
      they: pr.they,
      them: pr.them,
      their: pr.their,
      mother: c.family.mother?.name.split(' ')[0] || 'Mum',
      father: c.family.father?.name.split(' ')[0] || 'Dad',
      friend: friend?.name.split(' ')[0] || 'a classmate',
      partner: c.partner?.name.split(' ')[0] || 'someone special',
      child: c.children[0]?.name.split(' ')[0] || 'the little one',
      job: c.job ? CAREERS[c.job.type].titles[c.job.level].toLowerCase() : 'job',
      workplace: c.job ? STRUCTURES[c.job.type].label.toLowerCase() : 'work',
    };
  }

  // City facts for the character's home and job.
  facts() {
    const c = this.char;
    const home = c?.home && this.city.getTile(c.home.x, c.home.y);
    const jam = (t) => {
      if (!t) return 0;
      let worst = 0;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) worst = Math.max(worst, this.city.getTile(t.x + dx, t.y + dy)?.congestion || 0);
      return worst;
    };
    const work = c?.job && this.city.getTile(c.job.x, c.job.y);
    return {
      home,
      schoolCoverage: home?.coverage?.school || 0,
      clinicCoverage: home?.coverage?.health || 0,
      greenery: home?.factors?.greenery || 0,
      desirability: home?.desirability ?? 0.4,
      commuteJam: Math.max(jam(home), jam(work)),
      cityHappiness: (this.city.stats.happiness || 50) / 100,
    };
  }

  // Workplaces with free positions, nearest first.
  openJobs() {
    const c = this.char;
    const from = c.home || { x: this.city.width / 2, y: this.city.height / 2 };
    return this.city
      .workplaces()
      .filter((w) => CAREERS[w.structure.type] && this.city.accessRoad(w.x, w.y) && w.workersFilled < STRUCTURES[w.structure.type].jobs)
      .filter((w) => !(c.job && c.job.x === w.x && c.job.y === w.y))
      .sort((a, b) => Math.abs(a.x - from.x) + Math.abs(a.y - from.y) - (Math.abs(b.x - from.x) + Math.abs(b.y - from.y)));
  }

  // Homes with room, most desirable first.
  openHomes() {
    const c = this.char;
    return this.city
      .homes()
      .filter((h) => h.structure.residents < STRUCTURES[h.structure.type].capacity)
      .filter((h) => !(c?.home && c.home.x === h.x && c.home.y === h.y))
      .sort((a, b) => b.desirability - a.desirability);
  }

  bestHome({ occupiedOk = false, preferOccupied = false } = {}) {
    const homes = this.city.homes().sort((a, b) => b.desirability - a.desirability);
    if (preferOccupied) {
      const lived = homes.find((h) => h.structure.residents > 0);
      if (lived) return lived;
    }
    return this.openHomes()[0] || (occupiedOk ? homes[0] : null) || null;
  }

  ctx() {
    const c = this.char;
    const life = this;
    return {
      char: c,
      city: this.city,
      rng: this.rng,
      facts: this.facts(),
      has: (t) => c.traits.includes(t),
      person(who) {
        if (who === 'mother' || who === 'father') return c.family[who]?.alive ? c.family[who] : null;
        if (who === 'partner') return c.partner;
        if (who === 'friend') return [...c.friends].sort((a, b) => b.closeness - a.closeness)[0] || null;
        if (who === 'child') return c.children[0] || null;
        return null;
      },
      addFriend(closeness = 55) {
        const name = `${pick(FIRST_NAMES, life.rng)} ${pick(LAST_NAMES, life.rng)}`;
        c.friends.push({ name, closeness });
        if (c.friends.length > 6) c.friends.sort((a, b) => b.closeness - a.closeness).length = 6;
        return name;
      },
      setPartner(closeness = 60) {
        c.partner = { name: `${pick(FIRST_NAMES, life.rng)} ${pick(LAST_NAMES, life.rng)}`, closeness, married: false };
        return c.partner.name;
      },
      addChild() {
        const pronouns = pick(['she', 'he', 'they'], life.rng);
        const kid = { name: `${pick(FIRST_NAMES, life.rng)} ${c.last}`, age: 0, pronouns, alive: true, look: c.look };
        c.children.push(kid);
        return kid.name;
      },
      moveTo(tile) {
        c.home = { x: tile.x, y: tile.y };
        c.livesWithParents = false;
      },
      takeJob(tile) {
        c.job = { type: tile.structure.type, x: tile.x, y: tile.y, level: 0, years: 0 };
      },
      loseJob() {
        c.job = null;
      },
      openJobs: () => life.openJobs(),
      openHomes: () => life.openHomes(),
    };
  }
}

export function summaryOf(c) {
  return {
    name: `${c.first} ${c.last}`,
    age: c.death?.age ?? c.age,
    job: c.job ? CAREERS[c.job.type].titles[c.job.level] : null,
    money: c.money,
    children: c.children.length,
    generation: c.generation,
  };
}

export function lifeStage(c) {
  return stageFor(c.age);
}
