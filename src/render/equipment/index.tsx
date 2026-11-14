"use client";
import type { ComponentType } from "react";
import type { EquipDef, EquipKind } from "@/sim/types";
import { Selectable } from "../parts";
import { Compressor, Conveyor, Packer, Press, Robot } from "./factory";
import { Breaker, FanBank, Feeder, Source, Transformer } from "./substation";

/** 3D model for each equipment kind. */
export const EQUIPMENT: Partial<Record<EquipKind, ComponentType<{ def: EquipDef }>>> = {
  source: Source,
  breaker: Breaker,
  transformer: Transformer,
  fan: FanBank,
  feeder: Feeder,
  robot: Robot,
  conveyor: Conveyor,
  press: Press,
  packer: Packer,
};

/** Alternative models selected with `visual.model`, for equipment that reuses a generic sim kind. */
export const MODEL_OVERRIDES: Record<string, ComponentType<{ def: EquipDef }>> = {
  compressor: Compressor,
};

export function EquipmentLayer({ equipment }: { equipment: EquipDef[] }) {
  return (
    <>
      {equipment.map((e) => {
        const Model = MODEL_OVERRIDES[String(e.visual?.model ?? "")] ?? EQUIPMENT[e.kind];
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
