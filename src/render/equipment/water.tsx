"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Vec3 } from "@/sim/types";
import { viewFx } from "@/state/fx";
import { GEO, MAT } from "../materials";
import { Beam, Box, Cyl, HeatPlume, Label, Lamp, Pad, Particles, Spinner } from "../parts";
import { equipState, PALETTE } from "../util";
import { equipLamp, LitBuildings, type EquipProps } from "./substation";

const waterClean = new THREE.Color("#1c7f9c");
const waterMurky = new THREE.Color("#6a5a34");

/** Additive glow shell whose opacity is polled every frame (overheat, bad chemistry...). */
function useGlow(color: string) {
  return useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    m.toneMapped = false;
    return m;
  }, [color]);
}

/** Flanged pipe stub along local X between x0 and x1. */
function PipeStub({ x0, x1, y = 1.1, z = 0, r = 0.3, m = MAT.paintTeal }: { x0: number; x1: number; y?: number; z?: number; r?: number; m?: THREE.Material }) {
  return (
    <group>
      <Cyl p={[(x0 + x1) / 2, y, z]} s={[r, Math.abs(x1 - x0), r]} r={[0, 0, Math.PI / 2]} m={m} />
      <Cyl p={[x0, y, z]} s={[r * 1.45, 0.1, r * 1.45]} r={[0, 0, Math.PI / 2]} m={MAT.steel} />
      <Cyl p={[x1, y, z]} s={[r * 1.45, 0.1, r * 1.45]} r={[0, 0, Math.PI / 2]} m={MAT.steel} />
    </group>
  );
}

/** Small local control panel with the standard status lamp. */
function LocalPanel({ p, id }: { p: Vec3; id: string }) {
  return (
    <group position={p}>
      <Beam a={[0, 0, 0]} b={[0, 1.1, 0]} radius={0.05} m={MAT.galvanized} />
      <Box p={[0, 1.4, 0]} s={[0.6, 0.7, 0.3]} m={MAT.paintLight} />
      <Lamp p={[0, 1.9, 0]} state={equipLamp(id)} />
    </group>
  );
}

// ------------------------------------------------------------------ river intake

export function Intake({ def }: EquipProps) {
  return (
    <group>
      {/* intake deck reaching out over the bank */}
      <Box p={[-2.5, 0.35, 0]} s={[9, 0.7, 6]} m={MAT.concrete} />
      <Box p={[-7.2, 0.25, 0]} s={[0.5, 0.5, 6.6]} m={MAT.concreteDark} />
      {/* screen house */}
      <Box p={[-1.5, 2, 0]} s={[4, 2.6, 3.6]} m={MAT.wall} />
      <Box p={[-1.5, 3.4, 0]} s={[4.4, 0.2, 4]} m={MAT.wallDark} />
      <Box p={[-1.5, 1.8, 1.82]} s={[1.2, 2, 0.06]} m={MAT.paintBlue} shadow={false} />
      {/* travelling bar screens on the river side */}
      {[-1.7, 0, 1.7].map((z) => (
        <group key={z} position={[-5.4, 0.7, z]} rotation={[0, 0, 0.22]}>
          <Box p={[0, 1.3, 0]} s={[0.25, 3.4, 1.3]} m={MAT.darkSteel} />
          {[-0.45, -0.15, 0.15, 0.45].map((b) => (
            <Box key={b} p={[-0.16, 1.1, b]} s={[0.05, 3, 0.05]} m={MAT.galvanized} shadow={false} />
          ))}
          <Spinner p={[0, 3.1, 0]} axis="z" speed={() => (equipState(def.id)?.out ?? 0) * 1.5}>
            <Cyl s={[0.3, 1.2, 0.3]} r={[Math.PI / 2, 0, 0]} m={MAT.paintYellow} low />
          </Spinner>
        </group>
      ))}
      {/* hoist gantry */}
      <Beam a={[-4.4, 0.7, -2.6]} b={[-4.4, 5, -2.6]} radius={0.1} m={MAT.paintYellow} square />
      <Beam a={[-4.4, 0.7, 2.6]} b={[-4.4, 5, 2.6]} radius={0.1} m={MAT.paintYellow} square />
      <Beam a={[-4.4, 5, -3]} b={[-4.4, 5, 3]} radius={0.14} m={MAT.paintYellow} square />
      <Box p={[-4.4, 4.6, 0.8]} s={[0.5, 0.5, 0.6]} m={MAT.darkSteel} />
      {/* handrail */}
      {[-2.9, 2.9].map((z) => (
        <group key={z}>
          <Beam a={[-6.8, 1.7, z]} b={[1.8, 1.7, z]} radius={0.03} m={MAT.hazard} shadow={false} />
          {[-6.8, -4, -1, 1.8].map((x) => (
            <Beam key={x} a={[x, 0.7, z]} b={[x, 1.7, z]} radius={0.03} m={MAT.hazard} shadow={false} />
          ))}
        </group>
      ))}
      {/* discharge header */}
      <PipeStub x0={0.5} x1={3} r={0.36} />
      <Lamp p={[0.6, 3.75, 1.9]} state={equipLamp(def.id)} />
      {/* churn where water is drawn in */}
      <Particles p={[-8.4, 0.25, 0]} count={24} rate={() => (equipState(def.id)?.out ?? 0) * 9} color="#cfeff5" size={[0.5, 1.4]} life={[0.8, 1.6]} velocity={[0.6, 0.3, 0]} jitter={0.9} radius={2.4} opacity={0.4} />
    </group>
  );
}

