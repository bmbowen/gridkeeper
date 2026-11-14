import {
  BASE_MODS,
  COSTS,
  CONTROLLER_KINDS,
  DEFAULT_EFFECT,
  DT,
  ISOLATION_OPS_COST,
  MAX_OPS_PENALTY,
  PROFILES,
  TIMES,
} from "./constants";
import { rngNext, rngPick } from "./rng";
import type {
  Alert,
  Command,
  CommandResult,
  EquipDef,
  EquipState,
  GameState,
  Job,
  LinkDef,
  MissionDef,
  Mods,
  NodeDef,
  Objective,
  Severity,
  SimEvent,
  ThreatProfileId,
  ThreatState,
  WaveDef,
} from "./types";

// ------------------------------------------------------------------ topology

export interface Topology {
  node: Record<string, NodeDef>;
  link: Record<string, LinkDef>;
  equip: Record<string, EquipDef>;
  /** node id -> [{ link, other }] */
  adj: Record<string, { link: string; other: string }[]>;
  /** controller node id -> equipment ids */
  controls: Record<string, string[]>;
  controllers: string[];
  entries: string[];
}

const topoCache = new WeakMap<MissionDef, Topology>();

export function topology(m: MissionDef): Topology {
  let t = topoCache.get(m);
  if (t) return t;
  t = { node: {}, link: {}, equip: {}, adj: {}, controls: {}, controllers: [], entries: [] };
  for (const n of m.nodes) {
    t.node[n.id] = n;
    t.adj[n.id] = [];
    if (n.entry) t.entries.push(n.id);
  }
  for (const l of m.links) {
    t.link[l.id] = l;
    t.adj[l.a].push({ link: l.id, other: l.b });
    t.adj[l.b].push({ link: l.id, other: l.a });
  }
  for (const e of m.equipment) {
    t.equip[e.id] = e;
    if (e.controller) (t.controls[e.controller] ??= []).push(e.id);
  }
  t.controllers = Object.keys(t.controls);
  topoCache.set(m, t);
  return t;
}

/** Throws if a mission definition references unknown ids or lists equipment out of order. */
export function validateMission(m: MissionDef): void {
  const nodeIds = new Set(m.nodes.map((n) => n.id));
  const zoneIds = new Set(m.zones.map((z) => z.id));
  const fail = (msg: string) => {
    throw new Error(`[${m.id}] ${msg}`);
  };
  if (nodeIds.size !== m.nodes.length) fail("duplicate node id");
  for (const n of m.nodes) if (!zoneIds.has(n.zone)) fail(`node ${n.id} has unknown zone ${n.zone}`);
  const linkIds = new Set<string>();
  for (const l of m.links) {
    if (linkIds.has(l.id)) fail(`duplicate link ${l.id}`);
    linkIds.add(l.id);
    if (!nodeIds.has(l.a) || !nodeIds.has(l.b)) fail(`link ${l.id} references unknown node`);
  }
  const seen = new Set<string>();
  for (const e of m.equipment) {
    if (seen.has(e.id)) fail(`duplicate equipment ${e.id}`);
    if (e.controller && !nodeIds.has(e.controller)) fail(`equipment ${e.id} has unknown controller`);
    for (const i of e.inputs ?? []) if (!seen.has(i)) fail(`equipment ${e.id} input ${i} must be listed earlier`);
    for (const c of e.cooledBy ?? []) if (!seen.has(c)) fail(`equipment ${e.id} cooler ${c} must be listed earlier`);
    seen.add(e.id);
  }
  for (const g of m.groups ?? []) {
    for (const id of [...g.members, ...g.demandFrom]) if (!seen.has(id)) fail(`group ${g.id} references ${id}`);
  }
  if (!m.equipment.some((e) => e.sinkWeight)) fail("mission has no production sinks");
  for (const w of m.waves) {
    if (!nodeIds.has(w.entry)) fail(`wave entry ${w.entry} unknown`);
    for (const o of w.objectives) if (!nodeIds.has(o.node)) fail(`wave objective ${o.node} unknown`);
  }
  for (const ev of m.events ?? []) {
    if (ev.type === "falseAlarm" && !nodeIds.has(ev.node)) fail(`event node ${ev.node} unknown`);
    if (ev.type === "fault" && !seen.has(ev.equip)) fail(`event equip ${ev.equip} unknown`);
  }
}

// ------------------------------------------------------------------ creation

