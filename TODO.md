# Pocket Metropolis to-do

`[ ]` to do · `[x]` done · **Decision** marks a choice to settle before building.

## Done

- [x] Isometric pastel city on canvas with build tools, bounce and dust effects, day/night cycle
- [x] Residents move into the most desirable homes; cars and pedestrians
- [x] Versioned saves with migrations; Random Town; deployed on Vercel
- [x] 32×32 map, jobs (shop, office), services (school, clinic), traffic, Inspect tool, map views, speed controls

## 1. Life Story: live one resident's life

You create a main character who moves into your city. Every so often a text event pops up, like a message: *"Your neighbour invites you to the park on Saturday."* You pick one of two to four choices, and each choice leads to its own outcome that changes your character's stats and story (in the spirit of BitLife). The city you build shapes that life: the schools, clinics, jobs and parks you place decide which events and careers are possible.

### 1a. Create a character
- [ ] Creation screen: name, pronouns, look (skin tone, hair, outfit colour)
- [ ] Two starting traits that tilt outcomes (Curious, Outgoing, Thrifty, Sporty, Creative, Calm…)
- [ ] **Decision:** start as a newborn in a family, or move in as a young adult
- [ ] Pick a home (or take the most desirable vacancy); the character appears as a highlighted walker on the map
- [ ] Save the character with the city (save version 3 with a migration)

### 1b. Stats, age and life stages
- [ ] Stats from 0 to 100: Happiness, Health, Smarts, Looks; plus Money
- [ ] **Decision:** time passes with the city clock (for example a year per in-game day) or with an "Age up" button like BitLife
- [ ] Life stages: child, teen, young adult, adult, senior; a life ends, and you can continue as your child
- [ ] Life log: a scrollable timeline of every event and choice ("Age 17: You aced your exams.")

### 1c. Event engine
- [ ] Data-driven events: conditions (age, stage, stats, traits, flags, city facts), text with `{name}` placeholders, choices, weighted outcomes, stat changes, follow-up events
- [ ] Scheduler with cooldowns so events don't repeat too soon; nothing fires while paused
- [ ] Message-style pop-up card that works on phones, with an outcome card showing stat changes
- [ ] Event chains through flags (a first date leads to a second)
- [ ] Unit tests for condition matching, outcome rolls and chains

### 1d. Link the life to the city
- [ ] School nearby: school events and faster Smarts growth; no school means fewer options
- [ ] Clinic nearby: illnesses are milder and recovery faster
- [ ] Careers come from real workplaces (shop, office, school, clinic); applications fail when there are no openings
- [ ] Traffic on your commute adds stress events; parks and trees near home add calm ones
- [ ] Your character walks or drives along their real commute
- [ ] Moving house: choose a new home among vacancies, with desirability shown

### 1e. First content pack
- [ ] About 40 events: childhood 10, teen 10, adult 12, senior 8
- [ ] Relationships: family, friends and a partner, each with closeness from 0 to 100
- [ ] Careers with promotions: shop assistant → shop manager, office junior → director, teacher, nurse → doctor
- [ ] Money: daily wage, purchases, rent

### 1f. Polish
- [ ] Badge on a Life button when an event is waiting
- [ ] Settings: event frequency, pause the city while an event is open
- [ ] Choose with the keyboard; respects reduced motion

## 2. Ideas from IsoCity

From [isometric-city](https://github.com/uxcaleb/isometric-city) (originally amilich/isometric-city) (MIT). Ideas to adapt, not code to copy.

- [ ] Minimap for the bigger map; tap to jump there
- [ ] Advisors: short hints such as "Downtown is jammed; add a parallel street"
- [ ] Roads over water drawn as bridges
- [ ] Buses and bus stops; trains later
- [ ] More building variety: small and medium houses, apartments, a mall
- [ ] Buildings bigger than one tile (2×2), which needs multi-tile footprints in the state
- [ ] Recreation: playground, sports field, community centre; turns on the entertainment factor
- [ ] Police and fire stations with gentle incidents (a small fire, a lost cat), turning on the safety factor
- [ ] City name generator and several saved cities
- [ ] Statistics panel with history sparklines

## 3. Deploy and tooling
- [ ] Vercel redeploys on every push (Vercel can't see `30lilmickey-prog/pocket-metropolis` yet; until then each deploy is started by hand)
- [ ] Test pinch and long-press on a real phone
- [ ] Run `npm test` on every pull request with GitHub Actions
