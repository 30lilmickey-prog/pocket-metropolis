# Pocket Metropolis

A relaxing isometric tiny-city builder. You plan the city; residents decide for themselves where to live, work and stroll.

**What's in it**

- **New town** (top-right button, or ☰ → New town…): choose **Sandbox** (everything unlocked) or **Milestones** (unlock buildings as you grow), a **small (16×16), medium (32×32) or large (48×48)** map, and **empty land** to build from scratch or a ready-made **starter town**. Your Life Story and achievements carry over
- The first visit starts with a 32×32 starter town in the middle, with a river, woods and room to grow
- Homes (house, cottage, apartments, tower), workplaces (shop, café, office, mall, factory), services (school, clinic), recreation (playground, sports field), nature (tree, park, water) and roads. Factories pay well but their smoke makes nearby homes less desirable
- **Town budget:** building costs money (Sandbox builds for free). Residents and workers pay taxes, businesses pay per job filled, and roads, schools, clinics and parks cost upkeep. The balance and net per day sit in the stats bubble; the City panel's **Budget** shows what comes in and goes out by kind of building, the **top earning buildings** (with Show me), the last few days, and a balance trend. Undo refunds what an edit cost; the town can't go below zero
- **Notable people:** like great people in Civilization, a famous resident is born in or moves to your town when its buildings inspire them: schools inspire scientists, clinics doctors, businesses merchants, factories engineers, parks and cafés artists, sports fields athletes, and a growing town planners. Each arrival gets a card and a badge over their home, and gives the whole town a bonus (wider school or clinic reach, more tax, cheaper building, less upkeep, nicer streets). The City panel lists everyone and who is likely to come next
- Residents move into the most desirable homes. Desirability comes from parks and trees, water views, road access, school and clinic coverage, playgrounds and sport, jobs, and traffic
- **Milestones:** your town grows from Hamlet to Village (60 residents), Town (200), City (450) and Metropolis (900). Each title unlocks buildings for good, with a small celebration. Tap the stats bubble to see your progress
- **Resident thoughts:** residents say what they wish for ("Our kids have no school nearby") in bubbles over their homes and in the City panel, with a **Show me** button that flies to the spot. Issues are colour-coded: **red** needs fixing, **yellow** is worth a look, **green** is going well. While the City panel is open the affected tiles are tinted on the map in the same colour, and the issue you're looking at pulses with a marker over each tile
- Placing something shows how much nearby homes gained or lost (+6%), and a new home shows how appealing its lot is
- A labor market matches workers to the nearest jobs they can reach by road. Busy roads cost more to use, so commuters spread onto other routes when there are any, and cars follow those routes at morning and evening rush hour. Only through traffic counts towards a jam: a street isn't blamed for the people turning in and out of the buildings along it
- **Road suggestions:** when a street is jammed, the town tries out possible new roads behind the scenes (extending a dead end, a link road, a road alongside or around the jam) and residents only complain where one would really help. The suggestion is sketched on the map with a dashed outline, and **Build it** in the City panel lays it down in one step (undo works)
- **Street names and addresses:** every straight road gets a name (Maple Street, Lavender Avenue…) painted on the map when you zoom in, and every building gets a house number, odd on one side and even on the other. Names stay put as roads grow, and when a road is cut in two the longer part keeps the name. Life Story, the inspector and events all use addresses ("14 Maple Street") instead of map coordinates
- Inspect any tile to see its address, residents or jobs and a breakdown of its desirability
- Map views for desirability, traffic and services; pause and 1×–3× speed
- A slow day/night cycle with lit windows, street lights and headlights
- Seasons (two in-game days each) and weather: rain with umbrellas and ripples, winter snow, morning fog
- Homes grow as people move in, towers and offices add floors as they fill, and roofs vary from house to house
- Gentle synthesised sound effects and ambience (birds by day, crickets at night, rain), with a mute switch
- Drag to build lines of road or paint trees, water and buildings; undo and redo every edit
- Autosave with versioned saves; older 12×12 towns open centred on the larger map
- **Share your town as a link** (☰ → Share town link). The map is packed into the link itself, so no server is needed. Opening a link gives the visitor a copy to play with; their own town is kept safe and comes back with ☰ → Back to my town
- **Minimap** in the corner: tap or drag to jump around the city (on by default on bigger screens, switchable in ☰)
- **Trends** in the City panel: population, happiness, employment and the busiest road over the last six in-game days, with a readout on hover or tap and a table view
- **Comfort settings** in ☰: colour-blind friendly colours (Okabe–Ito severity colours and blue-to-yellow map ramps) and larger text. They're remembered on this device
- **Life Story:** create a character who is born in your city and live their life through text events (see below)