export function createGame(m: MissionDef, mods: Partial<Mods> = {}, seed?: number): GameState {
  const fullMods: Mods = { ...BASE_MODS, ...mods };
  const g: GameState = {
    missionId: m.id,
    rng: (seed ?? m.seed) >>> 0,
    tick: 0,
    time: 0,
    phase: "prep",
    loseReason: "",
    credits: m.startCredits + fullMods.startBonus,
    mods: fullMods,
    nodes: {},
    links: {},
    equipment: {},
    threats: [],
    jobs: [],
    alerts: [],
    events: [],
    nextId: 1,
    waveIndex: 0,
    eventIndex: 0,
    nextEndlessWave: 18,
    demand: 1,
    weather: "clear",
    production: 1,
    safety: 100,
    productionAcc: 0,
    samples: 0,
    outageTimer: 0,
    opsPenalty: 0,
    stats: {
      threatsSpawned: 0,
      threatsEliminated: 0,
      threatsActed: 0,
      implants: 0,
      trips: 0,
      fires: 0,
      isolations: 0,
      sensorsPlaced: 0,
      segmentsPlaced: 0,
      hardened: 0,
      investigations: 0,
      falsePositives: 0,
      remediations: 0,
      creditsSpent: 0,
      creditsEarned: 0,
      shedSeconds: 0,
    },
  };
  for (const n of m.nodes) {
    g.nodes[n.id] = {
      compromised: false,
      implant: false,
      manipulated: false,
      arming: false,
      knowledge: "none",
      sensor: false,
      sensorBlindUntil: 0,
      hardened: false,
      isolated: false,
      honeypot: false,
      manipSince: -1,
    };
  }
  for (const l of m.links) g.links[l.id] = { segmented: false };
  for (const e of m.equipment) {
    g.equipment[e.id] = {
      setpoint: 1,
      tripped: false,
      condition: 100,
      heat: 0,
      out: 1,
      level: e.buffer?.initial ?? 0,
      load: 0,
      overloadTimer: 0,
      manip: false,
      arming: false,
      local: false,
      fire: 0,
      tripAt: 0,
    };
  }
  stepPhysical(g, m, 0);
  return g;
}

// ------------------------------------------------------------------ helpers

function emit(g: GameState, e: SimEvent) {
  if (g.events.length < 256) g.events.push(e);
}

function alert(g: GameState, severity: Severity, title: string, text: string, ref: { node?: string; equip?: string } = {}) {
  const a: Alert = { id: g.nextId++, time: g.time, severity, title, text, ...ref };
  g.alerts.push(a);
  if (g.alerts.length > 40) g.alerts.shift();
  emit(g, { type: "alert", severity });
}

export function sensorActive(g: GameState, node: string): boolean {
  const n = g.nodes[node];
  return n.sensor && g.time >= n.sensorBlindUntil;
}

/** Is activity on this node observable by the defender's passive sensors? */
export function nodeCovered(g: GameState, m: MissionDef, node: string): boolean {
  if (sensorActive(g, node)) return true;
  if (g.mods.sensorRange > 0) {
    for (const a of topology(m).adj[node]) if (sensorActive(g, a.other)) return true;
  }
  return false;
}

export function linkCovered(g: GameState, m: MissionDef, link: string): boolean {
  const l = topology(m).link[link];
  return nodeCovered(g, m, l.a) || nodeCovered(g, m, l.b);
}

export function cost(g: GameState, key: keyof typeof COSTS): number {
  return Math.round(COSTS[key] * g.mods.costMul);
}

export function freeSlots(g: GameState, pool: "analyst" | "crew"): number {
  const total = pool === "analyst" ? g.mods.analysts : g.mods.crew;
  return total - g.jobs.filter((j) => j.pool === pool).length;
}

export function jobFor(g: GameState, target: string): Job | undefined {
  return g.jobs.find((j) => j.target === target);
}

/** Shortest path over links the threat can currently use. Returns node ids including start, or null. */
export function findPath(g: GameState, m: MissionDef, from: string, to: string, credentialed: boolean): string[] | null {
  if (from === to) return [from];
  const topo = topology(m);
  const prev: Record<string, string> = { [from]: from };
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cur = queue[i];
    for (const { link, other } of topo.adj[cur]) {
      if (prev[other] !== undefined) continue;
      if (g.nodes[other].isolated) continue;
      if (g.links[link].segmented && !credentialed) continue;
      prev[other] = cur;
      if (other === to) {
        const path = [to];
        let p = cur;
        while (p !== from) {
          path.push(p);
          p = prev[p];
        }
        path.push(from);
        return path.reverse();
      }
      queue.push(other);
    }
  }
  return null;
}

function linkBetween(m: MissionDef, a: string, b: string): string {
  const hit = topology(m).adj[a].find((x) => x.other === b);
  return hit ? hit.link : "";
}

function spend(g: GameState, amount: number): boolean {
  if (g.credits < amount) return false;
  g.credits -= amount;
  g.stats.creditsSpent += amount;
  return true;
}

const deny = (g: GameState, reason: string): CommandResult => {
  emit(g, { type: "denied", reason });
  return { ok: false, reason };
};
const OK: CommandResult = { ok: true };

// ------------------------------------------------------------------ commands

