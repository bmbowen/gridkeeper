/**
 * GRIDKEEPER simulation types.
 * Everything in src/sim is plain TypeScript with no React / DOM / three.js imports,
 * so the simulation can be tested, replayed and run headless.
 */

export type Vec3 = [number, number, number];

// ---------------------------------------------------------------- network

export type NodeKind =
  | "gateway" // external uplink / remote access
  | "firewall"
  | "switch"
  | "hmi"
  | "ews" // engineering workstation
  | "historian"
  | "server"
  | "plc"
  | "rtu";

export interface ZoneDef {
  id: string;
  name: string;
  /** Short level tag shown on the overlay, e.g. "L3 OPERATIONS". */
  tag: string;
  color: string;
  /** Floor rectangle of the zone in world space: [minX, minZ, maxX, maxZ]. */
  rect: [number, number, number, number];
}

export interface NodeDef {
  id: string;
  name: string;
  kind: NodeKind;
  zone: string;
  /** World position of the physical cabinet / console. */
  pos: Vec3;
  /** Threats may enter the network here. */
  entry?: boolean;
  desc: string;
}

export interface LinkDef {
  id: string;
  a: string;
  b: string;
  /** A conduit crosses a zone boundary and can be segmented with a firewall policy. */
  conduit?: boolean;
  /** Fraction of income lost while this conduit is segmented (business data flow restricted). */
  opsCost?: number;
}

// ---------------------------------------------------------------- physical

export type EquipKind =
  // electrical
  | "source"
  | "breaker"
  | "transformer"
  | "fan"
  | "feeder"
  | "line"
  | "district"
  // water
  | "intake"
  | "pump"
  | "valve"
  | "tank"
  | "clarifier"
  | "doser"
  // generation
  | "boiler"
  | "turbine"
  | "generator"
  | "coolingTower"
  | "coolingPump"
  // factory
  | "robot"
  | "conveyor"
  | "press"
  | "packer"
  // grid
  | "plant"
  | "substation"
  | "windfarm";

export type ManipEffect = "trip" | "stop" | "overdrive" | "erratic";

export interface EquipDef {
  id: string;
  name: string;
  kind: EquipKind;
  pos: Vec3;
  /** Rotation around Y in radians. */
  rot?: number;
  /** Network node whose commands drive this equipment. */
  controller?: string;
  /** Upstream equipment. Must appear earlier in the mission's equipment list. */
  inputs?: string[];
  /** all = weakest input, any = strongest, avg = mean, sum = Σ(out × rating) / need. */
  inputMode?: "all" | "any" | "avg" | "sum";
  /** Capacity contributed to a `sum` consumer or an overload group. */
  rating?: number;
  /** Supply needed by a `sum` consumer at full setpoint. */
  need?: number;
  /** If set, this equipment is a production sink with this weight. */
  sinkWeight?: number;
  /** Cooling equipment; losing it makes this unit heat up under load. */
  cooledBy?: string[];
  /** Heat gained per second when fully uncooled at full load (default 0.04). */
  heatRate?: number;
  /** Buffer tank: seconds of full demand it can supply when full, and initial fill 0..1. */
  buffer?: { seconds: number; initial: number };
  /** What a malicious controller does to this equipment. */
  manipEffect?: ManipEffect;
  /** Safety points lost per second while erratic / overdriven (default 0.6). */
  hazardRate?: number;
  /** Output factor when the controller is isolated and the unit runs in local manual (default 0.8). */
  manualFactor?: number;
  /** Operator may change the setpoint (throttle / load-shed / e-stop). */
  setpoints?: number[];
  /** Label for the setpoint control ("Throttle", "Shed load", "Line speed"). */
  setpointLabel?: string;
  /** Free-form visual hint for the renderer (variant, length, colour...). */
  visual?: Record<string, number | string | boolean>;
  desc?: string;
}

/** Parallel elements that share a load; losing members overloads the rest and can cascade. */
export interface OverloadGroupDef {
  id: string;
  name: string;
  members: string[];
  /** Sinks whose setpoints scale the demand on the group. */
  demandFrom: string[];
  /** Demand in rating units at nominal conditions. */
  demand: number;
  /** Load ratio above which members begin to overheat (default 1.12). */
  limit?: number;
  /** Seconds above the limit before the weakest member trips (default 9). */
  tripAfter?: number;
}

// ---------------------------------------------------------------- threats

export type ThreatProfileId =
  | "scanner"
  | "intruder"
  | "engineer"
  | "saboteur"
  | "jammer"
  | "cell";

