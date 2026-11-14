"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { Vec3 } from "@/sim/types";
import { viewFx } from "@/state/fx";
import { MAT } from "../materials";
import { Arc, Beam, Box, Cyl, HeatPlume, Insulator, Lamp, Pad, Particles, Spinner } from "../parts";
import { equipState, game, PALETTE } from "../util";
import { equipLamp, type EquipProps } from "./substation";

const HX: Vec3 = [0, 0, Math.PI / 2];
const cladding = new THREE.MeshStandardMaterial({ color: "#9aa7b2", metalness: 0.75, roughness: 0.38 });
const casingBlue = new THREE.MeshStandardMaterial({ color: "#1f4f86", metalness: 0.45, roughness: 0.42 });
const genGreen = new THREE.MeshStandardMaterial({ color: "#2c6e63", metalness: 0.4, roughness: 0.45 });
const towerShell = new THREE.MeshStandardMaterial({ color: "#8d9296", roughness: 0.95, side: THREE.DoubleSide });
const stackRed = new THREE.MeshStandardMaterial({ color: "#a8322c", roughness: 0.7 });
const stackWhite = new THREE.MeshStandardMaterial({ color: "#d4d8da", roughness: 0.7 });

/** Horizontal cylinder along local X. */
function HCyl({ p, radius, length, m, low }: { p: Vec3; radius: number; length: number; m: THREE.Material; low?: boolean }) {
  return <Cyl p={p} s={[radius, length, radius]} r={HX} m={m} low={low} />;
}

/** Additive orange shell whose opacity follows a unit's heat. Attach as a child mesh. */
function useHeatGlow(id: string, threshold = 0.3) {
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: "#ff5a1a", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    m.toneMapped = false;
    return m;
  }, []);
  useFrame(({ clock }) => {
    const s = equipState(id);
    if (!s) return;
    const h = Math.max(0, (s.heat - threshold) / (1 - threshold));
    mat.opacity = h * (0.55 + Math.sin(clock.elapsedTime * 6) * 0.14 * h) * (1 - viewFx.mix * 0.5);
  });
  return mat;
}

/** Shakes its group when the equipment is being driven by a hostile controller. */
function useShake(id: string, amount = 0.035) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const s = equipState(id);
    const grp = ref.current;
    if (!s || !grp) return;
    const t = clock.elapsedTime;
    const k = s.manip && !s.tripped ? 1 : s.arming ? 0.35 : s.out > 0.05 ? 0.06 : 0;
    grp.position.set(Math.sin(t * 71) * amount * k, Math.sin(t * 93) * amount * k, Math.sin(t * 57) * amount * k);
  });
  return ref;
}

