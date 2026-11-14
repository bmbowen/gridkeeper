import type { EquipKind, ManipEffect, Mods, NodeKind, ThreatProfile, ThreatProfileId } from "./types";

/** Fixed simulation timestep in seconds (10 Hz). */
export const DT = 0.1;

export const COSTS = {
  sensor: 60,
  harden: 50,
  segment: 80,
  remediate: 40,
  repair: 60,
  honeypot: 90,
} as const;

export const TIMES = {
  investigate: 4,
  remediate: 6,
  restore: 5,
  repair: 12,
  /** Seconds a visible manipulation runs before operators flag the controller themselves. */
  operatorNotice: 3,
  blind: 25,
  autoReclose: 8,
  honeypotDelay: 12,
  /** External uplinks cannot stay cut: operations restore them after this long. */
  uplinkIsolation: 25,
} as const;

/** Income lost per isolated non-controller node (operators lose a workstation or data source). */
export const ISOLATION_OPS_COST = 0.1;
export const MAX_OPS_PENALTY = 0.6;
/** Condition lost per second by equipment running in local manual (no supervisory control). */
export const LOCAL_WEAR = 0.35;

export const BASE_MODS: Mods = {
  sensorRange: 0,
  analysts: 2,
  crew: 2,
  remediateMul: 1,
  hardenFactor: 2.5,
  autoReclose: false,
  startBonus: 0,
  honeypot: false,
  costMul: 1,
};

export const PROFILES: Record<ThreatProfileId, ThreatProfile> = {
  scanner: {
    id: "scanner",
    name: "Opportunistic Scanner",
    summary: "Noisy and slow. Probes exposed services and pokes at whatever controller it can reach.",
    moveTime: 6,
    compromiseTime: 8,
    stealth: 1.5,
    armTime: 7,
    dwell: 6,
    credentialed: false,
    opportunistic: true,
  },
  intruder: {
    id: "intruder",
    name: "Remote Access Intruder",
    summary: "Abuses a remote-access path, then moves laterally toward a specific controller.",
    moveTime: 5,
    compromiseTime: 6.5,
    stealth: 3,
    armTime: 6,
    dwell: 8,
    credentialed: false,
    opportunistic: false,
  },
  engineer: {
    id: "engineer",
    name: "Credentialed Operator",
    summary: "Works with stolen engineering credentials. Segmentation slows it but does not stop it.",
    moveTime: 4.5,
    compromiseTime: 5.5,
    stealth: 5,
    armTime: 5,
    dwell: 8,
    credentialed: true,
    opportunistic: false,
  },
  saboteur: {
    id: "saboteur",
    name: "Control Saboteur",
    summary: "Fast and deliberate. Hits several controllers in sequence, leaving bad logic behind.",
    moveTime: 4,
    compromiseTime: 5,
    stealth: 4,
    armTime: 4,
    dwell: 5,
    credentialed: false,
    opportunistic: true,
  },
  jammer: {
    id: "jammer",
    name: "Visibility Jammer",
    summary: "Floods and tampers with monitoring so nearby sensors go dark before the real strike.",
    moveTime: 4,
    compromiseTime: 4.5,
    stealth: 2,
    armTime: 4,
    dwell: 4,
    credentialed: false,
    opportunistic: false,
  },
  cell: {
    id: "cell",
    name: "Coordinated Cell",
    summary: "Members stage quietly on separate controllers and strike at the same moment.",
    moveTime: 4.5,
    compromiseTime: 5,
    stealth: 4,
    armTime: 5,
    dwell: 10,
    credentialed: false,
    opportunistic: false,
  },
};

export const DEFAULT_EFFECT: Record<EquipKind, ManipEffect> = {
  source: "trip",
  breaker: "trip",
  transformer: "trip",
  fan: "stop",
  feeder: "trip",
  line: "trip",
  district: "trip",
  intake: "stop",
  pump: "overdrive",
  valve: "stop",
  tank: "stop",
  clarifier: "stop",
  doser: "erratic",
  boiler: "overdrive",
  turbine: "overdrive",
  generator: "trip",
  coolingTower: "stop",
  coolingPump: "stop",
  robot: "erratic",
  conveyor: "stop",
  press: "erratic",
  packer: "stop",
  plant: "trip",
  substation: "trip",
  windfarm: "stop",
};

export const NODE_KIND_LABEL: Record<NodeKind, string> = {
  gateway: "Remote Access Gateway",
  firewall: "Perimeter Firewall",
  switch: "Network Switch",
  hmi: "Operator HMI",
  ews: "Engineering Workstation",
  historian: "Data Historian",
  server: "SCADA Server",
  plc: "PLC",
  rtu: "RTU",
};

/** Node kinds that directly drive field equipment. */
export const CONTROLLER_KINDS: NodeKind[] = ["plc", "rtu"];
