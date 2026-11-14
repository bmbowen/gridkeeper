import { BASE_MODS } from "./constants";
import type { Mods } from "./types";

export interface UpgradeDef {
  id: string;
  name: string;
  desc: string;
  /** Cost in commendations (one per star earned, plus one per achievement). */
  cost: number;
  /** Campaign missions that must be completed before it can be bought. */
  requires: number;
  apply: (m: Mods) => void;
}

export const UPGRADES: UpgradeDef[] = [
  { id: "reserve", name: "Contingency Budget", desc: "+120 starting credits on every mission.", cost: 1, requires: 1, apply: (m) => void (m.startBonus += 120) },
  { id: "rapid", name: "Rapid Response Playbooks", desc: "Remediation completes 30% faster.", cost: 1, requires: 1, apply: (m) => void (m.remediateMul *= 0.7) },
  { id: "reclose", name: "Auto-Reclose Relays", desc: "Tripped equipment restores itself after 8 s once its controller is clean or isolated.", cost: 2, requires: 1, apply: (m) => void (m.autoReclose = true) },
  { id: "dpi", name: "Deep Packet Inspection", desc: "Passive sensors also see activity on directly adjacent assets.", cost: 2, requires: 2, apply: (m) => void (m.sensorRange = 1) },
  { id: "analyst", name: "Third Analyst", desc: "One more analyst for parallel investigations and clean-ups.", cost: 2, requires: 2, apply: (m) => void (m.analysts += 1) },
  { id: "golden", name: "Golden Images", desc: "Hardened assets take 4× as long to compromise instead of 2.5×.", cost: 2, requires: 3, apply: (m) => void (m.hardenFactor = 4) },
  { id: "tripwire", name: "Deception Tripwires", desc: "Unlocks decoy services: an intruder that touches one is identified and stalled.", cost: 3, requires: 3, apply: (m) => void (m.honeypot = true) },
  { id: "crew", name: "Third Field Crew", desc: "One more crew for restoring and repairing equipment.", cost: 2, requires: 4, apply: (m) => void (m.crew += 1) },
];

export function modsFor(owned: readonly string[]): Mods {
  const mods: Mods = { ...BASE_MODS };
  for (const u of UPGRADES) if (owned.includes(u.id)) u.apply(mods);
  return mods;
}
