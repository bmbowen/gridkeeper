import { describe, expect, it } from "vitest";
import { command, createGame, step, validateMission } from "@/sim/engine";
import { makeEndless } from "@/sim/missions/endless";
import type { GameState, MissionDef, WaveDef } from "@/sim/types";

/** Small synthetic site that exercises every mechanic independently of campaign balance. */
function fixture(waves: WaveDef[], over: Partial<MissionDef> = {}): MissionDef {
  const m: MissionDef = {
    id: "fixture",
    index: 0,
    name: "Fixture",
    tagline: "",
    location: "",
    environment: "desert",
    briefing: [],
    objectives: [],
    teaches: "",
    seed: 7,
    startCredits: 2000,
    incomeRate: 1,
    duration: 400,
    unit: "MW",
    nominal: 100,
    zones: [
      { id: "ext", name: "Ext", tag: "", color: "#f00", rect: [0, 0, 1, 1] },
      { id: "ot", name: "OT", tag: "", color: "#0f0", rect: [0, 0, 1, 1] },
    ],
    nodes: [
      { id: "gw", name: "GW", kind: "gateway", zone: "ext", pos: [0, 0, 0], entry: true, desc: "" },
      { id: "gw2", name: "GW2", kind: "gateway", zone: "ext", pos: [0, 0, 0], entry: true, desc: "" },
      { id: "sw", name: "SW", kind: "switch", zone: "ot", pos: [0, 0, 0], desc: "" },
      { id: "plcA", name: "PLC A", kind: "plc", zone: "ot", pos: [0, 0, 0], desc: "" },
      { id: "plcB", name: "PLC B", kind: "plc", zone: "ot", pos: [0, 0, 0], desc: "" },
    ],
    links: [
      { id: "gw-sw", a: "gw", b: "sw", conduit: true, opsCost: 0.2 },
      { id: "gw2-sw", a: "gw2", b: "sw", conduit: true },
      { id: "sw-a", a: "sw", b: "plcA" },
      { id: "sw-b", a: "sw", b: "plcB" },
    ],
    equipment: [
      { id: "src", name: "Source", kind: "source", pos: [0, 0, 0] },
      { id: "fan", name: "Fan", kind: "fan", pos: [0, 0, 0], controller: "plcA" },
      { id: "tx", name: "Transformer", kind: "transformer", pos: [0, 0, 0], inputs: ["src"], cooledBy: ["fan"], heatRate: 0.1 },
      { id: "l1", name: "Line 1", kind: "line", pos: [0, 0, 0], inputs: ["tx"], controller: "plcB" },
      { id: "l2", name: "Line 2", kind: "line", pos: [0, 0, 0], inputs: ["tx"] },
      { id: "l3", name: "Line 3", kind: "line", pos: [0, 0, 0], inputs: ["tx"] },
      { id: "tank", name: "Tank", kind: "tank", pos: [0, 0, 0], inputs: ["tx"], buffer: { seconds: 20, initial: 1 } },
      { id: "city", name: "City", kind: "district", pos: [0, 0, 0], inputs: ["l1", "l2", "l3"], inputMode: "sum", need: 2.4, sinkWeight: 1, setpoints: [0.5, 1], setpointLabel: "Shed" },
      { id: "town", name: "Town", kind: "district", pos: [0, 0, 0], inputs: ["tank"], sinkWeight: 1 },
    ],
    groups: [{ id: "corridor", name: "Corridor", members: ["l1", "l2", "l3"], demandFrom: ["city"], demand: 2.4, limit: 1.1, tripAfter: 5 }],
    waves,
    tools: ["sensor", "investigate", "isolate", "remediate", "harden", "segment", "setpoint", "honeypot"],
    lose: { productionBelow: 0.05, seconds: 999 },
    stars: { safety: 90, uptime: 90, containment: 90 },
    achievements: [],
    camera: { target: [0, 0, 0], home: [1, 1, 1], intro: [[1, 1, 1], [2, 2, 2]] },
    map: [0, 0],
    ...over,
  };
  validateMission(m);
  return m;
}

function run(g: GameState, m: MissionDef, seconds: number) {
  for (let i = 0; i < seconds * 10; i++) step(g, m);
}
const start = (m: MissionDef, mods = {}) => {
  const g = createGame(m, mods);
  return g;
};