/** Why a command would be refused right now, or null if it is allowed. Does not mutate. */
export function commandBlocked(g: GameState, m: MissionDef, c: Command): string | null {
  const topo = topology(m);
  const has = (tool: string) => (m.tools as string[]).includes(tool);
  if (g.phase === "won" || g.phase === "lost") return "Mission is over";
  switch (c.type) {
    case "start":
      return g.phase === "prep" ? null : "Already running";
    case "sensor": {
      const n = g.nodes[c.node];
      if (!n) return "Unknown asset";
      if (n.sensor) return "Sensor already deployed";
      if (g.credits < cost(g, "sensor")) return "Not enough credits";
      return null;
    }
    case "harden": {
      const n = g.nodes[c.node];
      if (!has("harden")) return "Hardening is not available yet";
      if (n.hardened) return "Already hardened";
      if (n.compromised) return "Remediate before hardening";
      if (g.credits < cost(g, "harden")) return "Not enough credits";
      return null;
    }
    case "honeypot": {
      const n = g.nodes[c.node];
      if (!has("honeypot") || !g.mods.honeypot) return "Deception tripwires are not unlocked";
      if (n.honeypot) return "Tripwire already armed";
      if (g.credits < cost(g, "honeypot")) return "Not enough credits";
      return null;
    }
    case "isolate":
      if (!has("isolate")) return "Isolation is not available yet";
      return g.nodes[c.node].isolated ? "Already isolated" : null;
    case "reconnect":
      return g.nodes[c.node].isolated ? null : "Not isolated";
    case "investigate": {
      if (g.phase !== "running") return "Start operations first";
      if (jobFor(g, c.node)) return "Analyst already working here";
      if (freeSlots(g, "analyst") <= 0) return "All analysts are busy";
      return null;
    }
    case "remediate": {
      const n = g.nodes[c.node];
      if (g.phase !== "running") return "Start operations first";
      if (n.knowledge !== "confirmed") return "Investigate first to confirm the intrusion";
      if (jobFor(g, c.node)) return "Analyst already working here";
      if (freeSlots(g, "analyst") <= 0) return "All analysts are busy";
      if (g.credits < cost(g, "remediate")) return "Not enough credits";
      return null;
    }
    case "segment": {
      const l = topo.link[c.link];
      if (!has("segment")) return "Segmentation is not available yet";
      if (!l?.conduit) return "Only zone conduits can be segmented";
      if (g.links[c.link].segmented) return "Already segmented";
      if (g.credits < cost(g, "segment")) return "Not enough credits";
      return null;
    }
    case "unsegment":
      return g.links[c.link]?.segmented ? null : "Not segmented";
    case "restore": {
      const e = g.equipment[c.equip];
      if (g.phase !== "running") return "Start operations first";
      if (!e.tripped) return "Not tripped";
      if (e.condition <= 0) return "Too damaged, repair it first";
      if (e.manip) return "Controller is still issuing bad commands. Isolate or remediate it first";
      if (jobFor(g, c.equip)) return "Crew already working here";
      if (freeSlots(g, "crew") <= 0) return "All field crews are busy";
      return null;
    }
    case "repair": {
      const e = g.equipment[c.equip];
      if (g.phase !== "running") return "Start operations first";
      if (e.condition >= 95) return "No repair needed";
      if (jobFor(g, c.equip)) return "Crew already working here";
      if (freeSlots(g, "crew") <= 0) return "All field crews are busy";
      if (g.credits < cost(g, "repair")) return "Not enough credits";
      return null;
    }
    case "setpoint": {
      const d = topo.equip[c.equip];
      if (!has("setpoint") || !d?.setpoints) return "No operator control on this equipment";
      if (!d.setpoints.includes(c.value)) return "Invalid setpoint";
      return null;
    }
  }
}

export function command(g: GameState, m: MissionDef, c: Command): CommandResult {
  const blocked = commandBlocked(g, m, c);
  if (blocked) return deny(g, blocked);
  switch (c.type) {
    case "start":
      g.phase = "running";
      emit(g, { type: "start" });
      alert(g, "info", "Operations live", "Shift has started. Keep the lights on.");
      return OK;
    case "sensor":
      spend(g, cost(g, "sensor"));
      g.nodes[c.node].sensor = true;
      g.stats.sensorsPlaced++;
      emit(g, { type: "sensor", node: c.node });
      return OK;
    case "harden":
      spend(g, cost(g, "harden"));
      g.nodes[c.node].hardened = true;
      g.stats.hardened++;
      emit(g, { type: "harden", node: c.node });
      return OK;
    case "honeypot":
      spend(g, cost(g, "honeypot"));
      g.nodes[c.node].honeypot = true;
      emit(g, { type: "honeypot", node: c.node });
      return OK;
    case "isolate":
      g.nodes[c.node].isolated = true;
      g.stats.isolations++;
      emit(g, { type: "isolate", node: c.node });
      return OK;
    case "reconnect":
      g.nodes[c.node].isolated = false;
      emit(g, { type: "reconnect", node: c.node });
      return OK;
    case "investigate":
      g.jobs.push({ id: g.nextId++, pool: "analyst", type: "investigate", target: c.node, remaining: TIMES.investigate, total: TIMES.investigate });
      g.stats.investigations++;
      return OK;
    case "remediate": {
      spend(g, cost(g, "remediate"));
      // Cleaning an isolated node is quicker: nothing can interfere mid-rebuild.
      const total = TIMES.remediate * g.mods.remediateMul * (g.nodes[c.node].isolated ? 0.6 : 1);
      g.jobs.push({ id: g.nextId++, pool: "analyst", type: "remediate", target: c.node, remaining: total, total });
      return OK;
    }
    case "segment":
      spend(g, cost(g, "segment"));
      g.links[c.link].segmented = true;
      g.stats.segmentsPlaced++;
      emit(g, { type: "segment", link: c.link });
      return OK;
    case "unsegment":
      g.links[c.link].segmented = false;
      emit(g, { type: "unsegment", link: c.link });
      return OK;
    case "restore":
      g.jobs.push({ id: g.nextId++, pool: "crew", type: "restore", target: c.equip, remaining: TIMES.restore, total: TIMES.restore });
      return OK;
    case "repair":
      spend(g, cost(g, "repair"));
      g.jobs.push({ id: g.nextId++, pool: "crew", type: "repair", target: c.equip, remaining: TIMES.repair, total: TIMES.repair });
      return OK;
    case "setpoint":
      g.equipment[c.equip].setpoint = c.value;
      emit(g, { type: "setpoint", equip: c.equip });
      return OK;
  }
}

