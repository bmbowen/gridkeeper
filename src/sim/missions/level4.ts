import type { EquipDef, LinkDef, MissionDef, NodeDef } from "../types";

/**
 * LEVEL 4 — ASSEMBLY LINE
 * Halden Motive battery-pack plant: three parallel lines under one roof.
 * Teaches: parallel intrusions, production bottlenecks, cell E-stops.
 *
 * Each line is a series chain: press → conveyor → weld cell → conveyor → assembly cell → packer.
 * One stopped stage starves everything downstream of it. Robots and presses that take bad
 * commands keep running erratically, which is a safety hazard until the cell is E-stopped
 * or its PLC is isolated.
 */

const LINES = [
  { n: 1, z: -14, name: "Line 1" },
  { n: 2, z: -2, name: "Line 2" },
  { n: 3, z: 10, name: "Line 3" },
];

const ESTOP = { setpoints: [0, 1], setpointLabel: "Cell E-stop", hazardRate: 0.4 };

function lineEquipment(n: number, z: number, name: string): EquipDef[] {
  const a = `plc${n}a`;
  const b = `plc${n}b`;
  return [
    { id: `l${n}press`, name: `${name} Stamping Press`, kind: "press", pos: [-28, 0, z], controller: a, inputs: ["air"], ...ESTOP, desc: "400-tonne press stamping tray blanks from coil. Needs plant air for its clutch and brake." },
    { id: `l${n}c1`, name: `${name} Infeed Conveyor`, kind: "conveyor", pos: [-19.5, 0, z], controller: a, inputs: [`l${n}press`], visual: { length: 11, stage: 0 } },
    { id: `l${n}weld`, name: `${name} Weld Cell`, kind: "robot", pos: [-11, 0, z], controller: a, inputs: [`l${n}c1`], ...ESTOP, visual: { variant: "weld" }, desc: "Six-axis robot seam-welding the tray. Erratic motion inside the cell is a safety hazard." },
    { id: `l${n}c2`, name: `${name} Transfer Conveyor`, kind: "conveyor", pos: [-1, 0, z], controller: b, inputs: [`l${n}weld`], visual: { length: 15, stage: 1 } },
    { id: `l${n}asm`, name: `${name} Assembly Cell`, kind: "robot", pos: [9, 0, z], controller: b, inputs: [`l${n}c2`], ...ESTOP, visual: { variant: "assembly" }, desc: "Six-axis robot placing cell modules into the tray. Erratic motion inside the cell is a safety hazard." },
    { id: `l${n}pack`, name: `${name} Packer`, kind: "packer", pos: [20, 0, z], controller: b, inputs: [`l${n}asm`], sinkWeight: n === 2 ? 1.3 : 1, desc: n === 2 ? "End of line: test, box, palletize. Line 2 builds the high-margin long-range pack." : "End of line: test, box, palletize." },
  ];
}

function lineNodes(n: number, z: number, name: string): NodeDef[] {
  return [
    { id: `plc${n}a`, name: `PLC ${n}A · Body Cell`, kind: "plc", zone: "cells", pos: [-19.5, 0, z + 3.6], desc: `Runs ${name}'s press, infeed conveyor and weld robot.` },
    { id: `plc${n}b`, name: `PLC ${n}B · Final Cell`, kind: "plc", zone: "cells", pos: [3, 0, z + 3.6], desc: `Runs ${name}'s transfer conveyor, assembly robot and packer.` },
  ];
}

const plcLinks: LinkDef[] = LINES.flatMap(({ n }) => [
  { id: `csw-plc${n}a`, a: "csw", b: `plc${n}a` },
  { id: `csw-plc${n}b`, a: "csw", b: `plc${n}b` },
]);

