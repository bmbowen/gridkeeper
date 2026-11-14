import type { MissionDef } from "../types";
import { level1 } from "./level1";
import { level5 } from "./level5";

/** Campaign missions in order. Only fully implemented missions are listed here. */
export const CAMPAIGN: MissionDef[] = [level1, level5];

export function missionById(id: string): MissionDef | undefined {
  return CAMPAIGN.find((m) => m.id === id);
}