// ------------------------------------------------------------------ centrifugal pump

export function Pump({ def }: EquipProps) {
  const body = useRef<THREE.Group>(null);
  const glow = useGlow("#ff5a1a");
  useFrame(({ clock }) => {
    const s = equipState(def.id);
    if (!s || !body.current) return;
    const over = s.out > 1.05;
    // An overdriven pump visibly shakes on its skid.
    const shake = over ? 0.035 : s.out > 0.05 ? 0.004 : 0;
    body.current.position.set(Math.sin(clock.elapsedTime * 71) * shake, Math.sin(clock.elapsedTime * 53) * shake, Math.cos(clock.elapsedTime * 67) * shake);
    const h = Math.max(0, (s.heat - 0.3) / 0.7);
    glow.opacity = h * (0.3 + Math.sin(clock.elapsedTime * 7) * 0.08) * (1 - viewFx.mix * 0.5);
  });
  const speed = () => {
    const s = equipState(def.id);
    return s ? s.out * 20 : 0;
  };
  return (
    <group>
      <Pad s={[5.4, 5.2]} />
      <Box p={[0, 0.34, 0.9]} s={[2.4, 0.28, 4.4]} m={MAT.darkSteel} />
      <group ref={body}>
        {/* volute casing, axis along Z */}
        <Cyl p={[0, 1.1, 0]} s={[0.95, 0.7, 0.95]} r={[Math.PI / 2, 0, 0]} m={MAT.paintBlue} />
        <Cyl p={[0, 1.1, -0.4]} s={[0.6, 0.2, 0.6]} r={[Math.PI / 2, 0, 0]} m={MAT.steel} />
        <mesh material={MAT.steel} position={[0, 1.1, 0.36]} castShadow>
          <torusGeometry args={[0.82, 0.07, 6, 20]} />
        </mesh>
        <PipeStub x0={-2.2} x1={-0.85} />
        <PipeStub x0={0.85} x1={1.6} />
        {/* bearing housing + spinning coupling under a mesh guard */}
        <Box p={[0, 0.75, 0.9]} s={[0.55, 0.6, 0.5]} m={MAT.paintBlue} />
        <Spinner p={[0, 1.1, 1.05]} axis="z" speed={speed}>
          <Cyl s={[0.3, 0.5, 0.3]} r={[Math.PI / 2, 0, 0]} m={MAT.steel} low />
          {[0, 1, 2, 3].map((i) => (
            <Box key={i} p={[Math.cos((i * Math.PI) / 2) * 0.24, Math.sin((i * Math.PI) / 2) * 0.24, 0]} s={[0.1, 0.1, 0.56]} m={MAT.paintYellow} shadow={false} />
          ))}
        </Spinner>
        <Beam a={[-0.4, 1.55, 0.8]} b={[-0.4, 1.55, 1.3]} radius={0.02} m={MAT.hazard} shadow={false} />
        <Beam a={[0.4, 1.55, 0.8]} b={[0.4, 1.55, 1.3]} radius={0.02} m={MAT.hazard} shadow={false} />
        {/* motor with cooling fins */}
        <Cyl p={[0, 1.1, 2.35]} s={[0.66, 2, 0.66]} r={[Math.PI / 2, 0, 0]} m={MAT.paintGrey} />
        {[1.6, 1.9, 2.2, 2.5, 2.8, 3.1].map((z) => (
          <Cyl key={z} p={[0, 1.1, z]} s={[0.73, 0.07, 0.73]} r={[Math.PI / 2, 0, 0]} m={MAT.darkSteel} shadow={false} />
        ))}
        <Cyl p={[0, 1.1, 3.45]} s={[0.7, 0.24, 0.7]} r={[Math.PI / 2, 0, 0]} m={MAT.blackMetal} />
        <Box p={[0, 1.95, 2.3]} s={[0.5, 0.36, 0.6]} m={MAT.paintGrey} />
        <Box p={[0, 0.55, 2.35]} s={[1.2, 0.2, 1.7]} m={MAT.darkSteel} />
        <mesh material={glow} position={[0, 1.1, 1.6]} scale={[1.15, 1.15, 2.9]} geometry={GEO.sphere} />
      </group>
      <LocalPanel p={[1.9, 0.2, 2]} id={def.id} />
      <HeatPlume p={[0, 1.9, 1.8]} heat={() => equipState(def.id)?.heat ?? 0} fire={() => equipState(def.id)?.fire ?? 0} />
    </group>
  );
}