// ------------------------------------------------------------------ threats

function spawnThreat(g: GameState, m: MissionDef, w: WaveDef) {
  const t: ThreatState = {
    id: g.nextId++,
    profile: w.profile,
    phase: "compromising",
    node: w.entry,
    from: w.entry,
    to: w.entry,
    link: "",
    progress: 0,
    timer: 0,
    objectives: w.objectives.map((o) => ({ ...o })),
    objIndex: 0,
    trail: [],
    identified: false,
    visible: false,
    contained: false,
    detect: 0,
    hasActed: false,
    syncGroup: w.syncGroup,
    stagedAt: -1,
    stallTotal: 0,
  };
  g.threats.push(t);
  g.stats.threatsSpawned++;
  emit(g, { type: "spawn", threat: t.id, node: t.node });
  if (w.label) emit(g, { type: "wave", label: w.label });
}

function markSuspicious(g: GameState, m: MissionDef, node: string, title: string, text: string) {
  const n = g.nodes[node];
  if (n.knowledge !== "none") return;
  n.knowledge = "suspicious";
  emit(g, { type: "suspicious", node });
  alert(g, "warn", title, text, { node });
}

function killThreat(g: GameState, t: ThreatState) {
  t.phase = "dead";
  t.visible = false;
  g.stats.threatsEliminated++;
  emit(g, { type: "eliminated", threat: t.id, node: t.node });
}

function retarget(g: GameState, m: MissionDef, t: ThreatState): boolean {
  const topo = topology(m);
  const prof = PROFILES[t.profile];
  let best: string | null = null;
  let bestLen = Infinity;
  for (const c of topo.controllers) {
    if (g.nodes[c].implant || g.nodes[c].isolated) continue;
    const p = findPath(g, m, t.node, c, prof.credentialed);
    if (p && p.length < bestLen) {
      best = c;
      bestLen = p.length;
    }
  }
  if (!best) return false;
  t.objectives.push({ node: best, action: "manipulate" });
  t.objIndex = t.objectives.length - 1;
  t.stallTotal = 0;
  return true;
}

