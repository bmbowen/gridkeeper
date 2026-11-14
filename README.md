# GRIDKEEPER

**Keep the lights on.** A browser-based 3D strategy game about defending industrial control systems.

You run security for substations, water plants, power stations, factories and a regional grid. Each site exists in two connected worlds:

- **Physical world** – stylized 3D facilities with animated machinery, power flow, smoke, weather and lights.
- **Cyber world** – a glowing overlay of the control network: assets, zones, conduits, traffic, sensors and intruders.

Every cyber event has a physical consequence. A hijacked controller opens breakers and a town goes dark; lost cooling cooks a transformer until it smokes and trips.

All threats are fictional and abstract. The game contains no exploit code, no payloads and makes no network connections to anything.

## Run it

Requires Node 20+.

```bash
npm install
npm run dev          # http://localhost:3000
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` | Production build, exported as a static site to `out/` |
| `npm start` | Serve the built `out/` folder on port 3000 |
| `npm run typecheck` | TypeScript check |
| `npm test` | Vitest simulation tests (headless, no browser) |
| `npm run test:e2e` | Playwright browser tests (builds, serves and plays the game) |
| `npx tsx tests/sim/balance.report.ts` | Prints idle vs scripted-defender outcomes for every mission |

## How to play

1. **Prepare.** The clock is stopped. Open the **Cyber view** (TAB) and deploy passive sensors where traffic converges.
2. **Go live.** Income follows production. Intrusions arrive on a schedule hinted at by the timeline.
3. **See.** Monitored links show traffic. A sensor that notices something marks the asset *suspicious* (amber).
4. **Confirm.** *Investigate* with an analyst. A real intrusion turns red and reveals the actor, its route and its target.
5. **Contain.** *Isolate* the asset. The intruder is trapped, but equipment that depends on the asset degrades.
6. **Clean.** *Remediate* to evict the actor. If it still holds an earlier foothold it falls back there.
7. **Restore.** *Reconnect* the asset. Send crews to *restore* tripped equipment and *repair* damage.

Later missions add hardening, network segmentation, operator setpoints (throttle, e-stop, load shedding) and deception tripwires.

### The rules the simulation follows

- **Passive sensors only observe.** They never slow or stop an intruder. Without them you only learn about an attack when equipment misbehaves.
- **Segmentation constrains communication.** A segmented conduit holds ordinary intruders for a while, slows every crossing and logs it as an alert. It buys time and visibility, not immunity, and some conduits cost income while closed.
- **Isolation has an operational cost.** Isolated controllers drop their equipment to local manual; isolated workstations cost income.
- **Defense is limited.** Credits, two analysts and two field crews. You cannot look at everything.

### Controls

| Input | Action |
| --- | --- |
| Left-drag / right-drag / wheel | Orbit / pan / zoom |
| W A S D or arrows, Q / E | Pan, rotate |
| TAB | Toggle physical / cyber view |
| SPACE, 1 / 2 / 3 | Pause, game speed |
| Click | Select an asset, equipment or conduit |
| F | Focus camera on selection |
| V / I / X / R / H | Sensor / investigate / isolate or reconnect / remediate or restore / harden |
| ENTER | Go live |
| ESC | Deselect, pause menu |

Everything is also reachable by mouse or keyboard through the Assets list and the inspector, so the game is playable without 3D picking. Touch works for camera and selection.

### Scoring and progression

A won mission earns up to three stars, one each for **safety**, **uptime** and **containment** (the share of intruders that never achieved an effect). Stars and achievements earn commendations, spent on persistent upgrades (extra analyst, deep packet inspection, auto-reclose relays and more). Progress, upgrades and settings are saved in `localStorage`. Finishing the campaign unlocks **Long Night**, an endless mode with seeded, escalating waves.

## Architecture