// ------------------------------------------------------------------ motor-operated valve

export function Valve({ def }: EquipProps) {
  const wheel = useRef<THREE.Group>(null);
  const stem = useRef<THREE.Group>(null);
  const open = useRef(1);
  const plate = useMemo(() => {
    const m = new THREE.MeshBasicMaterial();
    m.toneMapped = false;
    return m;
  }, []);
  useFrame(({ clock }, dt) => {
    const s = equipState(def.id);
    if (!s) return;
    const target = s.tripped || (s.manip && s.out < 0.05) ? 0 : 1;
    const prev = open.current;
    open.current = THREE.MathUtils.damp(prev, target, 2.5, dt);
    // The handwheel turns while the stem travels.
    if (wheel.current) wheel.current.rotation.y += (open.current - prev) * 30;
    if (stem.current) stem.current.position.y = open.current * 0.35;
    const shut = open.current < 0.5;
    plate.color.set(shut ? PALETTE.red : PALETTE.green).multiplyScalar(shut ? (Math.sin(clock.elapsedTime * 10) > 0 ? 3 : 0.5) : 1.8);
  });
  return (
    <group>
      <Pad s={[2.6, 2.4]} />
      <PipeStub x0={-1} x1={1} r={0.32} />
      <mesh geometry={GEO.sphere} material={MAT.paintBlue} position={[0, 1.1, 0]} scale={[0.55, 0.55, 0.55]} castShadow />
      <Cyl p={[0, 1.75, 0]} s={[0.22, 0.8, 0.22]} m={MAT.paintBlue} />
      <Beam a={[-0.25, 1.7, 0]} b={[-0.25, 2.7, 0]} radius={0.04} m={MAT.steel} />
      <Beam a={[0.25, 1.7, 0]} b={[0.25, 2.7, 0]} radius={0.04} m={MAT.steel} />
      <group ref={stem}>
        <Cyl p={[0, 2.5, 0]} s={[0.05, 1.3, 0.05]} m={MAT.aluminium} low />
      </group>
      {/* electric actuator */}
      <Box p={[0, 2.95, 0]} s={[0.8, 0.55, 0.6]} m={MAT.paintYellow} />
      <Cyl p={[0.6, 2.95, 0]} s={[0.22, 0.5, 0.22]} r={[0, 0, Math.PI / 2]} m={MAT.darkSteel} />
      <mesh material={plate} position={[0, 2.95, 0.31]}>
        <planeGeometry args={[0.5, 0.22]} />
      </mesh>
      <group ref={wheel} position={[0, 3.4, 0]}>
        <mesh material={MAT.paintRed} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <torusGeometry args={[0.42, 0.045, 6, 20]} />
        </mesh>
        <Box s={[0.84, 0.05, 0.05]} m={MAT.paintRed} shadow={false} />
        <Box s={[0.05, 0.05, 0.84]} m={MAT.paintRed} shadow={false} />
      </group>
      <Lamp p={[-0.5, 3.35, 0.2]} state={equipLamp(def.id)} />
    </group>
  );
}