describe("segmentation", () => {
  const wave = (profile: WaveDef["profile"]): WaveDef[] => [{ at: 1, profile, entry: "gw", objectives: [{ node: "plcA", action: "manipulate" }] }];

  it("stops an ordinary intruder at a segmented conduit", () => {
    const m = fixture(wave("intruder"));
    const g = start(m);
    command(g, m, { type: "segment", link: "gw-sw" });
    command(g, m, { type: "start" });
    run(g, m, 120);
    expect(g.nodes.sw.compromised).toBe(false);
    expect(g.nodes.plcA.implant).toBe(false);
    expect(g.opsPenalty).toBeCloseTo(0.2);
  });

  it("only slows a credentialed actor, and logs the crossing", () => {
    const m = fixture(wave("engineer"));
    const open = start(m);
    command(open, m, { type: "start" });
    const seg = start(m);
    command(seg, m, { type: "segment", link: "gw-sw" });
    command(seg, m, { type: "start" });
    const reach = (g: GameState) => {
      for (let i = 0; i < 3000; i++) {
        step(g, m);
        if (g.nodes.sw.compromised) return g.time;
      }
      return Infinity;
    };
    const tOpen = reach(open);
    const tSeg = reach(seg);
    expect(tSeg).toBeGreaterThan(tOpen + 5);
    expect(tSeg).toBeLessThan(Infinity);
    expect(seg.alerts.some((a) => a.title === "Firewall policy alert")).toBe(true);
  });
});

describe("hardening, tripwires and eviction", () => {
  const waves: WaveDef[] = [{ at: 1, profile: "intruder", entry: "gw", objectives: [{ node: "plcA", action: "manipulate" }] }];

  it("hardened assets take longer to compromise", () => {
    const m = fixture(waves);
    const time = (harden: boolean) => {
      const g = start(m);
      if (harden) command(g, m, { type: "harden", node: "sw" });
      command(g, m, { type: "start" });
      for (let i = 0; i < 3000; i++) {
        step(g, m);
        if (g.nodes.sw.compromised) return g.time;
      }
      return Infinity;
    };
    expect(time(true)).toBeGreaterThan(time(false) + 5);
  });

  it("a tripwire identifies and stalls the actor without a sensor", () => {
    const m = fixture(waves);
    const g = start(m, { honeypot: true });
    expect(command(g, m, { type: "honeypot", node: "sw" }).ok).toBe(true);
    command(g, m, { type: "start" });
    run(g, m, 25);
    expect(g.threats[0].identified).toBe(true);
    expect(g.nodes.sw.knowledge).toBe("confirmed");
    expect(g.nodes.plcA.compromised).toBe(false);
  });

  it("an evicted actor falls back to a live foothold, and dies when none remain", () => {
    const m = fixture(waves);
    const g = start(m);
    for (const n of ["gw", "sw"]) command(g, m, { type: "sensor", node: n });
    command(g, m, { type: "start" });
    for (let i = 0; i < 3000 && !g.nodes.sw.compromised; i++) step(g, m);
    command(g, m, { type: "isolate", node: "sw" }); // trap it before it moves on
    command(g, m, { type: "investigate", node: "sw" });
    run(g, m, 4.5);
    expect(g.nodes.sw.knowledge).toBe("confirmed");
    expect(g.threats[0].contained).toBe(true);
    command(g, m, { type: "remediate", node: "sw" });
    run(g, m, 5);
    const t = g.threats[0];
    expect(t.phase).not.toBe("dead");
    expect(t.node).toBe("gw"); // fell back to the gateway foothold
    expect(g.nodes.gw.knowledge).toBe("confirmed");
    command(g, m, { type: "isolate", node: "gw" });
    command(g, m, { type: "remediate", node: "gw" });
    run(g, m, 6);
    expect(t.phase).toBe("dead");
    expect(g.stats.threatsEliminated).toBe(1);
  });
});

