import type { MissionDef } from "../types";

/**
 * LEVEL 3 — HEAT SIGNATURE
 * Blackwater Generating Station, three 180 MW steam units, night.
 * Teaches: competing priorities. Throttle (setpoint) trades output for thermal margin
 * when cooling is compromised, while the grid operator keeps asking for more.
 */
export const level3: MissionDef = {
  id: "heat-signature",
  index: 3,
  name: "Heat Signature",
  tagline: "Three turbines, one cooling loop, and a grid that wants every megawatt.",
  location: "Blackwater Generating Station · River Bend",
  environment: "plant",
  teaches: "Throttling · Thermal margin · Output versus safety",
  briefing: [
    "Blackwater runs three steam units into the regional interconnect. Each turbine rejects its heat through one shared cooling loop: two towers, three circulating pumps, one controller.",
    "Tonight the load is light, so you have a unit's worth of spare capacity. That ends at the evening peak, when the grid operator will call for everything the plant has.",
    "If cooling is lost, a turbine at full load cooks in about half a minute. You can now THROTTLE a turbine: less output, far less heat. Deciding when the megawatts matter more than the margin is the job.",
  ],
  objectives: [
    "Meet grid demand until the shift ends",
    "Keep every turbine out of thermal trip",
    "Throttle units when cooling is compromised, and bring them back when it is safe",
  ],
  seed: 0x4ea75167,
  startCredits: 360,
  incomeRate: 4,
  duration: 320,
  unit: "MW",
  nominal: 540,
  zones: [
    { id: "ext", name: "External Networks", tag: "UNTRUSTED", color: "#ff6b5e", rect: [30, 40, 56, 49] },
    { id: "dmz", name: "Plant DMZ", tag: "L3.5 DATA EXCHANGE", color: "#ffb020", rect: [37, 26, 52, 37] },
    { id: "ctrl", name: "Control Room", tag: "L2 SUPERVISORY", color: "#38d6ff", rect: [10, 26, 35, 37] },
    { id: "unit", name: "Unit Control", tag: "L1 CONTROLLERS", color: "#7dffb0", rect: [-22, -31, 2, 30] },
  ],
  nodes: [
    { id: "wan", name: "Grid Operator Link", kind: "gateway", zone: "ext", pos: [34, 0, 45], entry: true, desc: "Dispatch telemetry to the regional grid operator. Exposed by design." },
    { id: "oem", name: "Turbine OEM Tunnel", kind: "gateway", zone: "ext", pos: [51, 0, 45], entry: true, desc: "Remote condition monitoring for the turbine vendor. Always on, rarely watched." },
    { id: "fw", name: "Plant Firewall", kind: "firewall", zone: "dmz", pos: [41, 0, 31.5], desc: "Perimeter between the outside world and the plant." },
    { id: "hist", name: "Plant Historian", kind: "historian", zone: "dmz", pos: [47.5, 0, 31.5], desc: "Collects every tag in the plant and serves it to the vendor and to corporate." },
    { id: "sw", name: "Control Room Switch", kind: "switch", zone: "ctrl", pos: [14, 0, 31.5], desc: "Core of the supervisory network. A good place to listen." },
    { id: "hmi", name: "Unit Operator HMI", kind: "hmi", zone: "ctrl", pos: [20.5, 0, 31.5], desc: "Where the operators watch load, steam and vibration." },
    { id: "ews", name: "Engineering Workstation", kind: "ews", zone: "ctrl", pos: [28, 0, 31.5], desc: "Holds the controller logic for all three units. Trusted by every PLC." },
    { id: "lap", name: "Contractor Laptop", kind: "ews", zone: "ctrl", pos: [32.5, 0, 34.2], entry: true, desc: "An outage contractor's laptop, plugged straight into the control room network. Already inside the perimeter." },
    { id: "usw", name: "Unit Network Switch", kind: "switch", zone: "unit", pos: [-2, 0, -9], desc: "Field network cabinet on the turbine deck. Every unit controller hangs off it." },
    { id: "plc1", name: "PLC-1 · Unit 1", kind: "plc", zone: "unit", pos: [-17, 0, -9], desc: "Controls Unit 1 firing and the turbine governor." },
    { id: "plc2", name: "PLC-2 · Unit 2", kind: "plc", zone: "unit", pos: [-17, 0, 9], desc: "Controls Unit 2 firing and the turbine governor." },
    { id: "plc3", name: "PLC-3 · Unit 3", kind: "plc", zone: "unit", pos: [-17, 0, 26.5], desc: "Controls Unit 3 firing and the turbine governor." },
    { id: "plcGen", name: "PLC-G · Generator Protection", kind: "plc", zone: "unit", pos: [-2, 0, 9], desc: "Excitation and breaker control for all three generators." },
    { id: "plcCool", name: "PLC-C · Cooling Loop", kind: "plc", zone: "unit", pos: [-17, 0, -27.5], desc: "Runs the circulating pumps and tower fans. Every turbine depends on it." },
  ],
  links: [
    { id: "wan-fw", a: "wan", b: "fw", conduit: true, opsCost: 0.08 },
    { id: "oem-hist", a: "oem", b: "hist", conduit: true, opsCost: 0.06 },
    { id: "fw-hist", a: "fw", b: "hist" },
    { id: "fw-sw", a: "fw", b: "sw", conduit: true },
    { id: "hist-hmi", a: "hist", b: "hmi", conduit: true, opsCost: 0.04 },
    { id: "sw-hmi", a: "sw", b: "hmi" },
    { id: "hmi-ews", a: "hmi", b: "ews" },
    { id: "lap-sw", a: "lap", b: "sw" },
    { id: "sw-usw", a: "sw", b: "usw", conduit: true },
    { id: "ews-plcGen", a: "ews", b: "plcGen", conduit: true },
    { id: "usw-plc1", a: "usw", b: "plc1" },
    { id: "usw-plc2", a: "usw", b: "plc2" },
    { id: "usw-plcGen", a: "usw", b: "plcGen" },
    { id: "plc2-plc3", a: "plc2", b: "plc3" },
    { id: "usw-plcCool", a: "usw", b: "plcCool" },
  ],
  equipment: [
    // cooling loop
    { id: "ct1", name: "Cooling Tower A", kind: "coolingTower", pos: [-42, 0, -36], controller: "plcCool", desc: "Natural-draft tower. Rejects the heat the turbines cannot use." },
    { id: "ct2", name: "Cooling Tower B", kind: "coolingTower", pos: [-42, 0, -54], controller: "plcCool", desc: "Natural-draft tower. Rejects the heat the turbines cannot use." },
    { id: "cp1", name: "Circulating Pump 1", kind: "coolingPump", pos: [-26, 0, -34], controller: "plcCool", inputs: ["ct1"], desc: "Cooling water for Unit 1's condenser." },
    { id: "cp2", name: "Circulating Pump 2", kind: "coolingPump", pos: [-26, 0, -45], controller: "plcCool", inputs: ["ct1", "ct2"], inputMode: "any", desc: "Cooling water for Unit 2's condenser. Can draw from either tower." },
    { id: "cp3", name: "Circulating Pump 3", kind: "coolingPump", pos: [-26, 0, -56], controller: "plcCool", inputs: ["ct2"], desc: "Cooling water for Unit 3's condenser." },
    // unit 1
    { id: "b1", name: "Boiler 1", kind: "boiler", pos: [-32, 0, -18], controller: "plc1", heatRate: 0.022, hazardRate: 0.25, desc: "Raises steam for Unit 1. Over-firing it is dangerous." },
    { id: "t1", name: "Turbine 1", kind: "turbine", pos: [-17, 0, -18], controller: "plc1", inputs: ["b1"], cooledBy: ["cp1"], heatRate: 0.03, setpoints: [0.5, 0.75, 1], setpointLabel: "Throttle", desc: "180 MW steam turbine. At full load it needs its circulating pump; at half load it can ride through without one." },
    { id: "g1", name: "Generator 1", kind: "generator", pos: [-6, 0, -18], controller: "plcGen", inputs: ["t1"], visual: { flow: "none" } },
    { id: "x1", name: "Step-Up Transformer 1", kind: "transformer", pos: [9, 0, -18], inputs: ["g1"], visual: { flow: "wire" } },
    // unit 2
    { id: "b2", name: "Boiler 2", kind: "boiler", pos: [-32, 0, 0], controller: "plc2", heatRate: 0.022, hazardRate: 0.25, desc: "Raises steam for Unit 2. Over-firing it is dangerous." },
    { id: "t2", name: "Turbine 2", kind: "turbine", pos: [-17, 0, 0], controller: "plc2", inputs: ["b2"], cooledBy: ["cp2"], heatRate: 0.03, setpoints: [0.5, 0.75, 1], setpointLabel: "Throttle", desc: "180 MW steam turbine. At full load it needs its circulating pump; at half load it can ride through without one." },
    { id: "g2", name: "Generator 2", kind: "generator", pos: [-6, 0, 0], controller: "plcGen", inputs: ["t2"], visual: { flow: "none" } },
    { id: "x2", name: "Step-Up Transformer 2", kind: "transformer", pos: [9, 0, 0], inputs: ["g2"], visual: { flow: "wire" } },
    // unit 3
    { id: "b3", name: "Boiler 3", kind: "boiler", pos: [-32, 0, 18], controller: "plc3", heatRate: 0.022, hazardRate: 0.25, desc: "Raises steam for Unit 3. Over-firing it is dangerous." },
    { id: "t3", name: "Turbine 3", kind: "turbine", pos: [-17, 0, 18], controller: "plc3", inputs: ["b3"], cooledBy: ["cp3"], heatRate: 0.03, setpoints: [0.5, 0.75, 1], setpointLabel: "Throttle", desc: "180 MW steam turbine. At full load it needs its circulating pump; at half load it can ride through without one." },
    { id: "g3", name: "Generator 3", kind: "generator", pos: [-6, 0, 18], controller: "plcGen", inputs: ["t3"], visual: { flow: "none" } },
    { id: "x3", name: "Step-Up Transformer 3", kind: "transformer", pos: [9, 0, 18], inputs: ["g3"], visual: { flow: "wire" } },
    // export
    { id: "grid", name: "Grid Interconnect", kind: "source", pos: [27, 0, 0], rot: Math.PI, inputs: ["x1", "x2", "x3"], inputMode: "sum", need: 3, sinkWeight: 1, visual: { flow: "wire" }, desc: "345 kV tie to the regional grid. Output is measured here against what dispatch is asking for." },
  ],
  waves: [
    { at: 14, profile: "intruder", entry: "wan", objectives: [{ node: "plcCool", action: "manipulate" }], label: "Unsolicited sessions on the grid operator link" },
    { at: 58, profile: "intruder", entry: "oem", objectives: [{ node: "plcGen", action: "manipulate" }], label: "OEM tunnel active outside its maintenance window" },
    { at: 112, profile: "engineer", entry: "oem", objectives: [{ node: "plc2", action: "manipulate" }], label: "Valid engineering login from an unknown host" },
    { at: 152, profile: "saboteur", entry: "wan", objectives: [{ node: "plc1", action: "manipulate" }, { node: "plcGen", action: "manipulate" }], label: "Fast mover inbound on the dispatch link" },
    { at: 204, profile: "engineer", entry: "oem", objectives: [{ node: "plcCool", action: "manipulate" }] },
    { at: 226, profile: "saboteur", entry: "lap", objectives: [{ node: "plc3", action: "manipulate" }, { node: "plcCool", action: "manipulate" }], label: "Something woke up on the contractor laptop" },
    { at: 252, profile: "intruder", entry: "oem", objectives: [{ node: "plc1", action: "manipulate" }] },
  ],
  events: [
    { at: 1, type: "demand", value: 0.72, text: "Overnight load is light: dispatch wants 390 MW. You have a spare unit's worth of margin." },
    { at: 84, type: "falseAlarm", node: "hist" },
    { at: 140, type: "demand", value: 1, text: "Evening peak. Dispatch is calling for full output: every throttled megawatt now counts against you." },
    { at: 188, type: "weather", value: "heat", text: "Hot, still night. Condenser margin is shrinking on every unit." },
    { at: 236, type: "fault", equip: "cp2", text: "Circulating Pump 2 tripped on a bearing fault. Turbine 2 is losing cooling: throttle it or get a crew on the pump." },
    { at: 292, type: "demand", value: 0.85, text: "Peak is passing. Dispatch eases to 460 MW." },
  ],
  tools: ["sensor", "investigate", "isolate", "remediate", "harden", "segment", "setpoint"],
  lose: { productionBelow: 0.35, seconds: 22 },
  stars: { safety: 88, uptime: 90, containment: 70 },
  achievements: [
    { id: "l3-cool", name: "Cool Under Pressure", desc: "Finish without a single thermal trip.", test: (g) => g.stats.fires === 0 },
    { id: "l3-follow", name: "Load Follower", desc: "Throttle for at least 20 seconds and still finish with 93% uptime.", test: (g, r) => g.stats.shedSeconds >= 20 && r.uptime >= 93 },
  ],
  camera: {
    target: [-4, 0, -2],
    home: [66, 60, 112],
    intro: [
      [-96, 16, -92],
      [-74, 26, 14],
      [-18, 20, 74],
      [66, 60, 112],
    ],
  },
  map: [0.52, 0.62],
};
