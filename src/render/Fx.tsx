"use client";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { topology } from "@/sim/engine";
import type { MissionDef, SimEvent } from "@/sim/types";
import { onFx, viewFx } from "@/state/fx";
import { useGame } from "@/state/game";
import { Label } from "./parts";
import { equipState, NODE_H, PALETTE } from "./util";

const RINGS = 14;

const EVENT_COLOR: Partial<Record<SimEvent["type"], string>> = {
  sensor: PALETTE.cyan,
  harden: "#9fd0ff",
  honeypot: "#ff6bd6",
  isolate: "#ffffff",
  reconnect: PALETTE.cyan,
  suspicious: PALETTE.amber,
  confirmed: PALETTE.red,
  compromised: PALETTE.red,
  implant: PALETTE.red,
  blind: PALETTE.red,
  remediated: PALETTE.green,
  cleared: PALETTE.green,
  trip: PALETTE.red,
  fire: "#ff7a1a",
  restore: PALETTE.green,
  repair: PALETTE.green,
  setpoint: PALETTE.amber,
  eliminated: PALETTE.green,
  segment: PALETTE.violet,
  unsegment: PALETTE.cyan,
};

/** Expanding ring bursts that confirm every meaningful action or event in the world. */
export function EventBursts({ mission }: { mission: MissionDef }) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const pool = useMemo(
    () =>
      Array.from({ length: RINGS }, () => {
        const m = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
        m.toneMapped = false;
        return { mat: m, life: 0, max: 1, size: 4 };
      }),
    [],
  );
  const next = useRef(0);

  useEffect(() => {
    const topo = topology(mission);
    return onFx((e) => {
      if (e.type === "win" || e.type === "lose") {
        // Site-wide pulse for the end-of-mission sequence.
        for (let k = 0; k < 5; k++) {
          const i = next.current++ % RINGS;
          const mesh = refs.current[i];
          if (!mesh) continue;
          pool[i].mat.color.set(e.type === "win" ? PALETTE.green : PALETTE.red).multiplyScalar(3);
          pool[i].life = -k * 0.3;
          pool[i].max = 1.8;
          pool[i].size = 60;
          mesh.position.set(mission.camera.target[0], 0.4, mission.camera.target[2]);
        }
        return;
      }
      const color = EVENT_COLOR[e.type];
      if (!color) return;
      let p: [number, number, number] | null = null;
      let y = 0.25;
      let size = 5;
      if ("node" in e && topo.node[e.node]) {
        p = topo.node[e.node].pos;
        // Compromise is invisible unless the defender can see it.
        if (e.type === "compromised") return;
        y = viewFx.mix > 0.5 ? NODE_H : 0.25;
        size = 5.5;
      } else if ("equip" in e && topo.equip[e.equip]) {
        p = topo.equip[e.equip].pos;
        size = 7;
      } else if ("link" in e && topo.link[e.link]) {
        const l = topo.link[e.link];
        const a = topo.node[l.a].pos;
        const b = topo.node[l.b].pos;
        p = [(a[0] + b[0]) / 2, 0, (a[2] + b[2]) / 2];
        y = NODE_H + 1;
      }
      if (!p) return;
      for (let k = 0; k < 2; k++) {
        const i = next.current++ % RINGS;
        const r = pool[i];
        const mesh = refs.current[i];
        if (!mesh) continue;
        r.mat.color.set(color).multiplyScalar(2.6);
        r.life = -k * 0.14;
        r.max = 0.9;
        r.size = size * (1 + k * 0.35);
        mesh.position.set(p[0], p[1] + y, p[2]);
      }
    });
  }, [mission, pool]);

  useFrame((_, dt) => {
    for (let i = 0; i < RINGS; i++) {
      const r = pool[i];
      const mesh = refs.current[i];
      if (!mesh) continue;
      if (r.life >= r.max) {
        mesh.visible = false;
        continue;
      }
      r.life += dt;
      const t = Math.max(0, r.life / r.max);
      mesh.visible = r.life > 0;
      const e = 1 - Math.pow(1 - t, 3);
      mesh.scale.setScalar(0.3 + e * r.size);
      r.mat.opacity = (1 - t) * 0.95;
    }
  });

  return (
    <>
      {pool.map((r, i) => (
        <mesh key={i} ref={(el) => void (refs.current[i] = el)} material={r.mat} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={15}>
          <ringGeometry args={[0.9, 1, 48]} />
        </mesh>
      ))}
    </>
  );
}

