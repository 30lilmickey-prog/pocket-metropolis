# Pocket Metropolis

A relaxing isometric tiny-city builder. You plan the city; residents decide for themselves where to live, work and stroll.

**What's in it**

- A 32×32 map: a starter town in the middle, with a river, woods and room to grow
- Homes (house, tower), workplaces (shop, office), services (school, clinic), nature (tree, park, water) and roads
- Residents move into the most desirable homes. Desirability comes from parks and trees, water views, road access, school and clinic coverage, jobs, and traffic
- A labor market matches workers to the nearest jobs they can reach by road. Commutes load the roads they use, and cars follow those routes at morning and evening rush hour
- Inspect any tile to see its residents or jobs and a breakdown of its desirability
- Map views for desirability, traffic and services; pause and 1×–3× speed
- A slow day/night cycle with lit windows, street lights and headlights
- Seasons (two in-game days each) and weather: rain with umbrellas and ripples, winter snow, morning fog
- Homes grow as people move in, towers and offices add floors as they fill, and roofs vary from house to house
- Gentle synthesised sound effects and ambience (birds by day, crickets at night, rain), with a mute switch
- Drag to build lines of road or paint trees, water and buildings; undo and redo every edit
- Autosave with versioned saves; older 12×12 towns open centred on the larger map
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

Events are plain data in `src/lifeEvents.js`; see the comment at the top of that file to add more.

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
| Pick a tool | 1 House · 2 Tower · 3 Shop · 4 Office · 5 School · 6 Clinic · 7 Tree · 8 Park · 9 Road · 0 Water | Toolbar; buttons with a dot open more choices |
| Pause / change speed | Space, or the speed button | ☰ City controls |
| Switch map view | V, or the layers button | ☰ City controls |
| Recenter | Recenter button (press again for the whole map) | ☰ City controls |
| Random Town | Random Town button | ☰ City controls (tap twice to confirm) |

## Architecture

Each system lives in its own module under `src/` and talks to the others only through the city state and its events.

| System | Files | Responsibility |
| --- | --- | --- |
| City State | `state.js`, `config.js` | Tiles (terrain, structure, residents, road links), clock, stats, `systems` slot for future modules. Emits `placed` / `removed` / `watered` / `movedIn` / `reset` events. |
| Life Story | `life.js`, `lifeEngine.js`, `lifeEvents.js`, `lifeData.js`, `lifeUI.js` | One resident's life: aging, yearly stats, home and job tied to real tiles, the event engine and content, and the panel and event card. Saved in `city.systems.life`. |
| Simulation | `simulation.js`, `desirability.js`, `labor.js`, `coverage.js`, `agents.js`, `time.js` | Fixed-step ticks: time of day, service coverage, the labor market and road congestion, desirability, residents moving in and out, stats. Agents (commuters, cruising cars, pedestrians) read the city and move through it. |
| Renderer | `renderer.js`, `lighting.js`, `color.js`, `iso.js` | Reads state and draws the diorama. The ground layer is cached offscreen and redrawn only when the map changes; buildings and agents are depth-sorted and drawn each frame for on-screen tiles only. Also draws the data overlays. |
| Input/Camera | `input.js`, `camera.js` | Pointer, wheel and pinch gestures; smooth pan and zoom; fitting to the screen. |
| Persistence | `persistence.js` | Versioned localStorage saves with a migration table; autosave. |
| Weather | `weather.js` | Seasons from the day count; weather spells with seasonal odds; smoothed rain, snow, fog and snow cover for the renderer and agents. |
| Audio | `audio.js` | Synthesised effects (ZzFX-based) and ambience through one master volume. |
| History | `history.js` | Undo and redo of tile edits, plus the L-shaped road and brush stroke paths. |
| Glue | `main.js`, `ui.js`, `generator.js` | Wires systems together, the toolbar and stats bubble, Random Town. |

Derived data (labor market, commute routes, congestion, coverage) lives on tiles and in `city.derived`, is recomputed about once a second, and is never saved.

## Tests

```sh
npm test   # node --test, no dependencies
```

The tests cover the labor market, road reachability, service coverage, save migration, town generation, pausing, and Life Story (aging, events, jobs and homes from the city, bulldozed homes, whole lives start to finish, saving).

### Extending it

- **New desirability factors** (services, jobs, pollution, …): `FACTORS` in `desirability.js` already lists them as disabled stubs. Implement `compute(city, tile)` and set `enabled: true`.
- **New structures or zones**: add an entry to `STRUCTURES` in `config.js`, a draw routine in `renderer.js`, and a tool in `TOOLS`.
- **Larger maps**: `CityState` takes any width/height and has `resize()`; the renderer culls to the visible tiles.
- **New saved data**: store it under `city.systems.<name>`, bump `SAVE_VERSION` and add a `MIGRATIONS[n]` step.

## Credits

Sound effects use a sample generator adapted from [ZzFX](https://github.com/KilledByAPixel/ZzFX) by Frank Force (MIT).

The labor market and traffic model are adapted from [Cimulity](https://github.com/zeikar/cimulity) by zeikar (MIT): residents fill the nearest reachable jobs over the road graph, and commutes load the roads along their routes.