function Railing({ a, b, y }: { a: [number, number]; b: [number, number]; y: number }) {
  const n = Math.max(2, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
  return (
    <group>
      <Beam a={[a[0], y + 1, a[1]]} b={[b[0], y + 1, b[1]]} radius={0.035} m={MAT.paintYellow} shadow={false} />
      <Beam a={[a[0], y + 0.5, a[1]]} b={[b[0], y + 0.5, b[1]]} radius={0.025} m={MAT.paintYellow} shadow={false} />
      {Array.from({ length: n + 1 }, (_, i) => {
        const t = i / n;
        const x = a[0] + (b[0] - a[0]) * t;
        const z = a[1] + (b[1] - a[1]) * t;
        return <Beam key={i} a={[x, y, z]} b={[x, y + 1, z]} radius={0.03} m={MAT.paintYellow} shadow={false} />;
      })}
    </group>
  );
}

// ------------------------------------------------------------------ boiler with stack

export function Boiler({ def }: EquipProps) {
  const glow = useHeatGlow(def.id, 0.25);
  const shake = useShake(def.id, 0.02);
  const burner = useMemo(() => {
    const m = new THREE.MeshBasicMaterial();
    m.toneMapped = false;
    return m;
  }, []);
  useFrame(({ clock }) => {
    const s = equipState(def.id);
    if (!s) return;
    const fire = Math.min(1.25, s.out);
    const flicker = 0.85 + Math.sin(clock.elapsedTime * 23) * 0.1 + Math.sin(clock.elapsedTime * 37) * 0.05;
    // Over-firing burns white-hot.
    burner.color.set(s.manip && !s.tripped ? "#fff0c0" : "#ff7a1a").multiplyScalar(fire * flicker * (s.manip ? 5 : 2.6) + 0.02);
  });
  const state = () => equipState(def.id);
  return (
    <group>
      <Pad s={[13, 9]} p={[-1.5, 0.1, 0]} />
      <group ref={shake}>
        {/* furnace */}
        <Box p={[0, 5.9, 0]} s={[6, 11.4, 6]} m={cladding} />
        <mesh material={glow} position={[0, 5.9, 0]} scale={[6.12, 11.5, 6.12]}>
          <boxGeometry />
        </mesh>
        {/* buckstays */}
        {[2, 4.2, 6.4, 8.6, 10.8].map((y) => (
          <group key={y}>
            <Box p={[0, y, 3.06]} s={[6.3, 0.22, 0.14]} m={MAT.darkSteel} shadow={false} />
            <Box p={[0, y, -3.06]} s={[6.3, 0.22, 0.14]} m={MAT.darkSteel} shadow={false} />
            <Box p={[3.06, y, 0]} s={[0.14, 0.22, 6.3]} m={MAT.darkSteel} shadow={false} />
            <Box p={[-3.06, y, 0]} s={[0.14, 0.22, 6.3]} m={MAT.darkSteel} shadow={false} />
          </group>
        ))}
        {/* burners on the firing wall */}
        {[
          [-1.4, 2.2],
          [1.4, 2.2],
          [-1.4, 4.4],
          [1.4, 4.4],
        ].map(([z, y], i) => (
          <group key={i} position={[3.08, y, z]}>
            <Cyl s={[0.55, 0.3, 0.55]} r={HX} m={MAT.darkSteel} />
            <mesh material={burner} position={[0.17, 0, 0]} rotation={[0, Math.PI / 2, 0]}>
              <circleGeometry args={[0.36, 16]} />
            </mesh>
          </group>
        ))}
        {/* support steel rising above the furnace, steam drum on top */}
        {[
          [-3.3, -3.3],
          [3.3, -3.3],
          [3.3, 3.3],
          [-3.3, 3.3],
        ].map(([x, z], i) => (
          <Beam key={i} a={[x, 0.2, z]} b={[x, 14, z]} radius={0.16} m={MAT.darkSteel} square />
        ))}
        <Beam a={[-3.3, 14, -3.3]} b={[3.3, 14, -3.3]} radius={0.14} m={MAT.darkSteel} square />
        <Beam a={[-3.3, 14, 3.3]} b={[3.3, 14, 3.3]} radius={0.14} m={MAT.darkSteel} square />
        <Beam a={[-3.3, 14, -3.3]} b={[-3.3, 14, 3.3]} radius={0.14} m={MAT.darkSteel} square />
        <Beam a={[3.3, 14, -3.3]} b={[3.3, 14, 3.3]} radius={0.14} m={MAT.darkSteel} square />
        <Cyl p={[0.6, 12.6, 0]} s={[0.85, 6.6, 0.85]} r={[Math.PI / 2, 0, 0]} m={MAT.paintLight} />
        <Cyl p={[2.2, 10.6, 2.2]} s={[0.2, 3.6, 0.2]} m={MAT.paintLight} low />
        <Cyl p={[2.2, 10.6, -2.2]} s={[0.2, 3.6, 0.2]} m={MAT.paintLight} low />
        {/* main steam outlet stub */}
        <HCyl p={[3.2, 9.5, 0]} radius={0.42} length={0.5} m={MAT.steel} />
        {/* platforms and stair */}
        <Box p={[0, 5.2, 3.9]} s={[7, 0.1, 1.4]} m={MAT.galvanized} />
        <Railing a={[-3.5, 4.6]} b={[3.5, 4.6]} y={5.25} />
        <Box p={[0, 9.6, 3.9]} s={[7, 0.1, 1.4]} m={MAT.galvanized} />
        <Railing a={[-3.5, 4.6]} b={[3.5, 4.6]} y={9.65} />
        <Beam a={[-3.4, 0.2, 4.2]} b={[2.4, 5.2, 4.2]} radius={0.09} m={MAT.galvanized} square />
        <Beam a={[2.4, 5.2, 4.4]} b={[-3.4, 9.6, 4.4]} radius={0.09} m={MAT.galvanized} square />
        {/* flue duct to the stack */}
        <Box p={[-4.2, 10.2, 0]} s={[2.6, 2, 2.6]} m={MAT.paintGrey} />
      </group>
      {/* stack */}
      <group position={[-6.4, 0, 0]}>
        <Cyl p={[0, 0.5, 0]} s={[1.7, 1, 1.7]} m={MAT.concrete} />
        {Array.from({ length: 6 }, (_, i) => (
          <Cyl key={i} p={[0, 3 + i * 4, 0]} s={[1.25 - i * 0.05, 4, 1.25 - i * 0.05]} m={i >= 4 ? (i % 2 ? stackWhite : stackRed) : MAT.paintGrey} />
        ))}
        <Lamp p={[0.95, 24.6, 0]} size={0.22} state={() => ({ color: PALETTE.red, off: Math.sin(performance.now() / 700) < 0 })} />
        {/* flue gas: thin and pale normally, thick and dark when over-fired */}
        <Particles p={[0, 25, 0]} count={46} rate={() => Math.min(1, state()?.out ?? 0) * 7} color="#aab3bb" size={[2.2, 9]} life={[4, 7]} velocity={[1.1, 3.2, 0.2]} radius={0.7} opacity={0.3} drift={2.4} />
        <Particles p={[0, 25, 0]} count={40} rate={() => (state()?.manip && !state()?.tripped ? 12 : 0)} color="#16191d" size={[3, 12]} life={[4, 7]} velocity={[1.1, 3.6, 0.2]} radius={0.8} opacity={0.8} drift={2.4} />
      </group>
      <Box p={[4.2, 1, -3.6]} s={[0.9, 1.7, 0.6]} m={MAT.paintLight} />
      <Lamp p={[4.2, 2.05, -3.6]} state={equipLamp(def.id)} />
      <HeatPlume p={[0, 12, 0]} heat={() => state()?.heat ?? 0} fire={() => state()?.fire ?? 0} />
    </group>
  );
}

// ------------------------------------------------------------------ steam turbine

export function Turbine({ def }: EquipProps) {
  const glow = useHeatGlow(def.id, 0.3);
  const shake = useShake(def.id, 0.05);
  const state = () => equipState(def.id);
  const speed = () => {
    const s = state();
    return s ? Math.min(1.3, s.out) * 13 + (s.out > 0.02 ? 2 : 0) : 0;
  };
  const governor = (n: number) => () => {
    const s = state();
    if (!s || s.tripped) return { color: PALETTE.red, off: true };
    const lit = s.manip ? 3 : Math.round((s.setpoint - 0.25) / 0.25);
    return { color: s.manip ? PALETTE.red : s.setpoint < 1 ? PALETTE.amber : PALETTE.green, off: n > lit, flash: s.manip };
  };
  return (
    <group>
      <Pad s={[10.5, 5.4]} />
      {/* turbine table with condenser underneath */}
      <Box p={[0, 0.95, 0]} s={[9, 1.5, 3.8]} m={MAT.concrete} />
      <Box p={[2.3, 1.05, 0]} s={[3.6, 1.7, 4.4]} m={MAT.paintGrey} />
      <HCyl p={[2.3, 0.8, 2.4]} radius={0.45} length={1} m={MAT.paintTeal} />
      <group ref={shake}>
        {/* HP / IP / LP casings */}
        <HCyl p={[-2.7, 3, 0]} radius={0.95} length={2.2} m={casingBlue} />
        <HCyl p={[-0.6, 3, 0]} radius={1.25} length={1.9} m={casingBlue} />
        <HCyl p={[2.3, 3, 0]} radius={1.85} length={3.4} m={casingBlue} />
        {[-3.82, -1.58, 0.38, 4.04].map((x, i) => (
          <HCyl key={x} p={[x, 3, 0]} radius={[1.05, 1.36, 1.97, 1.97][i]} length={0.14} m={MAT.steel} />
        ))}
        {/* horizontal joint flange with bolts */}
        <Box p={[-1.6, 3, 0]} s={[4.3, 0.14, 2.75]} m={MAT.steel} shadow={false} />
        <Box p={[2.3, 3, 0]} s={[3.4, 0.14, 3.95]} m={MAT.steel} shadow={false} />
        {/* crossover pipe from IP exhaust to LP inlet */}
        <Cyl p={[-0.6, 4.6, 0]} s={[0.32, 0.9, 0.32]} m={cladding} low />
        <HCyl p={[0.85, 5.05, 0]} radius={0.32} length={3.2} m={cladding} low />
        <Cyl p={[2.3, 4.95, 0]} s={[0.32, 0.5, 0.32]} m={cladding} low />
        {/* heat glow shells */}
        <mesh material={glow} position={[-2.7, 3, 0]} rotation={HX} scale={[1.02, 2.3, 1.02]}>
          <cylinderGeometry args={[1, 1, 1, 20]} />
        </mesh>
        <mesh material={glow} position={[-0.6, 3, 0]} rotation={HX} scale={[1.32, 2, 1.32]}>
          <cylinderGeometry args={[1, 1, 1, 20]} />
        </mesh>
        <mesh material={glow} position={[2.3, 3, 0]} rotation={HX} scale={[1.92, 3.5, 1.92]}>
          <cylinderGeometry args={[1, 1, 1, 20]} />
        </mesh>
        {/* stop / control valve chest */}
        {[-0.8, 0.8].map((z) => (
          <group key={z} position={[-3.9, 0, z]}>
            <Cyl p={[0, 3, 0]} s={[0.38, 1.6, 0.38]} m={MAT.darkSteel} />
            <Cyl p={[0, 4.15, 0]} s={[0.2, 0.7, 0.2]} m={MAT.paintRed} low />
            <HCyl p={[0.45, 3, 0]} radius={0.22} length={0.9} m={cladding} low />
          </group>
        ))}
        <Cyl p={[-4.2, 3, 0]} s={[0.46, 1.9, 0.46]} r={[Math.PI / 2, 0, 0]} m={cladding} />
      </group>
      {/* bearing pedestals */}
      <Box p={[-4.25, 2.35, 0]} s={[0.7, 1.3, 1.3]} m={MAT.paintGrey} />
      <Box p={[4.6, 2.35, 0]} s={[0.8, 1.3, 1.4]} m={MAT.paintGrey} />
      {/* rotor: exposed shaft, coupling with bolts and a turning-gear ring so rotation reads at a glance */}
      <Spinner p={[0, 3, 0]} axis="x" speed={speed}>
        <HCyl p={[0.6, 0, 0]} radius={0.24} length={10.6} m={MAT.steel} low />
        <HCyl p={[5.45, 0, 0]} radius={0.72} length={0.3} m={MAT.paintOrange} />
        {[0, 1, 2, 3, 4, 5].map((i) => {
          const a = (i / 6) * Math.PI * 2;
          return <Box key={i} p={[5.45, Math.cos(a) * 0.52, Math.sin(a) * 0.52]} s={[0.42, 0.14, 0.14]} m={MAT.steel} shadow={false} />;
        })}
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          const a = (i / 8) * Math.PI * 2;
          return <Box key={i} p={[-4.85, Math.cos(a) * 0.5, Math.sin(a) * 0.5]} s={[0.24, 0.2, 0.2]} m={MAT.paintYellow} shadow={false} />;
        })}
        <HCyl p={[-4.85, 0, 0]} radius={0.44} length={0.22} m={MAT.darkSteel} />
      </Spinner>
      {/* governor panel: three load LEDs show the throttle position */}
      <group position={[-1.6, 0, 2.5]}>
        <Box p={[0, 1.15, 0]} s={[1.6, 1.9, 0.6]} m={MAT.paintLight} />
        <Box p={[0, 2.14, 0.03]} s={[1.75, 0.08, 0.75]} m={MAT.paintGrey} />
        {[1, 2, 3].map((n) => (
          <Lamp key={n} p={[-0.6 + n * 0.3, 1.55, 0.33]} size={0.1} state={governor(n)} />
        ))}
        <Lamp p={[0.6, 2.3, 0]} state={equipLamp(def.id)} />
      </group>
      {/* access platform */}
      <Box p={[0, 1.75, -2.3]} s={[9, 0.08, 0.9]} m={MAT.galvanized} />
      <Railing a={[-4.5, -2.75]} b={[4.5, -2.75]} y={1.8} />
      <HeatPlume p={[1.2, 5.2, 0]} heat={() => state()?.heat ?? 0} fire={() => state()?.fire ?? 0} />
      {/* gland steam wisps when running */}
      <Particles p={[-4.2, 3.6, 0]} count={10} rate={() => (state()?.out ?? 0) * 1.6} color="#e8f0f6" size={[0.5, 1.8]} life={[1, 2]} velocity={[0, 1.2, 0]} radius={0.2} opacity={0.3} />
    </group>
  );
}

