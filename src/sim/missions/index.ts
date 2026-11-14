import type { MissionDef } from "../types";
import { level1 } from "./level1";
import { level3 } from "./level3";

/** Campaign missions in order. Only fully implemented missions are listed here. */
export const CAMPAIGN: MissionDef[] = [level1, level3];

export function missionById(id: string): MissionDef | undefined {
  return CAMPAIGN.find((m) => m.id === id);
}
