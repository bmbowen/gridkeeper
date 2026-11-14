# Status

## Complete and verified

| Area | State |
| --- | --- |
| Simulation engine | Deterministic, fixed 10 Hz timestep, seeded, independent of React. 32 Vitest tests. |
| Level 1 · First Contact | Desert substation at dusk. Guided 13-step tutorial. Played start to finish through the UI by the browser tests. |
| Level 2 · Pressure Drop | Water treatment plant. Adds hardening, segmentation, buffer tanks, demand peaks. |
| Level 3 · Heat Signature | Three-unit power station at night. Adds throttling against thermal margin. |
| Level 4 · Assembly Line | Three-line factory. Adds E-stops, bottlenecks and simultaneous intrusions. |
| Level 5 · Cascading Failure | Regional grid and city. Adds overload cascades, load shedding, coordinated cells, jamming. |
| Endless mode · Long Night | Unlocks after the campaign. Seeded, escalating waves on the Level 5 map. |
| Progression | Mission map, stars (safety / uptime / containment), achievements, 8 persistent upgrades, local save. |
| UX | Briefings, cinematic intros, pause / restart / speed, inspector, actionable alerts, tooltips, results breakdown, settings. |
| Audio | Synthesized effects, ambience and alarm with volume controls. |
| Graphics | Physical and cyber views, bloom, shadows, particles, three quality presets, adaptive quality, performance overlay. |
| Accessibility | Keyboard shortcuts for every action, asset list as an alternative to 3D picking, reduced motion, responsive layout. |
| Tests | 7 Playwright tests against the production build, including every mission loading and simulating without console errors. |

Every mission is checked automatically for three things: its data is consistent, doing nothing loses it, and a scripted defender that only uses player-visible information wins it.

## Verified by automation, not by a human playthrough

- Levels 2–5 are proven winnable by the scripted defender (1–2 stars) and were inspected in screenshots in both views and during incidents. Nobody has hand-played them to three stars, so the difficulty curve is tuned by simulation rather than by feel.
- Frame rate was only measured under software rendering in a headless browser. Performance on real GPUs is untested.
- Audio was written and wired but could not be listened to in the build environment.
- Touch input relies on the standard orbit controls and was not tested on a device.

## Known weak spots

- **Level 4 draw calls** are the highest of any level (about 1,260 at close zoom). Robots and racking are candidates for instancing.
- **Segmentation is strong.** Segmenting the right conduit before going live stops every non-credentialed threat on that path for the whole shift. Credentialed actors and income costs are the counterweight; this may want a further pass.
- **Sensors flag the asset an intruder just left**, which can mark an unsensored neighbour as suspicious. It is consistent, but can surprise.
- **Level 5 framing.** The site is wide, so some assets sit under HUD panels at the home camera until you pan.
- **Level 2 river** is a flat surface above the ground plane rather than a cut channel.
- **Level 5 "Heartbeat" achievement** checks the end state of the Downtown district, not its whole history.
- **Phones.** The layout works at 390 px wide, but the asset list is hidden there and the tutorial's list highlights do not appear.

## Not built

- Real audio assets or music (everything is synthesized).
- Ambient occlusion (bloom and vignette only).
- Replay recording and playback UI (the engine supports it; nothing exposes it).
- Cloud saves, accounts or any backend.
- Localization and key rebinding.