function stepThreat(g: GameState, m: MissionDef, t: ThreatState, dt: number) {
  if (t.phase === "dead") return;
  const topo = topology(m);
  const prof = PROFILES[t.profile];
  const node = g.nodes[t.node];

  if (t.phase === "evicted") {
    t.timer -= dt;
    if (t.timer <= 0) t.phase = "idle";
    return;
  }

  t.contained = t.phase !== "moving" && node.isolated;
  if (t.contained) return;

  switch (t.phase) {
    case "compromising": {
      const base = prof.compromiseTime * (node.hardened ? g.mods.hardenFactor : 1);
      const total = node.compromised ? Math.min(1.5, base) : base;
      t.progress += dt / total;
      if (t.progress >= 1) {
        if (!node.compromised) {
          node.compromised = true;
          emit(g, { type: "compromised", node: t.node });
        }
        if (!t.trail.includes(t.node)) t.trail.push(t.node);
        t.progress = 0;
        t.phase = "idle";
        if (node.honeypot) {
          t.identified = true;
          node.knowledge = "confirmed";
          t.phase = "stalled";
          t.timer = TIMES.honeypotDelay;
          emit(g, { type: "confirmed", node: t.node });
          alert(g, "good", "Tripwire triggered", `${prof.name} touched the decoy on ${topo.node[t.node].name}. Actor identified and stalled.`, { node: t.node });
        }
      }
      break;
    }
    case "idle": {
      const obj: Objective | undefined = t.objectives[t.objIndex];
      if (!obj) {
        if (prof.opportunistic && retarget(g, m, t)) break;
        t.phase = "dormant";
        break;
      }
      if (t.node === obj.node) {
        if (obj.action === "blind") {
          const until = g.time + TIMES.blind;
          let any = false;
          for (const id of [t.node, ...topo.adj[t.node].map((a) => a.other)]) {
            if (g.nodes[id].sensor) {
              g.nodes[id].sensorBlindUntil = Math.max(g.nodes[id].sensorBlindUntil, until);
              any = true;
            }
          }
          if (!t.hasActed) g.stats.threatsActed++;
          t.hasActed = true;
          emit(g, { type: "blind", node: t.node });
          if (any) alert(g, "warn", "Sensor telemetry degraded", `Monitoring around ${topo.node[t.node].name} has gone dark. Something is hiding there.`, { node: t.node });
          t.objIndex++;
          t.phase = "acting";
          t.timer = prof.dwell;
        } else if (node.implant) {
          t.objIndex++;
        } else if (t.syncGroup) {
          t.phase = "staged";
          t.stagedAt = g.time;
        } else {
          t.phase = "arming";
          t.progress = 0;
        }
        break;
      }
      const path = findPath(g, m, t.node, obj.node, prof.credentialed);
      if (!path) {
        t.phase = "stalled";
        t.timer = 2;
        t.stallTotal += 2;
        if (t.stallTotal >= 14) {
          if (prof.opportunistic && retarget(g, m, t)) break;
          // Give up on an unreachable objective and try the next one.
          if (t.stallTotal >= 30 && t.objIndex < t.objectives.length - 1) {
            t.objIndex++;
            t.stallTotal = 0;
          }
        }
        break;
      }
      t.stallTotal = 0;
      t.from = t.node;
      t.to = path[1];
      t.link = linkBetween(m, t.from, t.to);
      t.progress = 0;
      t.phase = "moving";
      break;
    }
    case "moving": {
      const link = g.links[t.link];
      if (g.nodes[t.to].isolated || (link.segmented && !prof.credentialed)) {
        // Path closed mid-transit: fall back to where it came from.
        t.phase = "idle";
        t.progress = 0;
        break;
      }
      t.progress += dt / (prof.moveTime * (link.segmented ? 3 : 1));
      if (t.progress >= 1) {
        t.node = t.to;
        t.phase = "compromising";
        t.progress = 0;
        if (link.segmented) {
          markSuspicious(g, m, t.node, "Firewall policy alert", `Unusual session crossed a segmented conduit into ${topo.node[t.node].name}.`);
        }
      }
      break;
    }
    case "stalled":
      t.timer -= dt;
      if (t.timer <= 0) t.phase = "idle";
      break;
    case "staged": {
      const group = g.threats.filter((o) => o.syncGroup === t.syncGroup && o.phase !== "dead");
      const waiting = group.filter((o) => o.phase !== "staged" && o.phase !== "arming" && o.phase !== "acting" && !o.contained && o.phase !== "dormant");
      const first = Math.min(...group.filter((o) => o.stagedAt >= 0).map((o) => o.stagedAt));
      if (waiting.length === 0 || g.time - first > 45) {
        for (const o of group) {
          if (o.phase === "staged") {
            o.phase = "arming";
            o.progress = 0;
            // Mark the release tick so every member starts its countdown on the next step together.
            o.stagedAt = g.time;
          }
        }
      }
      break;
    }
    case "arming":
      if (t.syncGroup && t.stagedAt === g.time) break;
      if (node.implant) {
        t.phase = "idle";
        t.objIndex++;
        break;
      }
      t.progress += dt / prof.armTime;
      if (t.progress >= 1) {
        node.implant = true;
        if (!t.hasActed) g.stats.threatsActed++;
        t.hasActed = true;
        g.stats.implants++;
        t.phase = "acting";
        t.timer = prof.dwell;
        emit(g, { type: "implant", node: t.node });
      }
      break;
    case "acting":
      t.timer -= dt;
      if (t.timer <= 0) {
        if (t.objectives[t.objIndex]?.node === t.node && t.objectives[t.objIndex].action === "manipulate") t.objIndex++;
        t.phase = "idle";
      }
      break;
    case "dormant":
      break;
  }
}

function stepDetection(g: GameState, m: MissionDef, dt: number) {
  const topo = topology(m);
  for (const n of Object.values(g.nodes)) n.arming = false;
  for (const t of g.threats) {
    if (t.phase === "dead") continue;
    if (t.phase === "arming" && !t.contained) g.nodes[t.node].arming = true;
    if (t.phase === "evicted") {
      t.visible = t.identified;
      continue;
    }
    const covered = t.phase === "moving" ? linkCovered(g, m, t.link) : nodeCovered(g, m, t.node);
    t.visible = t.identified || covered;
    if (covered && !t.identified) {
      t.detect += dt;
      if (t.detect >= PROFILES[t.profile].stealth) {
        // In transit the traffic originates from the foothold it just left.
        const where = t.phase === "moving" ? t.from : t.node;
        markSuspicious(g, m, where, "Suspicious activity", `Passive sensor flagged unusual traffic at ${topo.node[where].name}. Investigate to confirm.`);
      }
    } else if (!covered) {
      t.detect = Math.max(0, t.detect - dt * 0.5);
    }
  }
  // Operators notice equipment misbehaving even without sensors.
  for (const id of topo.controllers) {
    const n = g.nodes[id];
    n.manipulated = n.implant && !n.isolated;
    if (n.manipulated) {
      if (n.manipSince < 0) n.manipSince = g.time;
      if (g.time - n.manipSince >= TIMES.operatorNotice) {
        markSuspicious(g, m, id, "Abnormal control commands", `Operators report ${topo.node[id].name} issuing commands nobody authorized.`);
      }
    } else {
      n.manipSince = -1;
    }
  }
}

// ------------------------------------------------------------------ jobs

