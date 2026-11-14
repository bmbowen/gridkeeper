# Status

## Complete and verified

| Area | State |
| --- | --- |
| Simulation engine | Deterministic, fixed 10 Hz timestep, seeded, independent of React. 38 Vitest tests. |
| Level 1 · First Contact | Desert substation at dusk. Guided 13-step tutorial. Played start to finish through the UI by the browser tests. |
| Level 2 · Pressure Drop | Water treatment plant. Adds hardening, segmentation, buffer tanks, demand peaks. |
| Level 3 · Heat Signature | Three-unit power station at night. Adds throttling against thermal margin. |
| Level 4 · Assembly Line | Three-line factory. Adds E-stops, bottlenecks and simultaneous intrusions. |
| Level 5 · Cascading Failure | Regional grid and city. Adds overload cascades, load shedding, coordinated cells, jamming. |
| Endless mode · Long Night | Unlocks after the campaign. Seeded, escalating waves on the Level 5 map. |
| Progression | Mission map, stars (safety / uptime / containment), achievements, 8 persistent upgrades, local save. |
| UX | Briefings, cinematic intros, pause / restart / speed, inspector, actionable alerts, tooltips, results breakdown, settings. |
| Audio | Synthesized effects, ambience, alarm, and a generative score whose tension follows the situation. Volume controls. |
| Graphics | Physical and cyber views, bloom, shadows, particles, ambient occlusion on High, three quality presets, adaptive quality, performance overlay. |
| Game feel | Camera shake on trips and fires, red screen pulse while equipment is hijacked, cyber-view scan transition, spend floaters, event bursts, equipment call-outs. |
| Accessibility | Keyboard shortcuts for every action, asset list as an alternative to 3D picking, reduced motion, responsive layout. |
| Tests | 7 Playwright tests against the production build, including every mission loading and simulating without console errors. |

Every mission is checked automatically for four things: its data is consistent, doing nothing loses it, a basic scripted defender wins it, and a skilled scripted defender (segments, hardens, E-stops) earns three stars. Both defenders only use player-visible information.

## Verified by automation, not by a human playthrough

- Levels 2–5 have not been hand-played. Difficulty is calibrated with scripted defenders that only use player-visible information, at three speeds:
  - **Instant reactions:** three stars on every level.
  - **One action every 2 s:** three stars on every level.
  - **One action every 4 s:** one star on Level 1, three on Levels 2 and 3, and a loss on Levels 4 and 5.

  So the campaign is forgiving for a quick or pause-happy player and punishing late on for a slow one. Whether that curve feels right to a person is untested, and Levels 2 and 3 may be too easy.
- Frame rate was only measured under software rendering in a headless browser. Performance on real GPUs is untested.
- Audio, including the score, was written and wired but could not be listened to in the build environment. Mix levels are a first guess.
- Touch input relies on the standard orbit controls and was not tested on a device.

## Known weak spots

- **Level 4 draw calls** are the highest of any level (about 1,260 at close zoom). Robots and racking are candidates for instancing.
- **Segmentation** holds an ordinary intruder for about 20 s, then it tunnels through slowly and raises an alert. With instant reactions that alert is always enough to catch it; whether it feels fair to a human is untested.
- **Level 5 framing.** The site is wide, so some assets sit under HUD panels at the home camera until you pan.
- **Level 2 river** is a flat surface above the ground plane rather than a cut channel.
- **Level 5 "Heartbeat" achievement** checks the end state of the Downtown district, not its whole history.
- **Phones.** The layout works at 390 px wide with the asset list in a drawer, but it has not been tried on a real device.

## Not built

- Recorded audio or composed music (everything is synthesized).
- Replay recording and playback UI (the engine supports it; nothing exposes it).
- Cloud saves, accounts or any backend.
- Localization and key rebinding.
