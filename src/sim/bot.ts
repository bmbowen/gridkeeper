import { COSTS } from "./constants";
import { command, commandBlocked, cost } from "./engine";
import type { Command, GameState, MissionDef } from "./types";

/**
 * A simple scripted defender that only uses information the player can see.
 * Used by tests to prove every mission is winnable, and to balance waves.
 */
export function botStep(g: GameState, m: MissionDef): void {
  const tryCmd = (c: Command) => (commandBlocked(g, m, c) ? false : command(g, m, c).ok);

  if (g.phase === "prep") {
    // Sensors on switches first (best coverage), then entry points, then engineering stations.
    const order = [...m.nodes].sort((a, b) => rank(a.kind) - rank(b.kind));
    for (const n of order) {
      if (g.credits < cost(g, "sensor") + (m.tools.includes("remediate") ? COSTS.remediate : 0)) break;
      if (rank(n.kind) > 2) break;
      tryCmd({ type: "sensor", node: n.id });
    }
    tryCmd({ type: "start" });
    return;
  }
  if (g.phase !== "running") return;

  for (const n of m.nodes) {
    const s = g.nodes[n.id];
    if (s.knowledge === "suspicious") tryCmd({ type: "investigate", node: n.id });
    if (s.knowledge === "confirmed") {
      if (!s.isolated) tryCmd({ type: "isolate", node: n.id });
      tryCmd({ type: "remediate", node: n.id });
    }
    if (s.isolated && s.knowledge === "none" && !s.compromised) tryCmd({ type: "reconnect", node: n.id });
  }
  for (const e of m.equipment) {
    const s = g.equipment[e.id];
    if (s.tripped && s.condition > 0) tryCmd({ type: "restore", equip: e.id });
    if (s.condition < 50) tryCmd({ type: "repair", equip: e.id });
    if (e.setpoints && m.tools.includes("setpoint")) {
      // Back off anything running hot or feeding an overloaded group; return to full when calm.
      const groups = (m.groups ?? []).filter((grp) => grp.demandFrom.includes(e.id));
      const overloaded = groups.some((grp) => grp.members.some((id) => !g.equipment[id].tripped && g.equipment[id].load > (grp.limit ?? 1.12)));
      const low = e.setpoints.filter((v) => v > 0 && v < 1).sort((x, y) => y - x)[0];
      if ((s.heat > 0.6 || overloaded) && s.setpoint === 1 && low !== undefined) tryCmd({ type: "setpoint", equip: e.id, value: low });
      else if (s.setpoint < 1 && s.heat < 0.3) {
        const safe = groups.every((grp) => {
          const now = grp.demandFrom.reduce((acc, id) => acc + g.equipment[id].setpoint, 0);
          const full = now - s.setpoint + 1;
          const load = Math.max(...grp.members.map((id) => g.equipment[id].load));
          return load * (full / Math.max(0.05, now)) <= (grp.limit ?? 1.12) * 0.97;
        });
        if (safe) tryCmd({ type: "setpoint", equip: e.id, value: 1 });
      }
    }
  }
  // Spend spare credits on more sensors, keeping a remediation reserve.
  if (g.tick % 20 === 0 && g.credits > cost(g, "sensor") + COSTS.remediate * 2) {
    const next = [...m.nodes].sort((a, b) => rank(a.kind) - rank(b.kind)).find((n) => !g.nodes[n.id].sensor);
    if (next) tryCmd({ type: "sensor", node: next.id });
  }
}

function rank(kind: string): number {
  switch (kind) {
    case "switch":
      return 0;
    case "firewall":
      return 1;
    case "gateway":
      return 2;
    case "ews":
      return 3;
    case "plc":
    case "rtu":
      return 4;
    default:
      return 5;
  }
}