// ------------------------------------------------------------------ circular clarifier

export function Clarifier({ def }: EquipProps) {
  const R = 5;
  const water = useMemo(() => new THREE.MeshStandardMaterial({ color: waterClean, roughness: 0.12, metalness: 0.35, transparent: true, opacity: 0.9 }), []);
  const murk = useRef(0);
  useFrame((_, dt) => {
    const s = equipState(def.id);
    if (!s) return;
    // A stalled scraper lets sludge build up: the basin turns brown.
    const stalled = s.tripped || s.manip || s.out < 0.05;
    murk.current = THREE.MathUtils.damp(murk.current, stalled ? 1 : 0, stalled ? 0.35 : 0.2, dt);
    water.color.copy(waterClean).lerp(waterMurky, murk.current);
  });
  const posts = useMemo(() => Array.from({ length: 12 }, (_, i) => (i / 12) * Math.PI * 2), []);
  return (
    <group>
      <Cyl p={[0, 0.1, 0]} s={[R + 0.9, 0.2, R + 0.9]} m={MAT.concrete} shadow={false} />
      {/* basin wall */}
      <mesh material={MAT.concrete} position={[0, 0.8, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[R, R, 1.4, 40, 1, true]} />
      </mesh>
      <mesh material={MAT.concreteDark} position={[0, 0.8, 0]}>
        <cylinderGeometry args={[R - 0.3, R - 0.3, 1.4, 40, 1, true]} />
      </mesh>
      <mesh material={MAT.concrete} position={[0, 1.5, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <ringGeometry args={[R - 0.3, R, 40]} />
      </mesh>
      <mesh material={MAT.concreteDark} position={[0, 0.22, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[R - 0.3, 40]} />
      </mesh>
      {/* water surface and inner launder weir */}
      <mesh material={water} position={[0, 1.28, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[R - 0.3, 40]} />
      </mesh>
      <mesh material={MAT.galvanized} position={[0, 1.3, 0]}>
        <cylinderGeometry args={[R - 0.9, R - 0.9, 0.24, 40, 1, true]} />
      </mesh>
      {/* centre column and feed well */}
      <Cyl p={[0, 1.1, 0]} s={[0.45, 2.2, 0.45]} m={MAT.concrete} />
      <mesh material={MAT.galvanized} position={[0, 1.35, 0]}>
        <cylinderGeometry args={[1.2, 1.2, 0.5, 20, 1, true]} />
      </mesh>
      {/* rotating half-bridge with walkway, rails and scraper arms */}
      <Spinner p={[0, 0, 0]} axis="y" speed={() => (equipState(def.id)?.out ?? 0) * 0.32}>
        <Box p={[R / 2, 2.05, 0]} s={[R + 0.4, 0.14, 1]} m={MAT.galvanized} />
        <Beam a={[0, 2.75, -0.5]} b={[R + 0.2, 2.75, -0.5]} radius={0.03} m={MAT.hazard} shadow={false} />
        <Beam a={[0, 2.75, 0.5]} b={[R + 0.2, 2.75, 0.5]} radius={0.03} m={MAT.hazard} shadow={false} />
        {[0.2, 1.8, 3.4, R + 0.2].map((x) => (
          <group key={x}>
            <Beam a={[x, 2.1, -0.5]} b={[x, 2.75, -0.5]} radius={0.03} m={MAT.hazard} shadow={false} />
            <Beam a={[x, 2.1, 0.5]} b={[x, 2.75, 0.5]} radius={0.03} m={MAT.hazard} shadow={false} />
          </group>
        ))}
        <Beam a={[1.6, 2, 0]} b={[1.6, 0.5, 0]} radius={0.05} m={MAT.darkSteel} />
        <Beam a={[3.8, 2, 0]} b={[3.8, 0.5, 0]} radius={0.05} m={MAT.darkSteel} />
        <Box p={[2.7, 1.3, 0.2]} s={[3.6, 0.06, 0.3]} m={MAT.darkSteel} shadow={false} />
        {/* end carriage riding the wall */}
        <Box p={[R - 0.15, 1.78, 0]} s={[0.5, 0.4, 1.3]} m={MAT.paintYellow} />
        {/* drive */}
        <Box p={[0, 2.5, 0]} s={[0.9, 0.7, 0.9]} m={MAT.paintBlue} />
        <Cyl p={[0, 3.05, 0]} s={[0.3, 0.5, 0.3]} m={MAT.paintGrey} />
      </Spinner>
      {/* perimeter handrail */}
      {posts.map((a) => (
        <Beam key={a} a={[Math.cos(a) * (R - 0.1), 1.5, Math.sin(a) * (R - 0.1)]} b={[Math.cos(a) * (R - 0.1), 2.3, Math.sin(a) * (R - 0.1)]} radius={0.025} m={MAT.galvanized} shadow={false} />
      ))}
      <mesh material={MAT.galvanized} position={[0, 2.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[R - 0.1, 0.025, 4, 48]} />
      </mesh>
      {/* inlet / outlet stubs line up with the pipe run */}
      <PipeStub x0={-R - 0.2} x1={-R + 0.5} />
      <PipeStub x0={R - 0.5} x1={R + 0.2} />
      <LocalPanel p={[R * 0.72, 0.2, R * 0.86]} id={def.id} />
    </group>
  );
}

// ------------------------------------------------------------------ chlorine dosing skid

export function Doser({ def }: EquipProps) {
  const glow = useGlow("#b6ff3a");
  const liquid = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: "#d9c84a" });
    m.toneMapped = false;
    return m;
  }, []);
  const strokes = useRef<(THREE.Mesh | null)[]>([]);
  useFrame(({ clock }) => {
    const s = equipState(def.id);
    if (!s) return;
    const bad = s.manip && !s.tripped;
    glow.opacity = bad ? 0.35 + Math.sin(clock.elapsedTime * 9) * 0.25 : 0;
    liquid.color.set(bad ? "#b6ff3a" : "#d9c84a").multiplyScalar(bad ? 2.4 + Math.sin(clock.elapsedTime * 9) : 0.9);
    // Metering pump diaphragms stroke in time with the dose rate (wildly when tampered with).
    const rate = bad ? 26 : s.out * 7;
    strokes.current.forEach((m, i) => {
      if (m) m.position.y = 0.95 + Math.max(0, Math.sin(clock.elapsedTime * rate + i * 2)) * 0.14 * (s.out > 0.05 || bad ? 1 : 0);
    });
  });
  return (
    <group>
      <Pad s={[4.6, 6]} />
      {/* bund wall */}
      {[
        [0, -2.8, 4.4, 0.16],
        [0, 2.8, 4.4, 0.16],
        [2.12, 0, 0.16, 5.6],
        [-2.12, 0, 0.16, 5.6],
      ].map(([x, z, w, d], i) => (
        <Box key={i} p={[x, 0.38, z]} s={[w, 0.36, d]} m={MAT.hazard} shadow={false} />
      ))}
      <PipeStub x0={-1.2} x1={1.2} r={0.32} />
      {/* day tanks */}
      {[-1, 1].map((x) => (
        <group key={x} position={[x * 0.95, 0, -1.7]}>
          <Cyl p={[0, 1.55, 0]} s={[0.78, 2.5, 0.78]} m={MAT.paintLight} />
          <mesh geometry={GEO.sphere} material={MAT.paintLight} position={[0, 2.8, 0]} scale={[0.78, 0.3, 0.78]} castShadow />
          <Box p={[0, 1.5, 0.8]} s={[0.14, 2, 0.04]} m={MAT.blackMetal} shadow={false} />
          <mesh material={liquid} position={[0, 1.25, 0.83]}>
            <planeGeometry args={[0.08, 1.4]} />
          </mesh>
          <mesh material={glow} position={[0, 1.6, 0]} scale={[0.9, 1.5, 0.9]} geometry={GEO.sphereLow} />
          <Box p={[0, 2.1, 0.79]} s={[0.5, 0.5, 0.02]} m={MAT.hazard} shadow={false} />
          <Beam a={[0, 2.9, 0]} b={[0, 2.9, 1.2]} radius={0.04} m={MAT.paintYellow} shadow={false} />
        </group>
      ))}
      {/* metering pumps and injection manifold */}
      {[-0.9, 0, 0.9].map((x, i) => (
        <group key={x} position={[x, 0, 1.5]}>
          <Box p={[0, 0.55, 0]} s={[0.5, 0.5, 0.7]} m={MAT.paintGreen} />
          <mesh ref={(el) => void (strokes.current[i] = el)} geometry={GEO.cyl8} material={MAT.steel} position={[0, 0.95, 0]} scale={[0.14, 0.3, 0.14]} />
          <Beam a={[0, 0.8, -0.3]} b={[0, 1.45, -1.3]} radius={0.035} m={MAT.paintYellow} shadow={false} />
        </group>
      ))}
      <Beam a={[-0.9, 1.45, 0.2]} b={[0.9, 1.45, 0.2]} radius={0.04} m={MAT.paintYellow} shadow={false} />
      <Beam a={[0, 1.45, 0.2]} b={[0, 1.1, 0]} radius={0.04} m={MAT.paintYellow} shadow={false} />
      {/* sunshade canopy */}
      {[
        [-2, -2.6],
        [2, -2.6],
        [-2, 2.6],
        [2, 2.6],
      ].map(([x, z], i) => (
        <Beam key={i} a={[x, 0.2, z]} b={[x, 3.9, z]} radius={0.06} m={MAT.galvanized} />
      ))}
      <Box p={[0, 4, 0]} s={[4.6, 0.1, 5.8]} r={[0, 0, 0.05]} m={MAT.paintTeal} />
      <LocalPanel p={[1.6, 0.2, 2.2]} id={def.id} />
      {/* off-gas when the dose runs away */}
      <Particles p={[0, 2.9, -1.7]} count={26} rate={() => (equipState(def.id)?.manip && !equipState(def.id)?.tripped ? 12 : 0)} color="#c8ff5a" intensity={1.6} size={[0.8, 3.2]} life={[1.5, 3]} velocity={[0.4, 1.3, 0]} radius={1} opacity={0.45} drift={1} />
    </group>
  );
}

// ------------------------------------------------------------------ tanks: clearwell and elevated tower

/** External level gauge: a lit column that follows the tank's fill level. */
function LevelGauge({ id, p, height, width = 0.34 }: { id: string; p: Vec3; height: number; width?: number }) {
  const fill = useRef<THREE.Mesh>(null);
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial();
    m.toneMapped = false;
    return m;
  }, []);
  const shown = useRef(0.7);
  useFrame(({ clock }, dt) => {
    const s = equipState(id);
    if (!s || !fill.current) return;
    shown.current = THREE.MathUtils.damp(shown.current, s.level, 4, dt);
    const l = Math.max(0.015, shown.current);
    fill.current.scale.y = l * height;
    fill.current.position.y = (l * height) / 2;
    const low = shown.current < 0.25;
    mat.color.set(low ? PALETTE.red : shown.current < 0.5 ? PALETTE.amber : PALETTE.cyan).multiplyScalar(low ? (Math.sin(clock.elapsedTime * 9) > 0 ? 3 : 0.8) : 2);
  });
  return (
    <group position={p}>
      <Box p={[0, height / 2, -0.03]} s={[width + 0.16, height + 0.2, 0.06]} m={MAT.blackMetal} shadow={false} />
      <mesh ref={fill} material={mat} scale={[width, 1, 1]}>
        <planeGeometry />
      </mesh>
      {[0.25, 0.5, 0.75].map((t) => (
        <Box key={t} p={[width / 2 + 0.12, t * height, 0]} s={[0.14, 0.03, 0.03]} m={MAT.aluminium} shadow={false} />
      ))}
    </group>
  );
}