function finishJob(g: GameState, m: MissionDef, j: Job) {
  const topo = topology(m);
  if (j.type === "investigate") {
    const n = g.nodes[j.target];
    const present = g.threats.filter((t) => t.phase !== "dead" && ((t.phase !== "moving" && t.node === j.target) || t.trail.includes(j.target)));
    if (n.compromised || present.some((t) => t.node === j.target && t.phase !== "moving")) {
      n.knowledge = "confirmed";
      for (const t of present) t.identified = true;
      emit(g, { type: "confirmed", node: j.target });
      const who = present[0] ? PROFILES[present[0].profile].name : "Dormant foothold";
      alert(g, "crit", "Intrusion confirmed", `${topo.node[j.target].name}: ${who}. Isolate to contain, then remediate.`, { node: j.target });
    } else {
      if (n.knowledge === "suspicious") g.stats.falsePositives++;
      n.knowledge = "none";
      emit(g, { type: "cleared", node: j.target });
      alert(g, "info", "No findings", `${topo.node[j.target].name} is clean. Benign anomaly.`, { node: j.target });
    }
  } else if (j.type === "remediate") {
    const n = g.nodes[j.target];
    n.compromised = false;
    n.implant = false;
    n.knowledge = "none";
    g.stats.remediations++;
    emit(g, { type: "remediated", node: j.target });
    for (const t of g.threats) {
      if (t.phase === "dead") continue;
      t.trail = t.trail.filter((x) => x !== j.target);
      if (t.phase === "moving" || t.node !== j.target) continue;
      // Evicted: fall back to the most recent foothold that is still live and reachable.
      const fallback = [...t.trail].reverse().find((x) => g.nodes[x].compromised && !g.nodes[x].isolated);
      if (fallback) {
        t.node = fallback;
        t.phase = "evicted";
        t.timer = 5;
        t.progress = 0;
        t.identified = true;
        emit(g, { type: "evicted", threat: t.id, node: fallback });
        alert(g, "warn", "Actor fell back", `Evicted from ${topo.node[j.target].name}, but it still holds ${topo.node[fallback].name}. Clean that foothold too.`, { node: fallback });
        if (g.nodes[fallback].knowledge !== "confirmed") {
          g.nodes[fallback].knowledge = "confirmed";
          emit(g, { type: "confirmed", node: fallback });
        }
      } else {
        killThreat(g, t);
        alert(g, "good", "Threat eliminated", `${PROFILES[t.profile].name} removed from ${topo.node[j.target].name}. No footholds remain.`, { node: j.target });
      }
    }
  } else if (j.type === "restore") {
    const e = g.equipment[j.target];
    if (!e.manip && e.condition > 0) {
      e.tripped = false;
      e.overloadTimer = 0;
      emit(g, { type: "restore", equip: j.target });
    }
  } else if (j.type === "repair") {
    const e = g.equipment[j.target];
    e.condition = 100;
    e.heat = Math.min(e.heat, 0.3);
    e.fire = 0;
    emit(g, { type: "repair", equip: j.target });
  }
}

function stepJobs(g: GameState, m: MissionDef, dt: number) {
  for (let i = g.jobs.length - 1; i >= 0; i--) {
    const j = g.jobs[i];
    j.remaining -= dt;
    if (j.remaining <= 0) {
      g.jobs.splice(i, 1);
      finishJob(g, m, j);
    }
  }
}

// ------------------------------------------------------------------ physical

function trip(g: GameState, id: string, s: EquipState) {
  if (s.tripped) return;
  s.tripped = true;
  s.tripAt = g.time;
  g.stats.trips++;
  emit(g, { type: "trip", equip: id });
}

function combineInputs(g: GameState, m: MissionDef, d: EquipDef, setpoint: number): number {
  if (!d.inputs || d.inputs.length === 0) return 1;
  const topo = topology(m);
  const outs = d.inputs.map((i) => Math.min(1, g.equipment[i].out));
  switch (d.inputMode ?? "all") {
    case "any":
      return Math.max(...outs);
    case "avg":
      return outs.reduce((a, b) => a + b, 0) / outs.length;
    case "sum": {
      const supply = d.inputs.reduce((a, i) => a + Math.min(1, g.equipment[i].out) * (topo.equip[i].rating ?? 1), 0);
      const need = (d.need ?? d.inputs.length) * Math.max(0.05, setpoint) * g.demand;
      return Math.min(1, supply / need);
    }
    default:
      return Math.min(...outs);
  }
}