export const level4: MissionDef = {
  id: "assembly-line",
  index: 4,
  name: "Assembly Line",
  tagline: "Three lines, two analysts, and more than one visitor at a time.",
  location: "Halden Motive Pack Plant · Night Shift",
  environment: "factory",
  teaches: "Parallel threats · Bottlenecks · Cell E-stops",
  briefing: [
    "Halden Motive builds battery packs on three automated lines. Each line is a chain: press, weld cell, assembly cell, packer. Stop any link and everything after it runs dry.",
    "Tonight the intrusions will not come one at a time. You have two analysts and three lines, so you will have to decide which line gets help first and which one waits.",
    "A robot or press taking bad commands does not stop. It keeps moving, wrongly, with people nearby. Hit the Cell E-stop to make it safe right away, then deal with its PLC. Stopped cells make nothing, so do not leave them down longer than you must.",
  ],
  objectives: [
    "Keep packs coming off the lines until the shift ends",
    "E-stop any cell that goes erratic before someone gets hurt",
    "Prioritize: contain simultaneous intrusions on different lines",
  ],
  seed: 0x4a55e4b1,
  startCredits: 340,
  incomeRate: 2.7,
  duration: 330,
  unit: "units/h",
  nominal: 96,
  zones: [
    { id: "ext", name: "External Networks", tag: "UNTRUSTED", color: "#ff6b5e", rect: [44, 9, 57, 29] },
    { id: "ent", name: "Server Cage", tag: "L4 ENTERPRISE · MES", color: "#a78bfa", rect: [20, 19, 40, 28] },
    { id: "sup", name: "Control Room", tag: "L3 SUPERVISORY", color: "#38d6ff", rect: [-12, 19, 12, 28] },
    { id: "cells", name: "Production Floor", tag: "L1 CELL CONTROLLERS", color: "#7dffb0", rect: [-42, -26, 38, 15.5] },
  ],
  nodes: [
    { id: "corp", name: "Corporate IT Uplink", kind: "gateway", zone: "ext", pos: [50, 0, 14], entry: true, desc: "Link to head-office IT. Orders and schedules come down it; so does whatever got into the office network. Closing it costs income." },
    { id: "vendor", name: "Robot Vendor Access", kind: "gateway", zone: "ext", pos: [50, 0, 24], entry: true, desc: "Remote support line the robot integrator uses to tune weld programs. Whoever is on it tonight has the integrator's real credentials." },
    { id: "mes", name: "MES Server", kind: "server", zone: "ent", pos: [27, 0, 23.5], desc: "Manufacturing execution system: schedules, recipes and build records for every line." },
    { id: "hist", name: "Quality Historian", kind: "historian", zone: "ent", pos: [34, 0, 23.5], desc: "Stores weld and torque data for every pack shipped." },
    { id: "sw", name: "Supervisory Switch", kind: "switch", zone: "sup", pos: [-7, 0, 23.5], desc: "Core of the control room LAN. A good place to listen." },
    { id: "hmi", name: "Line Supervisor HMI", kind: "hmi", zone: "sup", pos: [0, 0, 23.5], desc: "Overview screens for all three lines." },
    { id: "ews", name: "Robot Programming Station", kind: "ews", zone: "sup", pos: [7, 0, 23.5], desc: "Holds every robot and PLC program. The vendor connects straight to it." },
    { id: "csw", name: "Cell Ring Switch", kind: "switch", zone: "cells", pos: [-5, 0, 4.2], desc: "Every cell PLC on the floor hangs off this switch." },
    ...LINES.flatMap((l) => lineNodes(l.n, l.z, l.name)),
    { id: "plcU", name: "PLC U · Plant Air", kind: "plc", zone: "cells", pos: [-33, 0, -21], desc: "Runs the compressed air plant. No air, no presses, no lines." },
  ],
  links: [
    { id: "corp-mes", a: "corp", b: "mes", conduit: true, opsCost: 0.14 },
    { id: "mes-hist", a: "mes", b: "hist" },
    { id: "mes-sw", a: "mes", b: "sw", conduit: true, opsCost: 0.08 },
    { id: "vendor-ews", a: "vendor", b: "ews", conduit: true, opsCost: 0.04 },
    { id: "sw-hmi", a: "sw", b: "hmi" },
    { id: "hmi-ews", a: "hmi", b: "ews" },
    { id: "sw-csw", a: "sw", b: "csw", conduit: true },
    { id: "ews-csw", a: "ews", b: "csw", conduit: true },
    ...plcLinks,
    { id: "csw-plcU", a: "csw", b: "plcU" },
  ],
  equipment: [
    { id: "air", name: "Compressed Air Plant", kind: "source", pos: [-38, 0, -21.5], controller: "plcU", manipEffect: "stop", manualFactor: 1, visual: { model: "compressor" }, desc: "Twin screw compressors and receivers. Every press clutch on the floor runs on this air." },
    ...LINES.flatMap((l) => lineEquipment(l.n, l.z, l.name)),
  ],
  waves: [
    { at: 14, profile: "intruder", entry: "corp", objectives: [{ node: "plc1a", action: "manipulate" }], label: "Odd logins from head-office IT" },
    { at: 24, profile: "engineer", entry: "vendor", objectives: [{ node: "plc3b", action: "manipulate" }], label: "Vendor support session nobody booked" },
    { at: 92, profile: "jammer", entry: "corp", objectives: [{ node: "sw", action: "blind" }, { node: "plc2a", action: "manipulate" }], label: "Monitoring flood on the control room LAN" },
    { at: 100, profile: "engineer", entry: "vendor", objectives: [{ node: "plc2b", action: "manipulate" }] },
    { at: 158, profile: "saboteur", entry: "corp", objectives: [{ node: "plc1b", action: "manipulate" }, { node: "plc3a", action: "manipulate" }], label: "Three sessions opened in the same minute" },
    { at: 164, profile: "engineer", entry: "vendor", objectives: [{ node: "plcU", action: "manipulate" }] },
    { at: 170, profile: "intruder", entry: "corp", objectives: [{ node: "plc2b", action: "manipulate" }] },
    { at: 232, profile: "engineer", entry: "vendor", objectives: [{ node: "plc3a", action: "manipulate" }], label: "Final push on all three lines" },
    { at: 238, profile: "saboteur", entry: "corp", objectives: [{ node: "plc2a", action: "manipulate" }, { node: "plc1a", action: "manipulate" }] },
    { at: 246, profile: "engineer", entry: "vendor", objectives: [{ node: "plcU", action: "manipulate" }, { node: "plc1b", action: "manipulate" }] },
  ],
  events: [
    { at: 6, type: "message", title: "Night shift", text: "All three lines at rate. Line 2 carries the long-range pack order due at 06:00." },
    { at: 58, type: "falseAlarm", node: "hmi" },
    { at: 128, type: "fault", equip: "l3c1", text: "Line 3 Infeed Conveyor jammed on a bent blank. Nothing cyber about it: send a crew to restore it." },
    { at: 205, type: "message", title: "Shift lead", text: "People are on the floor clearing scrap near the weld cells. Keep those robots honest.", severity: "warn" },
  ],
  tools: ["sensor", "investigate", "isolate", "remediate", "harden", "segment", "setpoint"],
  lose: { productionBelow: 0.3, seconds: 26 },
  stars: { safety: 85, uptime: 84, containment: 60 },
  achievements: [
    { id: "l4-hands", name: "All Fingers Accounted For", desc: "Finish with safety at 95% or better.", test: (g) => g.safety >= 95 },
    { id: "l4-order", name: "Order Shipped", desc: "Finish with average output at 92% or better.", test: (_g, r) => r.uptime >= 92 },
  ],
  camera: {
    target: [5, 0, 2],
    home: [50, 47, 90],
    intro: [
      [34, 3.5, -14],
      [20, 6, -22],
      [-30, 9, -8],
      [-34, 16, 30],
      [10, 34, 78],
      [50, 47, 90],
    ],
  },
  map: [0.68, 0.36],
};