// ------------------------------------------------------------------ generator

export function Generator({ def }: EquipProps) {
  const shake = useShake(def.id, 0.012);
  const band = useMemo(() => {
    const m = new THREE.MeshBasicMaterial();
    m.toneMapped = false;
    return m;
  }, []);
  const state = () => equipState(def.id);
  useFrame(({ clock }) => {
    const s = state();
    if (!s) return;
    if (s.tripped) band.color.set(PALETTE.red).multiplyScalar(Math.sin(clock.elapsedTime * 10) > 0 ? 2.6 : 0.3);
    else band.color.set(PALETTE.cyan).multiplyScalar(0.15 + Math.min(1, s.out) * 2);
  });
  const tripping = () => {
    const s = state();
    const g = game();
    return !!s && !!g && s.tripped && g.time - s.tripAt < 1.1;
  };
  return (
    <group>
      <Pad s={[8.4, 5.2]} />
      <Box p={[0.3, 0.95, 0]} s={[7, 1.5, 3.6]} m={MAT.concrete} />
      <group ref={shake}>
        {/* stator frame with ribs */}
        <HCyl p={[0, 3, 0]} radius={1.7} length={4.4} m={genGreen} />
        {[-1.8, -0.9, 0, 0.9, 1.8].map((x) => (
          <HCyl key={x} p={[x, 3, 0]} radius={1.8} length={0.14} m={MAT.darkSteel} />
        ))}
        <mesh material={band} position={[0.45, 3, 0]} rotation={HX}>
          <cylinderGeometry args={[1.73, 1.73, 0.2, 24, 1, true]} />
        </mesh>
        <mesh material={band} position={[-0.45, 3, 0]} rotation={HX}>
          <cylinderGeometry args={[1.73, 1.73, 0.2, 24, 1, true]} />
        </mesh>
        {/* end bells */}
        <HCyl p={[-2.5, 3, 0]} radius={1.25} length={0.7} m={MAT.paintGrey} />
        <HCyl p={[2.5, 3, 0]} radius={1.25} length={0.7} m={MAT.paintGrey} />
        {/* hydrogen coolers */}
        <Box p={[0, 3, 1.9]} s={[3.4, 1.5, 0.5]} m={MAT.paintLight} />
        <Box p={[0, 3, -1.9]} s={[3.4, 1.5, 0.5]} m={MAT.paintLight} />
        {/* exciter */}
        <HCyl p={[3.4, 3, 0]} radius={0.75} length={1.2} m={MAT.paintOrange} />
        <Box p={[3.4, 2.1, 0]} s={[1.3, 0.7, 1.4]} m={MAT.paintGrey} />
        {/* terminal enclosure with three bushings */}
        <Box p={[1, 4.95, 0]} s={[1.5, 0.7, 2.9]} m={MAT.paintGrey} />
        {[-1, 0, 1].map((z) => (
          <group key={z}>
            <Insulator p={[1, 5.3, z]} height={0.85} radius={0.2} sheds={4} m={MAT.porcelainGrey} />
            <Cyl p={[1, 6.22, z]} s={[0.06, 0.16, 0.06]} m={MAT.aluminium} low />
          </group>
        ))}
        <Arc a={[1, 6.25, -1]} b={[1, 6.25, 0]} active={tripping} />
        <Arc a={[1, 6.25, 0]} b={[1, 6.25, 1]} active={tripping} />
      </group>
      <Box p={[-3, 2.35, 0]} s={[0.6, 1.3, 1.2]} m={MAT.paintGrey} />
      {/* shaft stub and coupling to the turbine */}
      <Spinner p={[0, 3, 0]} axis="x" speed={() => Math.min(1.3, state()?.out ?? 0) * 13 + ((state()?.out ?? 0) > 0.02 ? 2 : 0)}>
        <HCyl p={[-4, 0, 0]} radius={0.24} length={3} m={MAT.steel} low />
        <HCyl p={[-5.25, 0, 0]} radius={0.72} length={0.3} m={MAT.paintOrange} />
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2;
          return <Box key={i} p={[-5.05, Math.cos(a) * 0.52, Math.sin(a) * 0.52]} s={[0.16, 0.16, 0.16]} m={MAT.steel} shadow={false} />;
        })}
      </Spinner>
      <Box p={[1.6, 1.15, 2.6]} s={[1.3, 1.9, 0.6]} m={MAT.paintLight} />
      <Lamp p={[1.6, 2.3, 2.6]} state={equipLamp(def.id)} />
    </group>
  );
}