function stepPhysical(g: GameState, m: MissionDef, dt: number) {
  const topo = topology(m);

  // Overload groups: demand shared across surviving members.
  for (const grp of m.groups ?? []) {
    const demandScale = grp.demandFrom.reduce((a, id) => a + g.equipment[id].setpoint, 0) / grp.demandFrom.length;
    const demand = grp.demand * demandScale * g.demand;
    let cap = 0;
    for (const id of grp.members) {
      const s = g.equipment[id];
      if (!s.tripped && s.condition > 0 && !(s.manip && (topo.equip[id].manipEffect ?? DEFAULT_EFFECT[topo.equip[id].kind]) === "stop")) {
        cap += topo.equip[id].rating ?? 1;
      }
    }
    const ratio = cap > 0 ? demand / cap : 0;
    const limit = grp.limit ?? 1.12;
    let worst: string | null = null;
    for (const id of grp.members) {
      const s = g.equipment[id];
      if (s.tripped || s.condition <= 0) {
        s.load = 0;
        s.overloadTimer = 0;
        continue;
      }
      s.load = ratio;
      if (ratio > limit) {
        s.overloadTimer += dt;
        if (!worst || (topo.equip[id].rating ?? 1) < (topo.equip[worst].rating ?? 1)) worst = id;
      } else {
        s.overloadTimer = Math.max(0, s.overloadTimer - dt * 2);
      }
    }
    if (worst && g.equipment[worst].overloadTimer >= (grp.tripAfter ?? 9)) {
      trip(g, worst, g.equipment[worst]);
      g.safety -= 2;
      alert(g, "crit", "Overload trip", `${topo.equip[worst].name} tripped on overload. ${grp.name} is redistributing load. Shed demand or restore capacity.`, { equip: worst });
      // The survivors get a short grace period before the next one goes.
      for (const id of grp.members) g.equipment[id].overloadTimer = Math.min(g.equipment[id].overloadTimer, (grp.tripAfter ?? 9) * 0.45);
    }
  }

  let sinkOut = 0;
  let sinkWeight = 0;
  for (const d of m.equipment) {
    const s = g.equipment[d.id];
    const ctrl = d.controller ? g.nodes[d.controller] : undefined;
    const effect = d.manipEffect ?? DEFAULT_EFFECT[d.kind];
    s.manip = !!ctrl?.manipulated;
    s.arming = !!ctrl?.arming && !ctrl.isolated;
    s.local = !!ctrl?.isolated;

    if (s.manip && effect === "trip" && !s.tripped) {
      trip(g, d.id, s);
      alert(g, "crit", "Unauthorized trip", `${d.name} was opened by a command from ${topo.node[d.controller!].name}.`, { equip: d.id });
    }
    if (s.tripped && g.mods.autoReclose && !s.manip && s.condition > 0 && s.fire <= 0 && g.time - s.tripAt >= TIMES.autoReclose && !jobFor(g, d.id)) {
      s.tripped = false;
      emit(g, { type: "restore", equip: d.id });
    }

    let avail = 0;
    let overdrive = false;
    if (!s.tripped && s.condition > 0) {
      const condFactor = s.condition >= 50 ? 1 : 0.4 + (s.condition / 50) * 0.6;
      avail = s.setpoint * condFactor;
      if (s.local) avail *= d.manualFactor ?? 0.8;
      if (s.manip) {
        if (effect === "stop") avail = 0;
        else if (effect === "erratic") avail *= 0.45;
        else if (effect === "overdrive") {
          avail = 1.25;
          overdrive = true;
        }
      }
    }

    let inF = combineInputs(g, m, d, s.setpoint);
    if (d.buffer) {
      // Tank: fills from surplus inflow, drains to cover a shortfall.
      const delta = (inF - g.demand) / d.buffer.seconds;
      s.level = Math.max(0, Math.min(1, s.level + delta * dt));
      if (s.level > 0.01) inF = 1;
    }
    s.out = avail * inF;

    // Thermal model.
    let target = 0;
    if (d.cooledBy && d.cooledBy.length) {
      const cool = d.cooledBy.reduce((a, c) => a + Math.min(1, g.equipment[c].out), 0) / d.cooledBy.length;
      target = Math.min(1, s.out) * (1 - cool) * 1.15;
    }
    if (overdrive) target = 1.1;
    if (g.weather === "heat" && d.cooledBy) target += 0.12;
    const rate = d.heatRate ?? 0.04;
    if (s.heat < target) s.heat = Math.min(target, s.heat + rate * dt);
    else s.heat = Math.max(target, s.heat - rate * 1.4 * dt);
    if (s.heat > 0.75 && !s.tripped) {
      s.condition = Math.max(0, s.condition - (s.heat - 0.75) * 9 * dt);
      g.safety -= (s.heat - 0.75) * 0.8 * dt;
    }
    if (s.heat >= 0.99 && !s.tripped) {
      trip(g, d.id, s);
      s.fire = 14;
      s.condition = Math.max(0, s.condition - 30);
      g.safety -= 7;
      g.stats.fires++;
      emit(g, { type: "fire", equip: d.id });
      alert(g, "crit", "Thermal trip", `${d.name} overheated and tripped on protection. Crews report smoke.`, { equip: d.id });
    }
    if (s.manip && effect === "erratic" && !s.tripped && s.setpoint > 0) {
      g.safety -= (d.hazardRate ?? 0.6) * dt;
    }
    if (overdrive && !d.cooledBy) g.safety -= (d.hazardRate ?? 0.3) * dt;
    if (s.fire > 0) s.fire = Math.max(0, s.fire - dt);
    if (s.setpoint < 1 && d.setpoints) g.stats.shedSeconds += dt;

    if (d.sinkWeight) {
      sinkOut += Math.min(1, s.out) * d.sinkWeight;
      sinkWeight += d.sinkWeight;
    }
  }
  g.production = sinkWeight > 0 ? sinkOut / sinkWeight : 0;
  g.safety = Math.max(0, Math.min(100, g.safety));
}

// ------------------------------------------------------------------ endless

