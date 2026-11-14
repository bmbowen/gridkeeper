# Asset provenance and licensing

GRIDKEEPER ships no downloaded models, textures, images or audio files.

| Asset | Source | License |
| --- | --- | --- |
| 3D models (equipment, buildings, terrain, towers, vehicles) | Procedural geometry written for this project in `src/render/` | Project code |
| Textures (ground noise, windows, chain-link, labels) | Generated at runtime on a canvas in `src/render/` | Project code |
| Particle effects, sky, post-processing setup | Shaders and configuration written for this project | Project code |
| Sound effects and ambience | Synthesized at runtime with the Web Audio API in `src/audio/sound.ts` | Project code |
| Rajdhani (UI typeface) | `@fontsource/rajdhani` (Indian Type Foundry) | SIL Open Font License 1.1 |
| JetBrains Mono (numeric / mono typeface) | `@fontsource/jetbrains-mono` (JetBrains) | SIL Open Font License 1.1 |

## Libraries

| Library | Use | License |
| --- | --- | --- |
| Next.js, React | Application shell | MIT |
| three.js | 3D rendering | MIT |
| @react-three/fiber, @react-three/drei | React renderer and helpers for three.js | MIT |
| @react-three/postprocessing, postprocessing | Bloom and vignette | MIT / Zlib |
| Zustand | Client state | MIT |
| Vitest, Playwright | Tests | MIT / Apache-2.0 |

## Originality

The game's name, visual identity, missions, text, models and code are original to this project. No assets, code, branding or designs were taken from any other game.

## Threat content

Adversaries, techniques and facilities are fictional abstractions for gameplay. Nothing in the project implements real exploitation, real protocols, or communication with real industrial systems.
