"use client";
import type { ComponentType } from "react";
import type { EnvironmentId, MissionDef } from "@/sim/types";
import { Desert } from "./Desert";
import { Grid } from "./Grid";

/** Scenery for each environment. Missing entries render nothing (mission not yet built). */
export const ENVIRONMENTS: Partial<Record<EnvironmentId, ComponentType<{ mission: MissionDef }>>> = {
  desert: Desert,
  grid: Grid,
};