export interface ThreatProfile {
  id: ThreatProfileId;
  name: string;
  summary: string;
  /** Seconds to traverse a link. */
  moveTime: number;
  /** Seconds to compromise an unhardened node. */
  compromiseTime: number;
  /** Seconds of sensor coverage before an anomaly is raised. */
  stealth: number;
  /** Seconds between reaching a controller and the unauthorized command (the telegraph window). */
  armTime: number;
  /** Seconds it lingers after acting before moving on. */
  dwell: number;
  /** Uses valid credentials: crosses segmented conduits slowly instead of being stopped. */
  credentialed: boolean;
  /** Picks a new target if its objective becomes unreachable. */
  opportunistic: boolean;
}

export interface Objective {
  node: string;
  /** manipulate = unauthorized control action; blind = degrade sensors near the node. */
  action: "manipulate" | "blind";
}

export interface WaveDef {
  at: number;
  profile: ThreatProfileId;
  entry: string;
  objectives: Objective[];
  /** Threats sharing a sync group stage quietly and strike together. */
  syncGroup?: string;
  /** Wave banner shown to the player. */
  label?: string;
}

export type ScriptedEvent =
  | { at: number; type: "message"; title: string; text: string; severity?: Severity }
  | { at: number; type: "demand"; value: number; text?: string }
  | { at: number; type: "weather"; value: Weather; text?: string }
  | { at: number; type: "falseAlarm"; node: string }
  | { at: number; type: "fault"; equip: string; text?: string };

export type Weather = "clear" | "wind" | "storm" | "heat";

// ---------------------------------------------------------------- missions

export type ToolId =
  | "sensor"
  | "investigate"
  | "isolate"
  | "remediate"
  | "harden"
  | "segment"
  | "setpoint"
  | "honeypot";

export type EnvironmentId = "desert" | "water" | "plant" | "factory" | "grid";

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  test: (g: GameState, r: MissionResult) => boolean;
}

export interface MissionDef {
  id: string;
  index: number;
  name: string;
  tagline: string;
  location: string;
  environment: EnvironmentId;
  briefing: string[];
  objectives: string[];
  /** New concept this mission introduces (shown on the mission card). */
  teaches: string;
  seed: number;
  startCredits: number;
  /** Credits per second at 100% production. */
  incomeRate: number;
  /** Shift length in seconds. Infinity for endless. */
  duration: number;
  endless?: boolean;
  /** Display unit and nominal value for production, e.g. 180 "MW". */
  unit: string;
  nominal: number;
  zones: ZoneDef[];
  nodes: NodeDef[];
  links: LinkDef[];
  equipment: EquipDef[];
  groups?: OverloadGroupDef[];
  waves: WaveDef[];
  events?: ScriptedEvent[];
  tools: ToolId[];
  lose: { productionBelow: number; seconds: number };
  stars: { safety: number; uptime: number; containment: number };
  achievements: AchievementDef[];
  /** Camera: orbit target and home position, plus the cinematic intro path. */
  camera: { target: Vec3; home: Vec3; intro: Vec3[] };
  /** Map position on the campaign screen, 0..1. */
  map: [number, number];
  tutorial?: boolean;
}

// ---------------------------------------------------------------- state

export type Severity = "info" | "warn" | "crit" | "good";
export type Knowledge = "none" | "suspicious" | "confirmed";

export interface NodeState {
  /** An adversary has a foothold on this node. */
  compromised: boolean;
  /** Malicious logic is installed: controlled equipment is being manipulated. */
  implant: boolean;
  /** Derived each step: implant && !isolated. */
  manipulated: boolean;
  /** Derived each step: a threat is about to issue commands (telegraph). */
  arming: boolean;
  /** What the defender knows. */
  knowledge: Knowledge;
  sensor: boolean;
  sensorBlindUntil: number;
  hardened: boolean;
  isolated: boolean;
  /** Simulation time at which the asset was last isolated. */
  isolatedAt: number;
  honeypot: boolean;
  manipSince: number;
}

export interface LinkState {
  segmented: boolean;
}

export interface EquipState {
  setpoint: number;
  tripped: boolean;
  /** 0..100 */
  condition: number;
  /** 0..1 */
  heat: number;
  /** Effective output 0..1.25 */
  out: number;
  /** Buffer fill 0..1 (tanks). */
  level: number;
  /** Load ratio in an overload group (1 = at rating). */
  load: number;
  overloadTimer: number;
  manip: boolean;
  arming: boolean;
  local: boolean;
  /** Seconds of fire / smoke remaining. */
  fire: number;
  /** Time at which auto-reclose may fire (if upgrade owned). */
  tripAt: number;
}