function Marker({ kind }: { kind: "hover" | "select" }) {
  const ref = useRef<THREE.Group>(null);
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: kind === "select" ? 0.95 : 0.55 });
    m.toneMapped = false;
    m.color.set(kind === "select" ? "#ffffff" : PALETTE.cyan).multiplyScalar(kind === "select" ? 2.2 : 1.6);
    return m;
  }, [kind]);
  const scale = useRef(0);
  useFrame(({ clock }, dt) => {
    const st = useGame.getState();
    const pick = kind === "select" ? st.selected : st.hovered;
    const g = ref.current;
    if (!g) return;
    const m = st.mission;
    if (!pick || !m || pick.type === "link" || (kind === "hover" && st.selected?.id === pick.id)) {
      g.visible = false;
      scale.current = 0;
      return;
    }
    const topo = topology(m);
    const p = pick.type === "node" ? topo.node[pick.id]?.pos : topo.equip[pick.id]?.pos;
    if (!p) return;
    const r = pick.type === "node" ? 2 : 3.6;
    scale.current = THREE.MathUtils.damp(scale.current, r, 14, dt);
    g.visible = true;
    g.position.set(p[0], p[1] + 0.22, p[2]);
    g.scale.setScalar(scale.current * (1 + Math.sin(clock.elapsedTime * 4) * 0.025));
    g.rotation.y = clock.elapsedTime * (kind === "select" ? 0.7 : 0);
  });
  return (
    <group ref={ref} visible={false}>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} material={mat} rotation={[-Math.PI / 2, 0, (i * Math.PI) / 2]} renderOrder={16}>
          <ringGeometry args={[0.94, 1, 24, 1, 0.12, Math.PI / 2 - 0.24]} />
        </mesh>
      ))}
      {kind === "select" && (
        <mesh material={mat} rotation={[-Math.PI / 2, 0, 0]} renderOrder={16}>
          <ringGeometry args={[1.08, 1.1, 48]} />
        </mesh>
      )}
    </group>
  );
}

export function SelectionMarkers() {
  return (
    <>
      <Marker kind="hover" />
      <Marker kind="select" />
    </>
  );
}

/**
 * Floating call-outs over equipment that needs attention, so trouble in the yard is
 * readable from any camera distance in the physical view.
 */
export function EquipBadges({ mission }: { mission: MissionDef }) {
  return (
    <>
      {mission.equipment.map((e) => {
        const h = e.kind === "feeder" || e.kind === "source" ? 9.5 : 7.6;
        const p: [number, number, number] = [e.pos[0], e.pos[1] + h, e.pos[2]];
        const blink = () => 0.65 + Math.sin(performance.now() / 120) * 0.35;
        return (
          <group key={e.id}>
            <Label text="▲ ABNORMAL COMMANDS" p={p} color="#1a0d00" bg="#ffb020" size={0.8} opacityRef={() => {
              const s = equipState(e.id);
              return s && s.arming && !s.manip && !s.tripped ? blink() : 0;
            }} />
            <Label text="✖ TRIPPED" p={p} color="#ffffff" bg="#c21f2c" size={0.8} opacityRef={() => {
              const s = equipState(e.id);
              return s && s.tripped && s.fire <= 0 ? 0.95 : 0;
            }} />
            <Label text="✖ HIJACKED" p={p} color="#ffffff" bg="#c21f2c" size={0.8} opacityRef={() => {
              const s = equipState(e.id);
              return s && s.manip && !s.tripped ? blink() : 0;
            }} />
            <Label text="▲ OVERHEATING" p={p} color="#1a0d00" bg="#ff7a1a" size={0.8} opacityRef={() => {
              const s = equipState(e.id);
              return s && !s.tripped && !s.manip && !s.arming && s.heat > 0.55 ? blink() : 0;
            }} />
            <Label text="✖ FIRE" p={p} color="#ffffff" bg="#e0641c" size={0.9} opacityRef={() => {
              const s = equipState(e.id);
              return s && s.fire > 0 ? blink() : 0;
            }} />
            <Label text="▲ OVERLOAD" p={[p[0], p[1] + 1.4, p[2]]} color="#1a0d00" bg="#ffb020" size={0.8} opacityRef={() => {
              const s = equipState(e.id);
              return s && !s.tripped && s.load > 1.1 ? blink() : 0;
            }} />
          </group>
        );
      })}
    </>
  );
}