function endlessWave(g: GameState, m: MissionDef) {
  const topo = topology(m);
  const intensity = g.time / 60;
  const pool: ThreatProfileId[] = ["scanner", "intruder"];
  if (intensity > 1) pool.push("saboteur", "engineer");
  if (intensity > 2) pool.push("jammer", "saboteur");
  if (intensity > 3) pool.push("cell");
  const profile = rngPick(g, pool);
  const entry = rngPick(g, topo.entries);
  const target = rngPick(g, topo.controllers);
  if (profile === "cell") {
    const group = `e${g.nextId}`;
    const count = 2 + (intensity > 5 ? 1 : 0);
    for (let i = 0; i < count; i++) {
      spawnThreat(g, m, { at: g.time, profile, entry: rngPick(g, topo.entries), objectives: [{ node: rngPick(g, topo.controllers), action: "manipulate" }], syncGroup: group });
    }
  } else if (profile === "jammer") {
    const sw = m.nodes.filter((n) => n.kind === "switch");
    spawnThreat(g, m, { at: g.time, profile, entry, objectives: [{ node: rngPick(g, sw.length ? sw.map((n) => n.id) : topo.controllers), action: "blind" }, { node: target, action: "manipulate" }] });
  } else {
    const objectives: Objective[] = [{ node: target, action: "manipulate" }];
    if (profile === "saboteur") objectives.push({ node: rngPick(g, topo.controllers), action: "manipulate" });
    spawnThreat(g, m, { at: g.time, profile, entry, objectives });
  }
  const gap = Math.max(7, 26 - intensity * 2.2) * (0.8 + rngNext(g) * 0.4);
  g.nextEndlessWave = g.time + gap;
}

// ------------------------------------------------------------------ step

/** Advance the simulation by one fixed timestep. */
export function step(g: GameState, m: MissionDef): void {
  if (g.phase !== "running") return;
  const dt = DT;
  const topo = topology(m);
  g.tick++;
  g.time = g.tick * dt;

  while (g.eventIndex < (m.events?.length ?? 0) && m.events![g.eventIndex].at <= g.time) {
    const ev = m.events![g.eventIndex++];
    if (ev.type === "message") alert(g, ev.severity ?? "info", ev.title, ev.text);
    else if (ev.type === "demand") {
      g.demand = ev.value;
      if (ev.text) alert(g, "info", "Demand change", ev.text);
    } else if (ev.type === "weather") {
      g.weather = ev.value;
      if (ev.text) alert(g, "info", "Weather", ev.text);
    } else if (ev.type === "falseAlarm") {
      if (sensorActive(g, ev.node)) markSuspicious(g, m, ev.node, "Suspicious activity", `Passive sensor flagged unusual traffic at ${topo.node[ev.node].name}. Investigate to confirm.`);
    } else if (ev.type === "fault") {
      const s = g.equipment[ev.equip];
      trip(g, ev.equip, s);
      alert(g, "warn", "Equipment fault", ev.text ?? `${topo.equip[ev.equip].name} tripped on a mechanical fault. Send a crew to restore it.`, { equip: ev.equip });
    }
  }
  while (g.waveIndex < m.waves.length && m.waves[g.waveIndex].at <= g.time) spawnThreat(g, m, m.waves[g.waveIndex++]);
  if (m.endless && g.time >= g.nextEndlessWave) endlessWave(g, m);

  stepJobs(g, m, dt);
  for (const t of g.threats) stepThreat(g, m, t, dt);
  stepDetection(g, m, dt);
  stepPhysical(g, m, dt);

  // Economy: income follows production, minus the operational cost of defensive restrictions.
  let penalty = 0;
  for (const l of m.links) if (g.links[l.id].segmented) penalty += l.opsCost ?? 0;
  for (const n of m.nodes) if (g.nodes[n.id].isolated && !CONTROLLER_KINDS.includes(n.kind)) penalty += ISOLATION_OPS_COST;
  g.opsPenalty = Math.min(MAX_OPS_PENALTY, penalty);
  const income = m.incomeRate * g.production * (1 - g.opsPenalty) * dt;
  g.credits += income;
  g.stats.creditsEarned += income;

  g.productionAcc += g.production;
  g.samples++;

  // Outcome.
  if (g.production < m.lose.productionBelow) g.outageTimer += dt;
  else g.outageTimer = Math.max(0, g.outageTimer - dt * 2);
  if (g.safety <= 0) {
    g.phase = "lost";
    g.loseReason = "Safety limits breached. The site has been shut down.";
  } else if (g.outageTimer >= m.lose.seconds) {
    g.phase = "lost";
    g.loseReason = "Sustained outage. Operations could not be maintained.";
  } else if (!m.endless) {
    const allSpawned = g.waveIndex >= m.waves.length;
    const allDead = g.threats.every((t) => t.phase === "dead");
    const lastWave = m.waves.length ? m.waves[m.waves.length - 1].at : 0;
    const settled = Object.values(g.equipment).every((e) => !e.tripped) && g.jobs.length === 0;
    if (g.time >= m.duration || (allSpawned && allDead && settled && g.time > lastWave + 4)) g.phase = "won";
  }
  if (g.phase === "won") emit(g, { type: "win" });
  if (g.phase === "lost") emit(g, { type: "lose" });
}

/** Seconds until the next scripted wave, or null if none remain. */
export function nextWaveIn(g: GameState, m: MissionDef): number | null {
  if (m.endless) return Math.max(0, g.nextEndlessWave - g.time);
  const w = m.waves[g.waveIndex];
  return w ? Math.max(0, w.at - g.time) : null;
}

export function activeThreats(g: GameState): number {
  return g.threats.filter((t) => t.phase !== "dead").length;
}