export type ThreatPhase =
  | "compromising"
  | "idle"
  | "moving"
  | "stalled"
  | "staged"
  | "arming"
  | "acting"
  | "dormant"
  | "evicted"
  | "dead";

export interface ThreatState {
  id: number;
  profile: ThreatProfileId;
  phase: ThreatPhase;
  node: string;
  from: string;
  to: string;
  link: string;
  progress: number;
  timer: number;
  objectives: Objective[];
  objIndex: number;
  trail: string[];
  /** Defender has this actor's signature and tracks it everywhere. */
  identified: boolean;
  /** Derived each step: currently visible to the defender. */
  visible: boolean;
  /** Derived each step: sitting on an isolated node. */
  contained: boolean;
  detect: number;
  hasActed: boolean;
  syncGroup?: string;
  stagedAt: number;
  stallTotal: number;
  /** Has found an allowed service to tunnel through segmented conduits (slow and logged). */
  tunnel: boolean;
}

export interface Job {
  id: number;
  pool: "analyst" | "crew";
  type: "investigate" | "remediate" | "restore" | "repair";
  target: string;
  remaining: number;
  total: number;
}

export interface Alert {
  id: number;
  time: number;
  severity: Severity;
  title: string;
  text: string;
  node?: string;
  equip?: string;
}

export type SimEvent =
  | { type: "sensor" | "harden" | "isolate" | "reconnect" | "honeypot" | "compromised" | "suspicious" | "confirmed" | "cleared" | "remediated" | "implant" | "blind"; node: string }
  | { type: "segment" | "unsegment"; link: string }
  | { type: "trip" | "restore" | "repair" | "fire" | "setpoint"; equip: string }
  | { type: "spawn" | "eliminated" | "evicted"; threat: number; node: string }
  | { type: "wave"; label: string }
  | { type: "alert"; severity: Severity }
  | { type: "denied"; reason: string }
  | { type: "start" | "win" | "lose" };

export interface Mods {
  /** 0 = sensor covers its node and links; 1 = also adjacent nodes. */
  sensorRange: number;
  analysts: number;
  crew: number;
  remediateMul: number;
  hardenFactor: number;
  autoReclose: boolean;
  startBonus: number;
  honeypot: boolean;
  costMul: number;
}

export interface Stats {
  threatsSpawned: number;
  threatsEliminated: number;
  threatsActed: number;
  implants: number;
  trips: number;
  fires: number;
  isolations: number;
  sensorsPlaced: number;
  segmentsPlaced: number;
  hardened: number;
  investigations: number;
  falsePositives: number;
  remediations: number;
  creditsSpent: number;
  creditsEarned: number;
  shedSeconds: number;
}

export interface GameState {
  missionId: string;
  rng: number;
  tick: number;
  time: number;
  phase: "prep" | "running" | "won" | "lost";
  loseReason: string;
  credits: number;
  mods: Mods;
  nodes: Record<string, NodeState>;
  links: Record<string, LinkState>;
  equipment: Record<string, EquipState>;
  threats: ThreatState[];
  jobs: Job[];
  alerts: Alert[];
  /** Transient events for presentation layers; the consumer drains this array. */
  events: SimEvent[];
  nextId: number;
  waveIndex: number;
  eventIndex: number;
  nextEndlessWave: number;
  demand: number;
  weather: Weather;
  production: number;
  safety: number;
  productionAcc: number;
  samples: number;
  outageTimer: number;
  opsPenalty: number;
  stats: Stats;
}

export type Command =
  | { type: "start" }
  | { type: "sensor"; node: string }
  | { type: "harden"; node: string }
  | { type: "honeypot"; node: string }
  | { type: "isolate"; node: string }
  | { type: "reconnect"; node: string }
  | { type: "investigate"; node: string }
  | { type: "remediate"; node: string }
  | { type: "segment"; link: string }
  | { type: "unsegment"; link: string }
  | { type: "restore"; equip: string }
  | { type: "repair"; equip: string }
  | { type: "setpoint"; equip: string; value: number };

export interface CommandResult {
  ok: boolean;
  reason?: string;
}

export interface MissionResult {
  won: boolean;
  stars: number;
  starSafety: boolean;
  starUptime: boolean;
  starContainment: boolean;
  safety: number;
  uptime: number;
  containment: number;
  score: number;
  time: number;
  achievements: string[];
  loseReason: string;
}