function Clearwell({ def }: EquipProps) {
  const R = 3.3;
  const H = 4.6;
  const rungs = useMemo(() => Array.from({ length: 11 }, (_, i) => 0.5 + i * 0.4), []);
  return (
    <group>
      <Cyl p={[0, 0.1, 0]} s={[R + 0.6, 0.2, R + 0.6]} m={MAT.concrete} shadow={false} />
      <mesh material={MAT.paintLight} position={[0, 0.2 + H / 2, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[R, R, H, 36]} />
      </mesh>
      {[1.2, 2.4, 3.6].map((y) => (
        <mesh key={y} material={MAT.paintGrey} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[R + 0.01, 0.05, 4, 40]} />
        </mesh>
      ))}
      <mesh material={MAT.paintGrey} position={[0, 0.2 + H, 0]} scale={[R, 0.9, R]} castShadow>
        <sphereGeometry args={[1, 28, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
      </mesh>
      <Cyl p={[0, H + 1.2, 0]} s={[0.3, 0.4, 0.3]} m={MAT.steel} low />
      {/* ladder with cage hoops */}
      <group position={[0, 0.2, R + 0.12]}>
        <Beam a={[-0.25, 0, 0]} b={[-0.25, H + 0.3, 0]} radius={0.03} m={MAT.galvanized} shadow={false} />
        <Beam a={[0.25, 0, 0]} b={[0.25, H + 0.3, 0]} radius={0.03} m={MAT.galvanized} shadow={false} />
        {rungs.map((y) => (
          <Box key={y} p={[0, y, 0]} s={[0.5, 0.03, 0.03]} m={MAT.galvanized} shadow={false} />
        ))}
      </group>
      {/* gauge faces the default camera (south-east) */}
      <group rotation={[0, 0.5, 0]}>
        <LevelGauge id={def.id} p={[0, 0.5, R + 0.08]} height={3.8} />
      </group>
      <PipeStub x0={-R - 0.3} x1={-R + 0.2} />
      <PipeStub x0={R - 0.2} x1={R + 0.3} />
      <Lamp p={[0, H + 1.55, 0]} size={0.18} state={equipLamp(def.id)} />
    </group>
  );
}

function WaterTower({ def }: EquipProps) {
  const H = 15;
  const legs = useMemo(() => Array.from({ length: 6 }, (_, i) => (i / 6) * Math.PI * 2 + 0.26), []);
  return (
    <group>
      <Cyl p={[0, 0.1, 0]} s={[5.2, 0.2, 5.2]} m={MAT.concrete} shadow={false} />
      {legs.map((a, i) => {
        const n = legs[(i + 1) % legs.length];
        const foot: Vec3 = [Math.cos(a) * 4.3, 0.2, Math.sin(a) * 4.3];
        const top: Vec3 = [Math.cos(a) * 2.9, H - 1.2, Math.sin(a) * 2.9];
        const nFoot: Vec3 = [Math.cos(n) * 4.3, 0.2, Math.sin(n) * 4.3];
        const mid: Vec3 = [Math.cos(a) * 3.6, H / 2, Math.sin(a) * 3.6];
        const nMid: Vec3 = [Math.cos(n) * 3.6, H / 2, Math.sin(n) * 3.6];
        const nTop: Vec3 = [Math.cos(n) * 2.9, H - 1.2, Math.sin(n) * 2.9];
        return (
          <group key={i}>
            <Beam a={foot} b={top} radius={0.16} m={MAT.paintLight} />
            <Beam a={mid} b={nMid} radius={0.06} m={MAT.paintLight} shadow={false} />
            <Beam a={foot} b={nMid} radius={0.035} m={MAT.steel} shadow={false} />
            <Beam a={mid} b={nTop} radius={0.035} m={MAT.steel} shadow={false} />
            <Beam a={nFoot} b={mid} radius={0.035} m={MAT.steel} shadow={false} />
          </group>
        );
      })}
      {/* riser */}
      <Cyl p={[0, H / 2 - 0.4, 0]} s={[0.6, H - 1, 0.6]} m={MAT.paintLight} />
      {/* bowl */}
      <mesh geometry={GEO.sphere} material={MAT.paintLight} position={[0, H + 1.3, 0]} scale={[4.6, 3, 4.6]} castShadow />
      <mesh material={MAT.paintTeal} position={[0, H + 1.3, 0]}>
        <cylinderGeometry args={[4.63, 4.63, 0.9, 40, 1, true]} />
      </mesh>
      <mesh material={MAT.galvanized} position={[0, H - 0.2, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[3.5, 0.05, 4, 40]} />
      </mesh>
      <Cyl p={[0, H + 4.5, 0]} s={[0.4, 0.5, 0.4]} m={MAT.steel} low />
      <Lamp p={[0, H + 5, 0]} size={0.24} state={equipLamp(def.id)} />
      {/* level gauges on the riser, readable from most angles */}
      {[0.5, 0.5 + Math.PI].map((r) => (
        <group key={r} rotation={[0, r, 0]}>
          <LevelGauge id={def.id} p={[0, 1.6, 0.66]} height={10} width={0.5} />
        </group>
      ))}
      <PipeStub x0={-3.6} x1={-0.5} />
      <PipeStub x0={0.5} x1={3.6} />
      <Label text="ALDER CREEK" p={[0, H + 6.4, 0]} size={0.75} color="#bfeaf5" opacityRef={() => 0.7 * (1 - viewFx.mix)} />
    </group>
  );
}

export function Tank({ def }: EquipProps) {
  return def.visual?.tower ? <WaterTower def={def} /> : <Clearwell def={def} />;
}

// ------------------------------------------------------------------ distribution district

export function District({ def }: EquipProps) {
  const label = String(def.visual?.label ?? def.name.toUpperCase());
  const variant = label.includes("HOSPITAL") ? "hospital" : label.includes("MILL") ? "works" : "town";
  const power = () => equipState(def.id)?.out ?? 0;
  const jet = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (jet.current) jet.current.scale.y = THREE.MathUtils.damp(jet.current.scale.y, Math.max(0.02, Math.min(1, power())), 3, dt);
  });
  return (
    <group>
      {/* district metering chamber where the trunk main arrives */}
      <Pad s={[3, 3]} p={[-2.2, 0.1, 0]} />
      <PipeStub x0={-3} x1={-1.4} />
      <Box p={[-1.6, 0.9, 0]} s={[1, 1.4, 1.2]} m={MAT.paintBlue} />
      <Lamp p={[-1.6, 1.8, 0]} state={equipLamp(def.id)} />
      <LitBuildings p={[10, 0, 0]} power={power} variant={variant} seed={label.length + 3} spread={variant === "town" ? 9 : 6} count={variant === "town" ? 15 : 6} />
      {/* plaza fountain: its height is the district's water pressure */}
      <group position={[1.5, 0, 3.5]}>
        <Cyl p={[0, 0.2, 0]} s={[1.5, 0.4, 1.5]} m={MAT.concrete} />
        <Cyl p={[0, 0.41, 0]} s={[1.3, 0.02, 1.3]} m={MAT.water} shadow={false} />
        <group ref={jet} position={[0, 0.4, 0]}>
          <Cyl p={[0, 1.3, 0]} s={[0.07, 2.6, 0.07]} m={MAT.water} shadow={false} low />
        </group>
        <Particles p={[0, 2.6, 0]} count={30} rate={() => power() * 26} color="#d6f6ff" size={[0.35, 0.7]} life={[0.5, 0.9]} velocity={[0, 1.2, 0]} jitter={1.6} radius={0.1} gravity={9} opacity={0.6} />
      </group>
      <Label text={label} p={[10, variant === "hospital" ? 11.5 : 8, 0]} size={0.8} color="#d9f3ff" opacityRef={() => 0.85} />
    </group>
  );
}