Open `index.html` through any static server (ES modules need one, e.g. `npx serve .`), or build the single-file version:

```sh
node build.mjs   # writes dist/pocket-metropolis.html
```

## Deploy to Vercel

`vercel.json` runs `node build.mjs` and serves `dist/` (no dependencies to install).

Import this repository in Vercel (**Add New → Project**) with the framework preset left as **Other**; no other settings are needed.

## Life Story

Open **Life** to create a character: name, pronouns, look and two traits. They are born as a baby into a family living in one of your city's homes, marked with a pin on the map.

- A year of life passes per in-game day in the background; **Age up** skips to the next birthday. Life time stops while an event waits for an answer.
- Events pop up as messages with two to four choices. Each choice has its own outcomes, which change Happiness, Health, Smarts, Looks, Money and relationships.
- The city shapes the life: schools and clinics near home, parks and trees, traffic on the commute, which workplaces are hiring and which homes have room. Bulldozing their home or workplace changes their story too.
- Stages run from baby to senior. When a life ends you can continue as your child, or start a new life.
- **Things to do:** between events, pick activities (two a year as a child, three from 13): study, exercise, see a doctor, hang out with friends and family, go on dates, visit the playground or park, go shopping, volunteer, babysit, work overtime, look for a job. Many use real places: the nearest sports field, playground, park, shop, school or clinic. Gains shrink as a stat gets high, so variety pays.
- **Buy a home:** save up and buy a real house or flat in your city. Prices follow desirability, so the homes you make lovely cost more. After a move the camera flies to the new home, the home pin shows its address, and tapping the address in the Life panel shows it on the map.
- **Neighbours** are the families living in real homes near yours, and they keep the same names. Events follow the city too: snow days, heatwaves, cherry blossom, a festival when your town reaches a new milestone, and nudges when there's no playground or school nearby.
- **Your character on the map:** from age 3 they walk their real routes, to work by day if they have a job or out to the park, with a ring and a marker so you can spot them.
- **Achievements** (18, kept across every life in the city) and a **life ribbon** for each finished life, such as Centenarian, Tycoon, Genius or Family first.

Events are plain data in `src/lifeEvents.js` and `src/lifeEventsMore.js` (78 in all); activities are in `src/lifeActivities.js` and achievements in `src/lifeAchievements.js`. See the comment at the top of each file to add more.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Build selected item | Click | Tap |
| Build many at once | Drag (roads draw as an L) | Drag with one finger |
| Undo / redo | Ctrl+Z / Ctrl+Shift+Z, or the buttons by the toolbar | Buttons by the toolbar |
| Sound on / off | M, or the speaker button | ☰ City controls |
| Bulldoze | Right-click (or Bulldoze tool, B) | Long-press (or Bulldoze tool) |
| Inspect a tile | Inspect tool (I), then click | Inspect tool, then tap |
| Pan | Right-drag or middle-drag (or drag with Inspect) | Two fingers (or one finger with Inspect) |
| Zoom | Mouse wheel | Pinch |
| Pick a tool | 1 House · K Cottage · A Apartments · 2 Tower · 3 Shop · E Café · 4 Office · L Mall · Y Factory · 5 School · 6 Clinic · 7 Tree · 8 Park · P Playground · F Sports field · 9 Road · 0 Water | Toolbar; buttons with a dot open more choices |
| Pause / change speed | Space, or the speed button | ☰ City controls |
| Switch map view | V, or the layers button | ☰ City controls |
| Recenter | Recenter button (press again for the whole map) | ☰ City controls |
| Share, minimap, colour-blind colours, larger text | ☰ Settings & more | ☰ Settings & more |
| Jump around the map | Click or drag on the minimap | Tap or drag on the minimap |
| New town (sandbox, map size, empty land) | New town button | ☰ → New town… |
| Milestones and resident wishes | Click the stats bubble, or a thought bubble | Tap the stats bubble, or a thought bubble |

## Architecture

Each system lives in its own module under `src/` and talks to the others only through the city state and its events.

