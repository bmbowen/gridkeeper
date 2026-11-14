import type { GameState, MissionDef, MissionResult } from "./types";

export function uptimePct(g: GameState): number {
  return g.samples > 0 ? (g.productionAcc / g.samples) * 100 : 100;
}

export function containmentPct(g: GameState): number {
  const total = g.stats.threatsSpawned;
  return total > 0 ? ((total - g.stats.threatsActed) / total) * 100 : 100;
}

export function summarize(g: GameState, m: MissionDef): MissionResult {
  const won = g.phase === "won";
  const safety = g.safety;
  const uptime = uptimePct(g);
  const containment = containmentPct(g);
  const starSafety = won && safety >= m.stars.safety;
  const starUptime = won && uptime >= m.stars.uptime;
  const starContainment = won && containment >= m.stars.containment;
  const stars = won ? Math.max(1, Number(starSafety) + Number(starUptime) + Number(starContainment)) : 0;
  const score = m.endless
    ? Math.round(g.time * 10 + g.stats.threatsEliminated * 150)
    : Math.round((won ? 1000 : 0) + safety * 10 + uptime * 10 + containment * 10 + Math.min(600, g.credits) * 0.5);
  const result: MissionResult = {
    won,
    stars,
    starSafety,
    starUptime,
    starContainment,
    safety,
    uptime,
    containment,
    score,
    time: g.time,
    achievements: [],
    loseReason: g.loseReason,
  };
  if (won || m.endless) {
    result.achievements = m.achievements.filter((a) => a.test(g, result)).map((a) => a.id);
  }
  return result;
}
