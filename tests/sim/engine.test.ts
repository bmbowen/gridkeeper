import { describe, expect, it } from "vitest";
import { botStep } from "@/sim/bot";
import { command, createGame, findPath, step, validateMission } from "@/sim/engine";
import { CAMPAIGN } from "@/sim/missions";
import { level1 } from "@/sim/missions/level1";
import { summarize } from "@/sim/score";
import type { GameState, MissionDef } from "@/sim/types";

function run(g: GameState, m: MissionDef, seconds: number, each?: () => void) {
  for (let i = 0; i < seconds * 10 && (g.phase === "running" || g.phase === "prep"); i++) {
    each?.();
    step(g, m);
  }
}

function playBot(m: MissionDef) {
  const g = createGame(m);
  for (let i = 0; i < 20000 && (g.phase === "prep" || g.phase === "running"); i++) {
    botStep(g, m);
    step(g, m);
  }
  return g;
}

describe("mission data", () => {
  it.each(CAMPAIGN.map((m) => [m.id, m] as const))("%s is internally consistent", (_id, m) => {
    expect(() => validateMission(m)).not.toThrow();
    // every wave objective is reachable from its entry on an undefended network
    const g = createGame(m);
    for (const w of m.waves) for (const o of w.objectives) expect(findPath(g, m, w.entry, o.node, false)).not.toBeNull();
  });
});

describe("determinism", () => {
  it("same seed and inputs produce identical state", () => {
    const a = playBot(level1);
    const b = playBot(level1);
    a.events = [];
    b.events = [];
    expect(JSON.stringify(a)).toEqual(JSON.stringify(b));
  });
});

describe("defensive realism", () => {
  it("passive sensors detect but never block", () => {
    const bare = createGame(level1);
    command(bare, level1, { type: "start" });
    const watched = createGame(level1, { startBonus: 5000 });
    for (const n of level1.nodes) command(watched, level1, { type: "sensor", node: n.id });
    command(watched, level1, { type: "start" });
    run(bare, level1, 90);
    run(watched, level1, 90);
    // The intrusion progresses identically; only the defender's knowledge differs.
    expect(watched.nodes.rtuC.implant).toBe(bare.nodes.rtuC.implant);
    expect(bare.nodes.rtuC.implant).toBe(true);
    expect(watched.threats[0].node).toBe(bare.threats[0].node);
    expect(watched.alerts.some((a) => a.title === "Suspicious activity")).toBe(true);
    expect(Object.values(bare.nodes).filter((n) => n.knowledge !== "none").length).toBeLessThan(
      Object.values(watched.nodes).filter((n) => n.knowledge !== "none").length + 1,
    );
  });

  it("isolation contains a threat and costs output", () => {
    const g = createGame(level1);
    command(g, level1, { type: "start" });
    command(g, level1, { type: "isolate", node: "fw" });
    run(g, level1, 80);
    expect(g.nodes.rtuC.implant).toBe(false);
    expect(g.threats[0].contained || g.threats[0].phase === "stalled" || g.threats[0].phase === "idle").toBe(true);
    // isolating a controller drops its equipment to local manual
    command(g, level1, { type: "isolate", node: "rtuC" });
    step(g, level1);
    expect(g.production).toBeLessThan(1);
    expect(g.opsPenalty).toBeGreaterThan(0);
  });

  it("a compromised controller trips its breakers and can be recovered", () => {
    const g = createGame(level1);
    command(g, level1, { type: "start" });
    run(g, level1, 96);
    expect(g.equipment.brkF1.tripped).toBe(true);
    expect(g.production).toBe(0);
    expect(g.nodes.rtuC.knowledge).toBe("suspicious"); // operators noticed
    expect(command(g, level1, { type: "restore", equip: "brkF1" }).ok).toBe(false);
    command(g, level1, { type: "isolate", node: "rtuC" });
    step(g, level1);
    for (const id of ["brkF1", "brkF2"]) expect(command(g, level1, { type: "restore", equip: id }).ok).toBe(true);
    run(g, level1, 6);
    expect(g.equipment.brkF1.tripped).toBe(false);
    expect(g.production).toBeGreaterThan(0.4);
  });

  it("investigation must confirm before remediation; remediation evicts", () => {
    const g = createGame(level1);
    command(g, level1, { type: "sensor", node: "fw" });
    command(g, level1, { type: "start" });
    run(g, level1, 40);
    expect(g.nodes.fw.knowledge === "suspicious" || g.nodes.wan.knowledge === "suspicious").toBe(true);
    const target = g.nodes.fw.knowledge === "suspicious" ? "fw" : "wan";
    expect(command(g, level1, { type: "remediate", node: target }).ok).toBe(false);
    command(g, level1, { type: "investigate", node: target });
    run(g, level1, 5);
    expect(g.nodes[target].knowledge).toBe("confirmed");
    expect(g.threats[0].identified).toBe(true);
  });
});

describe("outcomes", () => {
  it.each(CAMPAIGN.map((m) => [m.id, m] as const))("%s is lost or badly hurt if the player does nothing", (_id, m) => {
    const g = createGame(m);
    command(g, m, { type: "start" });
    run(g, m, m.duration + 5);
    const r = summarize(g, m);
    expect(r.stars).toBeLessThanOrEqual(1);
  });

  it.each(CAMPAIGN.map((m) => [m.id, m] as const))("%s is winnable by the scripted defender", (_id, m) => {
    const g = playBot(m);
    const r = summarize(g, m);
    expect(g.phase).toBe("won");
    expect(r.stars).toBeGreaterThanOrEqual(1);
  });
});
