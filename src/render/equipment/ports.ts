import type { EquipKind, Vec3 } from "@/sim/types";

/**
 * Where conductors / pipes attach on each equipment model, in the model's local space
 * (before its Y rotation). `spread` is the Z spacing of the three phases for wires.
 */
export interface Port {
  in: Vec3;
  out: Vec3;
  spread?: number;
}

export const DEFAULT_PORT: Port = { in: [-1.2, 2, 0], out: [1.2, 2, 0], spread: 0 };

export const PORTS: Partial<Record<EquipKind, Port>> = {
  source: { in: [-2, 8, 0], out: [1.2, 8.1, 0], spread: 2.6 },
  breaker: { in: [-1.25, 4.35, 0], out: [1.25, 4.35, 0], spread: 1.5 },
  transformer: { in: [-1.5, 6.5, 0], out: [1.7, 4.7, 0], spread: 1.1 },
  feeder: { in: [-0.3, 6.3, 0], out: [0.3, 6.3, 0], spread: 1.1 },
  // water
  intake: { in: [-2, 1.2, 0], out: [3, 1.2, 0] },
  pump: { in: [-2.2, 1.1, 0], out: [1.6, 1.1, 0] },
  valve: { in: [-1, 1.1, 0], out: [1, 1.1, 0] },
  clarifier: { in: [-5.2, 1.2, 0], out: [5.2, 1.2, 0] },
  doser: { in: [-1.2, 1.1, 0], out: [1.2, 1.1, 0] },
  tank: { in: [-3.6, 1.1, 0], out: [3.6, 1.1, 0] },
  district: { in: [-3, 1.1, 0], out: [3, 1.1, 0] },
  // generation
  boiler: { in: [-3.2, 2, 0], out: [3.45, 9.5, 0] },
  turbine: { in: [-4.65, 3, 0], out: [4.2, 2.4, 0] },
  generator: { in: [-3, 2.4, 0], out: [1, 6.35, 0], spread: 1 },
  coolingTower: { in: [-7.5, 1.2, 0], out: [7.5, 1.2, 0] },
  coolingPump: { in: [-2.2, 1.1, 0], out: [1.75, 1.1, 0] },
};

export function portOf(kind: EquipKind): Port {
  return PORTS[kind] ?? DEFAULT_PORT;
}
