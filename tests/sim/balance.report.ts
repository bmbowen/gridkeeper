// Run with: npx tsx tests/sim/balance.report.ts  (prints bot + idle outcomes per mission)
import { botStep } from "../../src/sim/bot";
import { command, createGame, step } from "../../src/sim/engine";
import { CAMPAIGN } from "../../src/sim/missions";
import { summarize } from "../../src/sim/score";

for (const m of CAMPAIGN) {
  for (const mode of ["idle", "bot", "skill"] as const) {
    const g = createGame(m);
    if (mode === "idle") command(g, m, { type: "start" });
    for (let i = 0; i < 20000 && (g.phase === "prep" || g.phase === "running"); i++) {
      if (mode !== "idle") botStep(g, m, { skilled: mode === "skill" });
      step(g, m);
    }
    const r = summarize(g, m);
    console.log(`${m.id.padEnd(18)} ${mode.padEnd(5)} ${g.phase.padEnd(5)} t=${g.time.toFixed(0).padStart(4)} stars=${r.stars} safety=${r.safety.toFixed(0)} uptime=${r.uptime.toFixed(0)} contain=${r.containment.toFixed(0)} credits=${g.credits.toFixed(0)} trips=${g.stats.trips} fires=${g.stats.fires} ${g.loseReason}`);
  }
}
