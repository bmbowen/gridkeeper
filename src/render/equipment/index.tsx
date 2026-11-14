"use client";
import type { ComponentType } from "react";
import type { EnvironmentId, EquipDef, EquipKind } from "@/sim/types";
import { Selectable } from "../parts";
import { Compressor, Conveyor, Packer, Press, Robot } from "./factory";
import { District as CityDistrict, Line, Plant, Substation, WindFarm } from "./grid";
import { Boiler, CoolingPump, CoolingTower, Generator, Turbine } from "./plant";
import { Breaker, FanBank, Feeder, Source, Transformer } from "./substation";
import { Clarifier, District, Doser, Intake, Pump, Tank, Valve } from "./water";

type Model = ComponentType<{ def: EquipDef }>;

/** 3D model for each equipment kind. */
export const EQUIPMENT: Partial<Record<EquipKind, Model>> = {
  source: Source,
  breaker: Breaker,
  transformer: Transformer,
  fan: FanBank,
  feeder: Feeder,
  intake: Intake,
  pump: Pump,
  valve: Valve,
  clarifier: Clarifier,
  doser: Doser,
  tank: Tank,
  district: District,
  boiler: Boiler,
  turbine: Turbine,
  generator: Generator,
  coolingTower: CoolingTower,
  coolingPump: CoolingPump,
  robot: Robot,
  conveyor: Conveyor,
  press: Press,
  packer: Packer,
  plant: Plant,
  windfarm: WindFarm,
  line: Line,
  substation: Substation,
};

/** Kinds that look different depending on the facility they belong to. */
const BY_ENVIRONMENT: Partial<Record<EnvironmentId, Partial<Record<EquipKind, Model>>>> = {
  grid: { district: CityDistrict },
};

/** Alternative models selected with `visual.model`, for equipment that reuses a generic sim kind. */
export const MODEL_OVERRIDES: Record<string, Model> = {
  compressor: Compressor,
};

export function EquipmentLayer({ equipment, environment }: { equipment: EquipDef[]; environment: EnvironmentId }) {
  return (
    <>
      {equipment.map((e) => {
        const Model = MODEL_OVERRIDES[String(e.visual?.model ?? "")] ?? BY_ENVIRONMENT[environment]?.[e.kind] ?? EQUIPMENT[e.kind];
        if (!Model) return null;
        return (
          <group key={e.id} position={e.pos} rotation={[0, e.rot ?? 0, 0]}>
            <Selectable pick={{ type: "equip", id: e.id }}>
              <Model def={e} />
            </Selectable>
          </group>
        );
      })}
    </>
  );
}
