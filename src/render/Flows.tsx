"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { EnvironmentId, MissionDef } from "@/sim/types";
import { viewFx } from "@/state/fx";
import { portOf } from "./equipment/ports";
import { MAT } from "./materials";
import { Tube } from "./parts";
import { catenary, game, rotY } from "./util";

export type FlowStyle = "wire" | "pipe" | "none";
export const FLOW_STYLE: Record<EnvironmentId, FlowStyle> = { desert: "wire", water: "pipe", plant: "pipe", factory: "none", grid: "none" };

interface Flow {
  from: string;
  to: string;
  curves: THREE.Curve<THREE.Vector3>[];
  style: FlowStyle;
}

const PULSES = 2;

/**
 * Draws the physical connections between equipment (conductors or pipes) from each unit's
 * `inputs`, and animates energy / fluid moving along them according to the simulation.
 */
export function Flows({ mission }: { mission: MissionDef }) {
  const flows = useMemo(() => {
    const byId = Object.fromEntries(mission.equipment.map((e) => [e.id, e]));
    const out: Flow[] = [];
    for (const e of mission.equipment) {
      const style = (e.visual?.flow as FlowStyle | undefined) ?? FLOW_STYLE[mission.environment];
      if (style === "none") continue;
      for (const id of e.inputs ?? []) {
        const src = byId[id];
        const ps = portOf(src.kind);
        const pd = portOf(e.kind);
        const curves: THREE.Curve<THREE.Vector3>[] = [];
        const phases = style === "wire" ? [-1, 0, 1] : [0];
        for (const ph of phases) {
          const o = rotY([ps.out[0], ps.out[1], ps.out[2] + ph * (ps.spread ?? 0)], src.rot ?? 0);
          const i = rotY([pd.in[0], pd.in[1], pd.in[2] + ph * (pd.spread ?? 0)], e.rot ?? 0);
          const a = new THREE.Vector3(src.pos[0] + o[0], src.pos[1] + o[1], src.pos[2] + o[2]);
          const b = new THREE.Vector3(e.pos[0] + i[0], e.pos[1] + i[1], e.pos[2] + i[2]);
          if (style === "wire") curves.push(catenary(a, b, 0.05));
          else {
            // Pipes run out, across, and in with right-angle bends.
            const mx = (a.x + b.x) / 2;
            const pts = Math.abs(a.z - b.z) < 0.5 && Math.abs(a.y - b.y) < 0.3 ? [a, b] : [a, new THREE.Vector3(mx, a.y, a.z), new THREE.Vector3(mx, b.y, b.z), b];
            const path = new THREE.CurvePath<THREE.Vector3>();
            for (let k = 0; k < pts.length - 1; k++) path.add(new THREE.LineCurve3(pts[k], pts[k + 1]));
            curves.push(path);
          }
        }
        out.push({ from: id, to: e.id, curves, style });
      }
    }
    return out;
  }, [mission]);

  const total = flows.reduce((a, f) => a + f.curves.length, 0) * PULSES;
  const mesh = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(FLOW_STYLE[mission.environment] === "pipe" ? "#7fe6ff" : "#fff1c2").multiplyScalar(2.2), transparent: true, opacity: 0.95 });
    m.toneMapped = false;
    return m;
  }, [mission.environment]);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const phase = useRef(0);

  useFrame((_, dt) => {
    const g = game();
    const im = mesh.current;
    if (!g || !im) return;
    phase.current += dt;
    mat.opacity = 0.9 * (1 - viewFx.mix * 0.8);
    let i = 0;
    for (const f of flows) {
      const src = g.equipment[f.from];
      const dst = g.equipment[f.to];
      // Current only flows when the source is live and the consumer is drawing.
      const flow = src.out > 0.05 && !dst.tripped ? Math.max(0.25, Math.min(1.25, dst.out || 0.25)) : 0;
      for (let c = 0; c < f.curves.length; c++) {
        for (let k = 0; k < PULSES; k++) {
          if (flow <= 0) dummy.scale.setScalar(0);
          else {
            const t = (phase.current * 0.35 * flow + k / PULSES + c * 0.11) % 1;
            f.curves[c].getPoint(t, dummy.position);
            if (f.style === "pipe") dummy.position.y += 0.34;
            const s = f.style === "pipe" ? 0.15 : 0.075;
            dummy.scale.setScalar(s * Math.sin(t * Math.PI) * 1.4 + 0.01);
          }
          dummy.updateMatrix();
          im.setMatrixAt(i++, dummy.matrix);
        }
      }
    }
    im.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {flows.map((f) =>
        f.curves.map((c, k) => (
          <Tube key={`${f.from}-${f.to}-${k}`} curve={c} radius={f.style === "pipe" ? 0.3 : 0.045} m={f.style === "pipe" ? MAT.paintTeal : MAT.aluminium} segments={f.style === "pipe" ? 24 : 12} radial={f.style === "pipe" ? 10 : 4} shadow={f.style === "pipe"} />
        )),
      )}
      {total > 0 && (
        <instancedMesh ref={mesh} args={[undefined, undefined, total]} material={mat} frustumCulled={false}>
          <sphereGeometry args={[1, 8, 6]} />
        </instancedMesh>
      )}
    </group>
  );
}