// ------------------------------------------------------------------ natural-draft cooling tower

const towerGeo = (() => {
  let geo: THREE.LatheGeometry | null = null;
  return () => {
    if (geo) return geo;
    const pts: THREE.Vector2[] = [];
    // Hyperboloid shell: wide base, narrow throat, flared lip.
    for (let i = 0; i <= 16; i++) {
      const t = i / 16;
      const y = 1.4 + t * 14.6;
      const k = (y - 10.2) / 6.2;
      pts.push(new THREE.Vector2(3.7 * Math.sqrt(1 + k * k * 1.15), y));
    }
    geo = new THREE.LatheGeometry(pts, 36);
    return geo;
  };
})();

export function CoolingTower({ def }: EquipProps) {
  const state = () => equipState(def.id);
  const legs = useMemo(() => Array.from({ length: 16 }, (_, i) => (i / 16) * Math.PI * 2), []);
  const r0 = 6.75;
  return (
    <group>
      {/* basin */}
      <Cyl p={[0, 0.3, 0]} s={[7.4, 0.6, 7.4]} m={MAT.concrete} />
      <mesh material={MAT.water} position={[0, 0.63, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[7, 32]} />
      </mesh>
      {/* V-columns holding the shell above the air inlet */}
      {legs.map((a, i) => {
        const b = a + (Math.PI / 16) * (i % 2 ? 1 : -1);
        return <Beam key={i} a={[Math.cos(a) * 6.9, 0.6, Math.sin(a) * 6.9]} b={[Math.cos(b) * r0, 1.45, Math.sin(b) * r0]} radius={0.11} m={MAT.concreteDark} shadow={false} />;
      })}
      <mesh geometry={towerGeo()} material={towerShell} castShadow receiveShadow />
      {/* rim walkway and aviation lights */}
      <mesh material={MAT.concreteDark} position={[0, 16, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[5.15, 0.12, 6, 36]} />
      </mesh>
      {[0, 2.1, 4.2].map((a) => (
        <Lamp key={a} p={[Math.cos(a) * 5.2, 16.3, Math.sin(a) * 5.2]} size={0.2} state={() => ({ color: PALETTE.red, off: Math.sin(performance.now() / 650 + a) < 0 })} />
      ))}
      {/* falling water in the fill, visible through the inlet */}
      <Particles p={[0, 1.5, 0]} count={24} rate={() => (state()?.out ?? 0) * 18} color="#bfe9ff" size={[0.6, 0.4]} life={[0.4, 0.7]} velocity={[0, -1.6, 0]} jitter={0.6} radius={6} opacity={0.4} />
      {/* plume: the most visible sign that the loop is rejecting heat */}
      <Particles p={[0, 16.2, 0]} count={60} rate={() => Math.min(1, state()?.out ?? 0) * 9} color="#e9eff4" size={[5, 17]} life={[5, 8.5]} velocity={[0.9, 3.4, 0.2]} jitter={0.9} radius={3.6} opacity={0.34} drift={2.6} />
      {/* fan / valve control kiosk */}
      <group position={[7.9, 0, 2.2]}>
        <Box p={[0, 1.1, 0]} s={[1, 1.9, 1.4]} m={MAT.paintLight} />
        <Lamp p={[0, 2.25, 0]} state={equipLamp(def.id)} />
      </group>
      {/* inlet / outlet headers */}
      <HCyl p={[-6.9, 1.2, 0]} radius={0.42} length={1.2} m={MAT.paintTeal} />
      <HCyl p={[6.9, 1.2, 0]} radius={0.42} length={1.2} m={MAT.paintTeal} />
    </group>
  );
}

// ------------------------------------------------------------------ vertical circulating pump

export function CoolingPump({ def }: EquipProps) {
  const shake = useShake(def.id, 0.02);
  const state = () => equipState(def.id);
  return (
    <group>
      <Pad s={[5, 3.6]} />
      <Box p={[0, 0.45, 0]} s={[2.4, 0.5, 2.4]} m={MAT.concreteDark} />
      {/* suction and discharge spools with flanges */}
      <HCyl p={[-1.5, 1.1, 0]} radius={0.36} length={1.4} m={MAT.paintTeal} />
      <HCyl p={[1.25, 1.1, 0]} radius={0.36} length={1} m={MAT.paintTeal} />
      {[-2.15, -0.85, 0.8, 1.7].map((x) => (
        <HCyl key={x} p={[x, 1.1, 0]} radius={0.48} length={0.1} m={MAT.steel} />
      ))}
      {/* gate valve handwheel on the discharge */}
      <Cyl p={[1.25, 1.75, 0]} s={[0.07, 0.7, 0.07]} m={MAT.steel} low />
      <mesh material={MAT.paintRed} position={[1.25, 2.12, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.3, 0.045, 6, 16]} />
      </mesh>
      <group ref={shake}>
        {/* volute, column and motor */}
        <Cyl p={[0, 1.1, 0]} s={[0.95, 0.9, 0.95]} m={MAT.paintTeal} />
        <Cyl p={[0, 1.85, 0]} s={[0.5, 0.6, 0.5]} m={MAT.darkSteel} />
        <Cyl p={[0, 3.1, 0]} s={[0.8, 1.9, 0.8]} m={MAT.paintBlue} />
        {[2.4, 2.75, 3.1, 3.45, 3.8].map((y) => (
          <Cyl key={y} p={[0, y, 0]} s={[0.86, 0.07, 0.86]} m={MAT.darkSteel} shadow={false} />
        ))}
        <Box p={[0.85, 3.1, 0]} s={[0.4, 0.6, 0.6]} m={MAT.paintGrey} />
        <Cyl p={[0, 4.15, 0]} s={[0.62, 0.22, 0.62]} m={MAT.darkSteel} />
      </group>
      {/* open coupling: spinning collar with flags makes the running state obvious */}
      <Spinner p={[0, 1.85, 0]} axis="y" speed={() => (state()?.out ?? 0) * 20}>
        <Cyl s={[0.56, 0.2, 0.56]} m={MAT.paintOrange} low />
        {[0, 1, 2, 3].map((i) => (
          <Box key={i} p={[Math.cos((i * Math.PI) / 2) * 0.6, 0, Math.sin((i * Math.PI) / 2) * 0.6]} s={[0.16, 0.26, 0.16]} m={MAT.steel} shadow={false} />
        ))}
      </Spinner>
      {/* motor cooling fan under the cowl */}
      <Spinner p={[0, 4.34, 0]} axis="y" speed={() => (state()?.out ?? 0) * 26}>
        {[0, 1, 2].map((i) => (
          <group key={i} rotation={[0, (i * Math.PI * 2) / 3, 0]}>
            <Box p={[0.3, 0, 0]} s={[0.55, 0.03, 0.2]} r={[0.4, 0, 0]} m={MAT.aluminium} shadow={false} />
          </group>
        ))}
      </Spinner>
      <Box p={[-1.6, 1.1, 1.4]} s={[0.8, 1.7, 0.5]} m={MAT.paintLight} />
      <Lamp p={[-1.6, 2.15, 1.4]} state={equipLamp(def.id)} />
    </group>
  );
}