```
src/
  sim/        Pure TypeScript simulation. No React, DOM or three.js imports.
    types.ts        Data model: missions, assets, equipment, threats, state, commands
    engine.ts       createGame / step / command — deterministic fixed-timestep engine (10 Hz)
    constants.ts    Costs, timings, threat profiles
    missions/       Data-driven mission definitions (one file per level) + endless generator
    score.ts        Stars, score, achievements
    upgrades.ts     Persistent upgrade definitions → simulation modifiers
    bot.ts          Scripted reference defender that only uses player-visible information
    rng.ts          Seeded PRNG (state lives on the game state)
  state/      Zustand stores
    game.ts         Screen flow, the live GameState, the render-loop driver, event draining
    save.ts         Persistent progress and settings (localStorage)
    fx.ts           Event bus from simulation to effects / audio, shared per-frame view values
  render/     React Three Fiber scene
    GameCanvas.tsx  Canvas, quality presets, post-processing, simulation driver
    Atmosphere.tsx  Per-environment sky, sun, fog; dims the world for the cyber view
    CameraRig.tsx   Orbit / pan / zoom, cinematic intro, keyboard pan, focus moves
    CyberOverlay.tsx  Zones, links, traffic, node markers, sensors, threats and their routes
    Flows.tsx       Conductors / pipes generated from equipment inputs, with live flow pulses
    Fx.tsx          Event bursts, selection rings, equipment call-outs
    nodes.tsx       Physical models for network assets
    equipment/      Procedural equipment models per facility type + registry
    environments/   Scenery per environment + registry
    parts.tsx, materials.ts, util.ts   Shared primitives, PBR palette, helpers
  ui/         HTML HUD and menus (React)
  audio/      Web Audio synthesizer (no sample files)
tests/
  sim/        Vitest: data validation, determinism, defensive realism, win/lose per mission
  e2e/        Playwright: menu → tutorial → win / lose → persistence, 3D picking, settings
```

**Simulation / presentation split.** `step(game, mission)` advances the world by exactly 0.1 s and is the only thing that changes simulation state besides `command(game, mission, cmd)`. The render loop accumulates real time × game speed and calls `step` a whole number of times, then drains `game.events` into the effects bus. 3D components read the mutable state every frame; the HUD re-renders on a ~7 Hz tick. Because the engine is pure and seeded, a mission replays identically from the same seed and command sequence, which is what the tests rely on.

**Adding a mission.** Write a `MissionDef` (zones, nodes, links, equipment in upstream-first order, waves, events, stars, camera) and add it to `CAMPAIGN` in `src/sim/missions/index.ts`. New equipment kinds need a model in `render/equipment/` and an entry in its registry; a new environment needs a scenery component in `render/environments/`. `validateMission` and the per-mission tests check the data and that the mission can be both lost and won.

**Physical model.** Equipment forms a flow graph (`inputs`, `inputMode`). Each unit has availability, heat (`cooledBy`), condition, optional buffer storage and optional overload sharing (`groups`). Production is the weighted output of sink equipment. A compromised controller applies a per-equipment effect: trip, stop, overdrive or erratic.

**Threat model.** Threats are agents following data-defined objectives across the network graph: compromise a node, traverse a link, arm (the telegraph window), then act. Profiles differ in speed, stealth, credentials and behaviour (opportunistic retargeting, sensor blinding, coordinated strikes that stage and fire together).

## Graphics and performance

- Three quality presets (Settings → Graphics). **Low** disables shadows, bloom and antialiasing and halves particles. **Adaptive quality** steps down automatically if the frame rate drops.
- Repeated scenery is instanced; materials come from one shared PBR palette; one shadow-casting light per scene.
- A performance overlay (Settings → Performance overlay) shows FPS, draw calls and triangles.
- **Reduced motion** skips cinematic camera moves and UI animation, and is also honoured from the OS setting.

## Deploy

`npm run build` produces a fully static site in `out/`. Host that folder anywhere:

- **Vercel / Netlify / Cloudflare Pages** – import the repo; build command `npm run build`, output directory `out`.
- **GitHub Pages or a sub-path** – set `basePath` in `next.config.ts` to the sub-path first.
- **Any static server** – `npx serve out`.

There is no backend and no environment variables.

## Assets and licensing

See [docs/ASSETS.md](docs/ASSETS.md). All 3D models, textures and sounds are generated procedurally in code written for this project. The only third-party assets are two open-source fonts.

## Status

See [docs/STATUS.md](docs/STATUS.md) for what is complete and what is not.