| System | Files | Responsibility |
| --- | --- | --- |
| City State | `state.js`, `config.js` | Tiles (terrain, structure, residents, road links), clock, stats, `systems` slot for future modules. Emits `placed` / `removed` / `watered` / `movedIn` / `reset` events. |
| Life Story | `life.js`, `lifeEngine.js`, `lifeEvents.js`, `lifeEventsMore.js`, `lifeActivities.js`, `lifeAchievements.js`, `lifeData.js`, `lifeUI.js` | One resident's life: aging, yearly stats, home and job tied to real tiles, the event engine and content, and the panel and event card. Saved in `city.systems.life`. |
| Simulation | `simulation.js`, `desirability.js`, `labor.js`, `coverage.js`, `agents.js`, `time.js` | Fixed-step ticks: time of day, service coverage, the labor market and road congestion, desirability, residents moving in and out, stats. Agents (commuters, cruising cars, pedestrians) read the city and move through it. |
| Renderer | `renderer.js`, `lighting.js`, `color.js`, `iso.js` | Reads state and draws the diorama. The ground layer is cached offscreen and redrawn only when the map changes; buildings and agents are depth-sorted and drawn each frame for on-screen tiles only. Also draws the data overlays. |
| Input/Camera | `input.js`, `camera.js` | Pointer, wheel and pinch gestures; smooth pan and zoom; fitting to the screen. |
| Persistence | `persistence.js` | Versioned localStorage saves with a migration table; autosave. |
| Weather | `weather.js` | Seasons from the day count; weather spells with seasonal odds; smoothed rain, snow, fog and snow cover for the renderer and agents. |
| Audio | `audio.js` | Synthesised effects (ZzFX-based) and ambience through one master volume. |
| Sharing and settings | `share.js`, `settings.js`, `minimap.js`, `trendsUI.js` | Town links (pack, deflate, base64url), viewer settings in localStorage, the minimap, and the trend tiles. Trend samples are saved in `city.systems.trends`. |
| Streets | `streets.js` | Names straight runs of road and numbers the buildings along them; names are saved in `city.systems.streets` by tile. Writes `street` and `address` on tiles. |
| History | `history.js` | Undo and redo of tile edits, plus the L-shaped road and brush stroke paths. |
| Budget and notable people | `economy.js`, `budgetUI.js`, `notables.js`, `notablesUI.js` | Costs, taxes, upkeep and the daily ledger (`city.systems.economy`); per-building earnings in `tile.earning`. Notable people's inspiration, arrivals and bonuses (`city.systems.notables`). |
| Milestones | `milestones.js`, `advisor.js`, `cityUI.js` | Town titles and permanent unlocks (saved in `city.systems.milestones`); resident thoughts computed from the city every few seconds into `city.derived.thoughts`; the City panel. |
| Glue | `main.js`, `ui.js`, `generator.js`, `newTownUI.js` | Wires systems together, the toolbar (with lock badges) and stats bubble, placement feedback, and new towns (starter town or empty land, sandbox or milestones, three map sizes; the mode is saved in `city.systems.mode`). |

Derived data (labor market, commute routes, congestion, coverage, resident thoughts) lives on tiles and in `city.derived`, is recomputed about once a second, and is never saved.

## Tests

```sh
npm test   # node --test, no dependencies
```

The tests cover the budget (costs, taxes, upkeep, undo refunds, no debt), notable people, the new buildings, share links, trends, colour-blind colours, street names and addresses, the labor market, road reachability, service and play coverage, milestones and unlocks, resident thoughts, save migration, town generation, pausing, and Life Story (aging, events, jobs and homes from the city, bulldozed homes, activities, buying a home, neighbours, achievements and ribbons, the character's walker, whole lives start to finish, saving).

### Extending it

- **New desirability factors** (services, jobs, pollution, …): `FACTORS` in `desirability.js` already lists them as disabled stubs. Implement `compute(city, tile)` and set `enabled: true`.
- **New structures or zones**: add an entry to `STRUCTURES` in `config.js`, a draw routine in `renderer.js`, and a tool in `TOOL_GROUPS`. To gate it behind a milestone, list it in that milestone's `unlocks`.
- **New resident thoughts**: add a rule to `computeThoughts` in `advisor.js` with a priority, text, hint and tile.
- **Larger maps**: `CityState` takes any width/height and has `resize()`; the renderer culls to the visible tiles.
- **New saved data**: store it under `city.systems.<name>`, bump `SAVE_VERSION` and add a `MIGRATIONS[n]` step.

## Credits

Sound effects use a sample generator adapted from [ZzFX](https://github.com/KilledByAPixel/ZzFX) by Frank Force (MIT).

The labor market and traffic model are adapted from [Cimulity](https://github.com/zeikar/cimulity) by zeikar (MIT): residents fill the nearest reachable jobs over the road graph, and commutes load the roads along their routes.