describe("physical consequences", () => {
  it("losing cooling overheats, damages and trips the unit; isolation restores cooling", () => {
    const m = fixture([{ at: 1, profile: "saboteur", entry: "gw", objectives: [{ node: "plcA", action: "manipulate" }] }]);
    const g = start(m);
    command(g, m, { type: "start" });
    run(g, m, 60);
    expect(g.equipment.fan.out).toBe(0);
    expect(g.equipment.tx.tripped).toBe(true);
    expect(g.stats.fires).toBe(1);
    expect(g.safety).toBeLessThan(100);
    expect(g.equipment.tx.condition).toBeLessThan(100);

    const h = start(m);
    command(h, m, { type: "start" });
    for (let i = 0; i < 3000 && !h.nodes.plcA.implant; i++) step(h, m);
    command(h, m, { type: "isolate", node: "plcA" });
    run(h, m, 60);
    expect(h.equipment.fan.out).toBeGreaterThan(0.5);
    expect(h.equipment.tx.tripped).toBe(false);
  });

  it("a buffer tank rides through an upstream loss for a while", () => {
    const m = fixture([], { events: [{ at: 1, type: "fault", equip: "tx" }] });
    const g = start(m);
    command(g, m, { type: "start" });
    run(g, m, 10);
    expect(g.equipment.tx.tripped).toBe(true);
    expect(g.equipment.town.out).toBe(1); // still served from storage
    run(g, m, 20);
    expect(g.equipment.town.out).toBe(0); // tank ran dry
  });

  it("losing a shared line overloads the rest and cascades unless load is shed", () => {
    const waves: WaveDef[] = [{ at: 1, profile: "saboteur", entry: "gw", objectives: [{ node: "plcB", action: "manipulate" }] }];
    const m = fixture(waves, { equipment: fixture([]).equipment.map((e) => (e.id === "fan" ? { ...e, controller: undefined } : e)) });
    const idle = start(m);
    command(idle, m, { type: "start" });
    run(idle, m, 80);
    expect(idle.equipment.l1.tripped).toBe(true);
    expect(idle.equipment.l2.tripped && idle.equipment.l3.tripped).toBe(true); // cascade
    expect(idle.equipment.city.out).toBe(0);

    const shed = start(m);
    command(shed, m, { type: "start" });
    for (let i = 0; i < 3000 && !shed.equipment.l1.tripped; i++) step(shed, m);
    expect(command(shed, m, { type: "setpoint", equip: "city", value: 0.5 }).ok).toBe(true);
    run(shed, m, 60);
    expect(shed.equipment.l2.tripped || shed.equipment.l3.tripped).toBe(false);
    expect(shed.equipment.city.out).toBeCloseTo(0.5);
  });
});

describe("advanced threat behaviour", () => {
  it("a jammer blinds nearby sensors for a while", () => {
    const m = fixture([{ at: 1, profile: "jammer", entry: "gw", objectives: [{ node: "sw", action: "blind" }] }]);
    const g = start(m);
    command(g, m, { type: "sensor", node: "plcA" });
    command(g, m, { type: "start" });
    for (let i = 0; i < 3000 && g.nodes.plcA.sensorBlindUntil === 0; i++) step(g, m);
    expect(g.nodes.plcA.sensorBlindUntil).toBeGreaterThan(g.time);
    expect(g.alerts.some((a) => a.title === "Sensor telemetry degraded")).toBe(true);
  });

  it("a coordinated cell stages and strikes on the same tick", () => {
    const m = fixture([
      { at: 1, profile: "cell", entry: "gw", objectives: [{ node: "plcA", action: "manipulate" }], syncGroup: "x" },
      { at: 12, profile: "cell", entry: "gw2", objectives: [{ node: "plcB", action: "manipulate" }], syncGroup: "x" },
    ]);
    const g = start(m);
    command(g, m, { type: "start" });
    let a = 0;
    let b = 0;
    for (let i = 0; i < 3000 && !(a && b); i++) {
      step(g, m);
      if (!a && g.nodes.plcA.implant) a = g.time;
      if (!b && g.nodes.plcB.implant) b = g.time;
    }
    expect(a).toBeGreaterThan(0);
    expect(a).toBe(b);
  });
});

describe("endless mode", () => {
  it("generates escalating waves deterministically from the seed", () => {
    const m = makeEndless(fixture([]));
    const play = (seed: number) => {
      const g = createGame(m, {}, seed);
      command(g, m, { type: "start" });
      run(g, m, 120);
      return g;
    };
    const a = play(1);
    const b = play(1);
    const c = play(2);
    expect(a.threats.length).toBeGreaterThan(3);
    expect(a.threats.map((t) => `${t.profile}:${t.trail.join()}`)).toEqual(b.threats.map((t) => `${t.profile}:${t.trail.join()}`));
    expect(JSON.stringify(a.threats)).not.toEqual(JSON.stringify(c.threats));
    expect(a.phase === "running" || a.phase === "lost").toBe(true);
  });
});

describe("external uplinks", () => {
  it("cannot be left isolated: operations restore them", () => {
    const m = fixture([{ at: 1, profile: "scanner", entry: "gw", objectives: [{ node: "plcA", action: "manipulate" }] }]);
    const g = createGame(m);
    command(g, m, { type: "start" });
    run(g, m, 2);
    command(g, m, { type: "isolate", node: "gw" });
    run(g, m, 20);
    expect(g.nodes.gw.isolated).toBe(true);
    expect(g.nodes.sw.compromised).toBe(false);
    run(g, m, 10);
    expect(g.nodes.gw.isolated).toBe(false);
    run(g, m, 60);
    expect(g.nodes.sw.compromised).toBe(true);
  });
});
