import type { MissionDef } from "../types";
import { level1 } from "./level1";
import { level2 } from "./level2";
import { level3 } from "./level3";
import { level4 } from "./level4";
import { level5 } from "./level5";

/** Campaign missions in order. Only fully implemented missions are listed here. */
export const CAMPAIGN: MissionDef[] = [level1, level2, level3, level4, level5];

export function missionById(id: string): MissionDef | undefined {
  return CAMPAIGN.find((m) => m.id === id);
}
