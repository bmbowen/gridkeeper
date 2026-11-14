import { COSTS, CONTROLLER_KINDS, DEFAULT_EFFECT } from "./constants";
import { command, commandBlocked, cost } from "./engine";
import type { Command, GameState, MissionDef } from "./types";

/**
 * A simple scripted defender that only uses information the player can see.
 * Used by tests to prove every mission is winnable, and to balance waves.
 */
export function botStep(g: GameState, m: MissionDef, opts: { skilled?: boolean } = {}): void {
  const tryCmd = (c: Command) => (commandBlocked(g, m, c) ? false : command(g, m, c).ok);
  const has = (t: string) => (m.tools as string[]).includes(t);

  if (g.phase === "prep") {
    if (opts.skilled && has("segment")) {
      // An attentive player closes the cheap perimeter conduits before going live.
      const entries = new Set(m.nodes.filter((n) => n.entry).map((n) => n.id));
      for (const l of m.links) {
        if (!l.conduit || (l.opsCost ?? 0) > 0.08 || !(entries.has(l.a) || entries.has(l.b))) continue;
        if (g.credits < cost(g, "segment") + cost(g, "sensor") * 2 + COSTS.remediate) break;
        tryCmd({ type: "segment", link: l.id });
      }
    }
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
  if (opts.skilled) {
    // E-stop anything that has gone erratic; release it once its controller is clean.
    for (const e of m.equipment) {
      const s = g.equipment[e.id];
      if (!e.setpoints?.includes(0) || !has("setpoint")) continue;
      const erratic = s.manip && (e.manipEffect ?? DEFAULT_EFFECT[e.kind]) === "erratic";
      if (erratic && s.setpoint > 0) tryCmd({ type: "setpoint", equip: e.id, value: 0 });
      else if (!s.manip && s.setpoint === 0) tryCmd({ type: "setpoint", equip: e.id, value: 1 });
    }
    // Harden controllers with spare credits.
    if (has("harden") && g.tick % 20 === 10 && g.credits > cost(g, "harden") + COSTS.remediate * 2) {
      const next = m.nodes.find((n) => CONTROLLER_KINDS.includes(n.kind) && !g.nodes[n.id].hardened && !g.nodes[n.id].compromised);
      if (next) tryCmd({ type: "harden", node: next.id });
    }
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
      else if (s.setpoint < 1 && s.heat < 0.3 && !s.manip) {
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
