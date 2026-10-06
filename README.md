# Pocket Metropolis

A relaxing isometric tiny-city builder. You plan the city; residents decide for themselves where to live and stroll.

Open `index.html` through any static server (ES modules need one, e.g. `npx serve .`), or build the single-file version:

```sh
node build.mjs   # writes dist/pocket-metropolis.html
```

## Deploy to Vercel

`vercel.json` runs `node build.mjs` and serves `dist/` (no dependencies to install).

1. In Vercel, choose **Add New → Project** and import this GitHub repository.
2. Set **Root Directory** to `pocket-metropolis`. Leave the framework preset as **Other**.
3. Deploy. Every push to the production branch redeploys automatically.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Build selected item | Click | Tap |
| Bulldoze | Right-click (or Bulldoze tool) | Long-press (or Bulldoze tool) |
| Pan | Drag | Drag |
| Zoom | Mouse wheel | Pinch |
| Pick a tool | Keys 1–7 | Toolbar |

## Architecture

Each system lives in its own module under `src/` and talks to the others only through the city state and its events.

| System | Files | Responsibility |
| --- | --- | --- |
| City State | `state.js`, `config.js` | Tiles (terrain, structure, residents, road links), clock, stats, `systems` slot for future modules. Emits `placed` / `removed` / `watered` / `movedIn` / `reset` events. |
| Simulation | `simulation.js`, `desirability.js`, `agents.js`, `time.js` | Fixed-step ticks: time of day, desirability, residents moving in and out, stats. Agents (cars, pedestrians) read the city and wander it. |
| Renderer | `renderer.js`, `lighting.js`, `color.js`, `iso.js` | Reads state and draws the diorama: terrain, depth-sorted buildings and agents, day/night lighting, shadows, effects. Only draws tiles on screen. |
| Input/Camera | `input.js`, `camera.js` | Pointer, wheel and pinch gestures; smooth pan and zoom; fitting to the screen. |
| Persistence | `persistence.js` | Versioned localStorage saves with a migration table; autosave. |
| Glue | `main.js`, `ui.js`, `generator.js` | Wires systems together, the toolbar and stats bubble, Random Town. |

### Extending it

- **New desirability factors** (services, jobs, pollution, …): `FACTORS` in `desirability.js` already lists them as disabled stubs. Implement `compute(city, tile)` and set `enabled: true`.
- **New structures or zones**: add an entry to `STRUCTURES` in `config.js`, a draw routine in `renderer.js`, and a tool in `TOOLS`.
- **Larger maps**: `CityState` takes any width/height and has `resize()`; the renderer culls to the visible tiles.
- **New saved data**: store it under `city.systems.<name>`, bump `SAVE_VERSION` and add a `MIGRATIONS[n]` step.
