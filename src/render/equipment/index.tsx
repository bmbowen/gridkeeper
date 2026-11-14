"use client";
import type { ComponentType } from "react";
import type { EquipDef, EquipKind } from "@/sim/types";
import { Selectable } from "../parts";
import { Boiler, CoolingPump, CoolingTower, Generator, Turbine } from "./plant";
import { Breaker, FanBank, Feeder, Source, Transformer } from "./substation";

/** 3D model for each equipment kind. */
export const EQUIPMENT: Partial<Record<EquipKind, ComponentType<{ def: EquipDef }>>> = {
  source: Source,
  breaker: Breaker,
  transformer: Transformer,
  fan: FanBank,
  feeder: Feeder,
  boiler: Boiler,
  turbine: Turbine,
  generator: Generator,
  coolingTower: CoolingTower,
  coolingPump: CoolingPump,
};

export function EquipmentLayer({ equipment }: { equipment: EquipDef[] }) {
  return (
    <>
      {equipment.map((e) => {
        const Model = EQUIPMENT[e.kind];
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
