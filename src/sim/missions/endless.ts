import type { MissionDef } from "../types";

const cache = new WeakMap<MissionDef, MissionDef>();

/** Endless survival: the base mission's site with procedurally generated, escalating waves. */
export function makeEndless(base: MissionDef): MissionDef {
  let m = cache.get(base);
  if (m) return m;
  m = {
    ...base,
    id: "endless",
    index: 99,
    name: "Long Night",
    tagline: "No shift change is coming. How long can you hold?",
    teaches: "Endless survival",
    briefing: [
      "Every adversary you have met is active at once, and they are not going home.",
      "Waves are generated from a fresh seed each run and escalate every minute. There is no victory condition. Your score is how long the lights stay on.",
    ],
    objectives: ["Survive as long as possible", "Eliminate threats for bonus score"],
    duration: Infinity,
    endless: true,
    tutorial: false,
    waves: [],
    events: [],
    startCredits: base.startCredits + 150,
    tools: ["sensor", "investigate", "isolate", "remediate", "harden", "segment", "setpoint", "honeypot"],
    achievements: [
      { id: "endless-5", name: "Graveyard Shift", desc: "Survive 5 minutes of the Long Night.", test: (g) => g.time >= 300 },
      { id: "endless-10", name: "Sunrise", desc: "Survive 10 minutes of the Long Night.", test: (g) => g.time >= 600 },
    ],
  };
  cache.set(base, m);
  return m;
}
