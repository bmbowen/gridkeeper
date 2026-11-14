"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { EquipDef, Vec3 } from "@/sim/types";
import { viewFx } from "@/state/fx";
import { MAT } from "../materials";
import { Arc, Beam, Box, Cyl, HeatPlume, Insulator, Label, Lamp, Pad, Spinner, Tube } from "../parts";
import { catenary, equipState, game, PALETTE, seeded } from "../util";

export type EquipProps = { def: EquipDef };

/** Standard status lamp for a piece of equipment. */
export const equipLamp = (id: string) => () => {
  const s = equipState(id);
  if (!s) return { color: PALETTE.green };
  if (s.fire > 0) return { color: "#ff7a1a", flash: true };
  if (s.tripped || s.condition <= 0) return { color: PALETTE.red, flash: true };
  if (s.manip) return { color: PALETTE.red, flash: true };
  if (s.arming) return { color: PALETTE.amber, flash: true };
  if (s.local) return { color: "#ffffff" };
  if (s.heat > 0.6 || s.load > 1.1) return { color: PALETTE.amber, flash: s.heat > 0.8 };
  return { color: PALETTE.green };
};

/** Steel lattice column built from four chords and zig-zag bracing. */
export function LatticeColumn({ p = [0, 0, 0], height, width = 0.5, m = MAT.galvanized }: { p?: Vec3; height: number; width?: number; m?: THREE.Material }) {
  const w = width / 2;
  const bays = Math.max(2, Math.round(height / 1.4));
  const bh = height / bays;
  return (
    <group position={p}>
      {[
        [-w, -w],
        [w, -w],
        [w, w],
        [-w, w],
      ].map(([x, z], i) => (
        <Beam key={i} a={[x, 0, z]} b={[x, height, z]} radius={0.05} m={m} square />
      ))}
      {Array.from({ length: bays }, (_, i) => {
        const y = i * bh;
        const f = i % 2 === 0 ? 1 : -1;
        return (
          <group key={i}>
            <Beam a={[-w * f, y, w]} b={[w * f, y + bh, w]} radius={0.025} m={m} shadow={false} />
            <Beam a={[w * f, y, -w]} b={[-w * f, y + bh, -w]} radius={0.025} m={m} shadow={false} />
            <Beam a={[w, y, -w * f]} b={[w, y + bh, w * f]} radius={0.025} m={m} shadow={false} />
            <Beam a={[-w, y, w * f]} b={[-w, y + bh, -w * f]} radius={0.025} m={m} shadow={false} />
          </group>
        );
      })}
    </group>
  );
}

/** Lattice transmission tower with three crossarms. */
export function TransmissionTower({ p, height = 22, rot = 0 }: { p: Vec3; height?: number; rot?: number }) {
  const arms = [height - 2, height - 6, height - 10];
  return (
    <group position={p} rotation={[0, rot, 0]}>
      {[
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([x, z], i) => (
        <Beam key={i} a={[x * 2.6, 0, z * 2.6]} b={[x * 0.45, height, z * 0.45]} radius={0.09} m={MAT.galvanized} />
      ))}
      {Array.from({ length: 7 }, (_, i) => {
        const y0 = (i / 7) * height;
        const y1 = ((i + 1) / 7) * height;
        const w0 = 2.6 - (y0 / height) * 2.15;
        const w1 = 2.6 - (y1 / height) * 2.15;
        const f = i % 2 ? 1 : -1;
        return (
          <group key={i}>
            <Beam a={[-w0 * f, y0, w0]} b={[w1 * f, y1, w1]} radius={0.04} m={MAT.galvanized} shadow={false} />
            <Beam a={[w0 * f, y0, -w0]} b={[-w1 * f, y1, -w1]} radius={0.04} m={MAT.galvanized} shadow={false} />
            <Beam a={[w0, y0, -w0 * f]} b={[w1, y1, w1 * f]} radius={0.04} m={MAT.galvanized} shadow={false} />
            <Beam a={[-w0, y0, w0 * f]} b={[-w1, y1, -w1 * f]} radius={0.04} m={MAT.galvanized} shadow={false} />
          </group>
        );
      })}
      {arms.map((y, i) => (
        <group key={i}>
          <Beam a={[0, y, -5.2 + i * 0.6]} b={[0, y, 5.2 - i * 0.6]} radius={0.09} m={MAT.galvanized} square />
          <Beam a={[0, y + 1.2, 0]} b={[0, y, -5.2 + i * 0.6]} radius={0.04} m={MAT.galvanized} shadow={false} />
          <Beam a={[0, y + 1.2, 0]} b={[0, y, 5.2 - i * 0.6]} radius={0.04} m={MAT.galvanized} shadow={false} />
        </group>
      ))}
      <Lamp p={[0, height + 0.3, 0]} size={0.22} state={() => ({ color: PALETTE.red, off: Math.sin(performance.now() / 600) < 0 })} />
    </group>
  );
}

// ------------------------------------------------------------------ source: dead-end gantry + incoming line

export function Source({ def }: EquipProps) {
  const wires = useMemo(() => {
    const out: THREE.Curve<THREE.Vector3>[] = [];
    for (const z of [-2.6, 0, 2.6]) {
      out.push(catenary(new THREE.Vector3(-30, 12, z * 1.7), new THREE.Vector3(-1.6, 8.3, z), 0.045));
      out.push(catenary(new THREE.Vector3(-74, 12, z * 1.7), new THREE.Vector3(-30, 12, z * 1.7), 0.05));
      out.push(catenary(new THREE.Vector3(-130, 14, z * 1.7 - 14), new THREE.Vector3(-74, 12, z * 1.7), 0.05));
    }
    return out;
  }, []);
  return (
    <group>
      <LatticeColumn p={[0, 0, -5]} height={10} width={0.7} />
      <LatticeColumn p={[0, 0, 5]} height={10} width={0.7} />
      <Beam a={[0, 9.6, -5.6]} b={[0, 9.6, 5.6]} radius={0.3} m={MAT.galvanized} square />
      <Beam a={[0, 10, -5]} b={[0, 11.6, -5]} radius={0.05} m={MAT.galvanized} />
      <Beam a={[0, 10, 5]} b={[0, 11.6, 5]} radius={0.05} m={MAT.galvanized} />
      {[-2.6, 0, 2.6].map((z) => (
        <group key={z}>
          {/* strain insulator string to the incoming line */}
          <Insulator p={[-0.2, 9.1, z]} r={[0, 0, Math.PI / 2 + 0.28]} height={1.5} radius={0.2} sheds={8} m={MAT.porcelainGrey} />
          {/* post insulator feeding the bus */}
          <Insulator p={[1.2, 6.6, z]} height={1.5} radius={0.2} sheds={6} />
          <Beam a={[1.2, 6.6, z]} b={[1.2, 0, z]} radius={0.08} m={MAT.galvanized} />
          <Beam a={[-1.6, 8.3, z]} b={[1.2, 8.1, z]} radius={0.04} m={MAT.aluminium} shadow={false} />
        </group>
      ))}
      <Pad s={[3.5, 13]} />
      <TransmissionTower p={[-30, 0, 0]} />
      <TransmissionTower p={[-74, 0, 0]} />
      <TransmissionTower p={[-130, 0, -14]} height={24} />
      {wires.map((c, i) => (
        <Tube key={i} curve={c} radius={0.045} m={MAT.aluminium} segments={18} radial={4} />
      ))}
      <Lamp p={[0.5, 1.6, -5]} state={equipLamp(def.id)} />
    </group>
  );
}

// ------------------------------------------------------------------ circuit breaker (dead tank)

export function Breaker({ def }: EquipProps) {
  const hv = !!def.visual?.hv;
  const paint = hv ? MAT.paintGrey : MAT.paintTeal;
  const plate = useMemo(() => {
    const m = new THREE.MeshBasicMaterial();
    m.toneMapped = false;
    return m;
  }, []);
  const arm = useRef<THREE.Group>(null);
  useFrame(({ clock }, dt) => {
    const s = equipState(def.id);
    if (!s) return;
    const open = s.tripped;
    plate.color.set(open ? PALETTE.red : PALETTE.green).multiplyScalar(open ? (Math.sin(clock.elapsedTime * 10) > 0 ? 3 : 0.5) : 1.8);
    if (arm.current) arm.current.rotation.x = THREE.MathUtils.damp(arm.current.rotation.x, open ? -1.1 : 0, 12, dt);
  });
  return (
    <group>
      <Pad s={[4.2, 6]} />
      {[
        [-1.2, -2.2],
        [1.2, -2.2],
        [-1.2, 2.2],
        [1.2, 2.2],
      ].map(([x, z], i) => (
        <Beam key={i} a={[x, 0.2, z]} b={[x, 1.6, z]} radius={0.08} m={MAT.galvanized} square />
      ))}
      <Beam a={[-1.2, 1.6, -2.2]} b={[-1.2, 1.6, 2.2]} radius={0.08} m={MAT.galvanized} square />
      <Beam a={[1.2, 1.6, -2.2]} b={[1.2, 1.6, 2.2]} radius={0.08} m={MAT.galvanized} square />
      {[-1.5, 0, 1.5].map((z) => (
        <group key={z} position={[0, 2.1, z]}>
          <Cyl s={[0.5, 2.3, 0.5]} r={[0, 0, Math.PI / 2]} m={paint} />
          <Cyl p={[-1.18, 0, 0]} s={[0.54, 0.08, 0.54]} r={[0, 0, Math.PI / 2]} m={MAT.steel} />
          <Cyl p={[1.18, 0, 0]} s={[0.54, 0.08, 0.54]} r={[0, 0, Math.PI / 2]} m={MAT.steel} />
          <Insulator p={[-0.62, 0.38, 0]} r={[0, 0, 0.32]} height={1.95} radius={0.24} sheds={8} />
          <Insulator p={[0.62, 0.38, 0]} r={[0, 0, -0.32]} height={1.95} radius={0.24} sheds={8} />
          <Cyl p={[-1.25, 2.25, 0]} s={[0.07, 0.25, 0.07]} m={MAT.aluminium} low />
          <Cyl p={[1.25, 2.25, 0]} s={[0.07, 0.25, 0.07]} m={MAT.aluminium} low />
          <Arc a={[-1.25, 2.3, 0]} b={[1.25, 2.3, 0]} active={() => {
            const s = equipState(def.id);
            const g = game();
            return !!s && !!g && s.tripped && g.time - s.tripAt < 0.9;
          }} />
        </group>
      ))}
      {/* mechanism cabinet with position indicator */}
      <group position={[0, 0, 2.75]}>
        <Box p={[0, 1.15, 0]} s={[1.5, 1.7, 0.7]} m={MAT.paintLight} />
        <Box p={[0, 2.04, 0.03]} s={[1.65, 0.08, 0.85]} m={MAT.paintGrey} />
        <mesh material={plate} position={[0, 1.45, 0.36]}>
          <planeGeometry args={[0.7, 0.3]} />
        </mesh>
        <group ref={arm} position={[0.5, 0.9, 0.38]}>
          <Box p={[0, 0.18, 0]} s={[0.07, 0.4, 0.07]} m={MAT.paintRed} shadow={false} />
        </group>
        <Lamp p={[-0.55, 2.2, 0.2]} state={equipLamp(def.id)} />
      </group>
    </group>
  );
}

// ------------------------------------------------------------------ power transformer

export function Transformer({ def }: EquipProps) {
  const glowMat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: "#ff5a1a", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    m.toneMapped = false;
    return m;
  }, []);
  const body = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const s = equipState(def.id);
    if (!s) return;
    const h = Math.max(0, (s.heat - 0.35) / 0.65);
    glowMat.opacity = h * (0.5 + Math.sin(clock.elapsedTime * 5) * 0.12 * h) * (1 - viewFx.mix * 0.5);
    // Energized transformers hum.
    if (body.current) body.current.position.y = s.out > 0.05 ? Math.sin(clock.elapsedTime * 60) * 0.004 : 0;
  });
  const fins = useMemo(() => Array.from({ length: 10 }, (_, i) => -1.8 + i * 0.4), []);
  return (
    <group>
      {/* oil containment */}
      <Box p={[0, 0.1, 0]} s={[7.2, 0.2, 6.2]} m={MAT.concrete} shadow={false} />
      {[
        [0, 3.05, 7.2, 0.2],
        [0, -3.05, 7.2, 0.2],
        [3.55, 0, 0.2, 6.2],
        [-3.55, 0, 0.2, 6.2],
      ].map(([x, z, w, d], i) => (
        <Box key={i} p={[x, 0.32, z]} s={[w, 0.3, d]} m={MAT.concreteDark} shadow={false} />
      ))}
      <group ref={body}>
        <Box p={[0, 0.42, 0]} s={[4.7, 0.25, 2.2]} m={MAT.darkSteel} />
        <Box p={[0, 2.25, 0]} s={[4.4, 3.4, 2.7]} m={MAT.paintGrey} />
        <Box p={[0, 3.98, 0]} s={[4.55, 0.1, 2.85]} m={MAT.darkSteel} />
        {/* stiffeners */}
        {[-1.4, 0, 1.4].map((x) => (
          <Box key={x} p={[x, 2.25, 0]} s={[0.1, 3.3, 2.82]} m={MAT.paintGrey} shadow={false} />
        ))}
        <mesh material={glowMat} position={[0, 2.25, 0]} scale={[4.5, 3.5, 2.8]}>
          <boxGeometry />
        </mesh>
        {/* radiator banks */}
        {[-1, 1].map((side) => (
          <group key={side} position={[0, 2.2, side * 1.95]}>
            {fins.map((x) => (
              <Box key={x} p={[x, 0, 0]} s={[0.1, 2.7, 1]} m={MAT.paintLight} shadow={false} />
            ))}
            <Cyl p={[0, 1.42, 0]} s={[0.1, 4, 0.1]} r={[0, 0, Math.PI / 2]} m={MAT.paintGrey} low />
            <Cyl p={[0, -1.42, 0]} s={[0.1, 4, 0.1]} r={[0, 0, Math.PI / 2]} m={MAT.paintGrey} low />
          </group>
        ))}
        {/* conservator */}
        <Cyl p={[0.5, 5.15, 0]} s={[0.5, 3.1, 0.5]} r={[Math.PI / 2, 0, 0]} m={MAT.paintGrey} />
        <Box p={[0.5, 4.4, -1.1]} s={[0.12, 0.8, 0.12]} m={MAT.darkSteel} />
        <Box p={[0.5, 4.4, 1.1]} s={[0.12, 0.8, 0.12]} m={MAT.darkSteel} />
        {/* HV bushings */}
        {[-1.1, 0, 1.1].map((z) => (
          <group key={z}>
            <Insulator p={[-1.5, 4, z]} height={2.35} radius={0.26} sheds={10} />
            <Cyl p={[-1.5, 6.45, z]} s={[0.07, 0.25, 0.07]} m={MAT.aluminium} low />
            <Insulator p={[1.7, 4, z]} height={0.75} radius={0.2} sheds={4} m={MAT.porcelainGrey} />
          </group>
        ))}
        {/* tap changer + marshalling box */}
        <Box p={[2.5, 1.8, 0]} s={[0.6, 2, 1.2]} m={MAT.paintLight} />
        <Box p={[-2.35, 1.3, 0.6]} s={[0.3, 1, 0.8]} m={MAT.paintLight} />
        <Lamp p={[2.82, 2.5, 0]} state={equipLamp(def.id)} />
      </group>
      <HeatPlume p={[0, 4.2, 0]} heat={() => equipState(def.id)?.heat ?? 0} fire={() => equipState(def.id)?.fire ?? 0} />
    </group>
  );
}

// ------------------------------------------------------------------ forced-air cooling bank

function FanUnit({ p, id }: { p: Vec3; id: string }) {
  return (
    <group position={p}>
      <mesh material={MAT.darkSteel} castShadow>
        <torusGeometry args={[0.62, 0.07, 8, 24]} />
      </mesh>
      <Spinner axis="z" speed={() => (equipState(id)?.out ?? 0) * 22}>
        {[0, 1, 2, 3, 4].map((i) => (
          <group key={i} rotation={[0, 0, (i * Math.PI * 2) / 5]}>
            <Box p={[0, 0.3, 0]} s={[0.2, 0.52, 0.03]} r={[0, 0.5, 0]} m={MAT.aluminium} shadow={false} />
          </group>
        ))}
        <Cyl s={[0.1, 0.16, 0.1]} r={[Math.PI / 2, 0, 0]} m={MAT.blackMetal} low />
      </Spinner>
      {/* guard */}
      <Beam a={[-0.62, 0, 0.08]} b={[0.62, 0, 0.08]} radius={0.012} m={MAT.steel} shadow={false} />
      <Beam a={[0, -0.62, 0.08]} b={[0, 0.62, 0.08]} radius={0.012} m={MAT.steel} shadow={false} />
    </group>
  );
}

export function FanBank({ def }: EquipProps) {
  return (
    <group>
      <Pad s={[5, 1.6]} />
      <Box p={[0, 1.55, -0.25]} s={[4.6, 2.5, 0.5]} m={MAT.paintGrey} />
      <Box p={[0, 2.85, -0.1]} s={[4.8, 0.1, 0.9]} m={MAT.darkSteel} />
      {[-1.5, 0, 1.5].map((x) => (
        <FanUnit key={x} p={[x, 1.55, 0.06]} id={def.id} />
      ))}
      <Box p={[-2.5, 0.9, -0.2]} s={[0.4, 1.4, 0.5]} m={MAT.paintLight} />
      <Lamp p={[-2.5, 1.75, -0.2]} state={equipLamp(def.id)} />
    </group>
  );
}

// ------------------------------------------------------------------ feeder + the load it serves

const windowTex = (() => {
  let tex: THREE.CanvasTexture | null = null;
  return () => {
    if (tex) return tex;
    const c = document.createElement("canvas");
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, 64, 64);
    const rnd = seeded(42);
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        if (rnd() < 0.34) {
          ctx.fillStyle = rnd() < 0.8 ? "#ffd58a" : "#bfe3ff";
          ctx.fillRect(x * 8 + 2, y * 8 + 2, 4, 4);
        }
      }
    tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.magFilter = THREE.NearestFilter;
    return tex;
  };
})();

/**
 * Cluster of buildings whose lit windows follow a polled power level 0..1.
 * This is how an outage becomes visible in the world.
 */
export function LitBuildings({ p, power, variant = "town", seed = 1, spread = 12, count = 14, tall = 1 }: { p?: Vec3; power: () => number; variant?: "town" | "hospital" | "works" | "city"; seed?: number; spread?: number; count?: number; tall?: number }) {
  const mat = useMemo(() => {
    const t = windowTex().clone();
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ color: "#2a2f37", roughness: 0.85, emissive: "#ffd9a0", emissiveMap: t, emissiveIntensity: 1.6 });
  }, []);
  const sign = useMemo(() => {
    const m = new THREE.MeshBasicMaterial();
    m.toneMapped = false;
    return m;
  }, []);
  const cur = useRef(1);
  useFrame(({ clock }, dt) => {
    const target = Math.max(0, Math.min(1, power()));
    // Lights die fast and come back with a flicker.
    const prev = cur.current;
    cur.current = THREE.MathUtils.damp(prev, target, target < prev ? 9 : 2.2, dt);
    const flicker = cur.current < 0.95 && cur.current > 0.05 ? 0.75 + Math.sin(clock.elapsedTime * 40) * 0.25 : 1;
    mat.emissiveIntensity = 1.7 * cur.current * flicker;
    sign.color.set(variant === "hospital" ? "#ff4050" : "#7fe6ff").multiplyScalar(3 * cur.current * flicker + 0.05);
  });
  const blocks = useMemo(() => {
    const rnd = seeded(seed * 977 + 13);
    return Array.from({ length: count }, () => {
      const w = 2 + rnd() * 3;
      const d = 2 + rnd() * 3;
      const h = (variant === "city" ? 6 + rnd() * rnd() * 34 : 1.8 + rnd() * 2.6) * tall;
      return { x: (rnd() - 0.5) * spread * 2, z: (rnd() - 0.5) * spread * 1.4, w, d, h };
    });
  }, [seed, count, spread, variant, tall]);
  return (
    <group position={p}>
      {blocks.map((b, i) => (
        <mesh key={i} material={mat} position={[b.x, b.h / 2, b.z]} scale={[b.w, b.h, b.d]} castShadow>
          <boxGeometry />
        </mesh>
      ))}
      {variant === "hospital" && (
        <group>
          <mesh material={mat} position={[0, 3.5, 0]} scale={[11, 7, 6]} castShadow>
            <boxGeometry />
          </mesh>
          <mesh material={mat} position={[-5, 2.2, 4]} scale={[6, 4.4, 5]} castShadow>
            <boxGeometry />
          </mesh>
          <mesh material={sign} position={[0, 8.4, 0]} scale={[0.5, 1.8, 0.2]}>
            <boxGeometry />
          </mesh>
          <mesh material={sign} position={[0, 8.4, 0]} scale={[1.8, 0.5, 0.2]}>
            <boxGeometry />
          </mesh>
        </group>
      )}
      {variant === "works" && (
        <group>
          <Cyl p={[-4, 3, 0]} s={[2.6, 6, 2.6]} m={MAT.paintLight} />
          <Cyl p={[3, 2.2, 2]} s={[2, 4.4, 2]} m={MAT.paintLight} />
          <Cyl p={[-4, 7.5, 0]} s={[0.3, 3, 0.3]} m={MAT.steel} low />
          <mesh material={sign} position={[-4, 9.1, 0]} scale={0.3}>
            <sphereGeometry args={[1, 8, 6]} />
          </mesh>
          <mesh material={sign} position={[3, 4.6, 2]} scale={0.25}>
            <sphereGeometry args={[1, 8, 6]} />
          </mesh>
        </group>
      )}
    </group>
  );
}

function WoodPole({ p }: { p: Vec3 }) {
  return (
    <group position={p}>
      <Cyl p={[0, 3.6, 0]} s={[0.14, 7.2, 0.14]} m={MAT.wood} low />
      <Box p={[0, 6.6, 0]} s={[0.14, 0.14, 2.8]} m={MAT.wood} />
      {[-1.1, 0, 1.1].map((z) => (
        <Insulator key={z} p={[0, 6.67, z]} height={0.3} radius={0.1} sheds={2} m={MAT.porcelainGrey} />
      ))}
    </group>
  );
}

export function Feeder({ def }: EquipProps) {
  const label = String(def.visual?.label ?? def.name.toUpperCase());
  const variant = label.includes("HOSPITAL") ? "hospital" : label.includes("WELL") ? "works" : "town";
  const run = 34;
  const dz = Number(def.visual?.dz ?? 0);
  const wires = useMemo(() => {
    const out: THREE.Curve<THREE.Vector3>[] = [];
    const xs = [0, 9, 18, 27];
    for (const z of [-1.1, 0, 1.1]) {
      for (let i = 0; i < xs.length - 1; i++) out.push(catenary(new THREE.Vector3(xs[i], i === 0 ? 6.3 : 7, z), new THREE.Vector3(xs[i + 1], 7, z), 0.035, 8));
    }
    return out;
  }, []);
  const power = () => equipState(def.id)?.out ?? 0;
  return (
    <group>
      {/* riser structure */}
      <Pad s={[2, 4]} />
      <Beam a={[0, 0.2, 0]} b={[0, 6.2, 0]} radius={0.14} m={MAT.galvanized} square />
      <Box p={[0, 5.9, 0]} s={[0.2, 0.2, 3.2]} m={MAT.galvanized} />
      {[-1.1, 0, 1.1].map((z) => (
        <Insulator key={z} p={[0, 6, z]} height={0.38} radius={0.13} sheds={3} />
      ))}
      <Lamp p={[0.25, 1.6, 0]} state={equipLamp(def.id)} />
      <WoodPole p={[9, 0, 0]} />
      <WoodPole p={[18, 0, 0]} />
      <WoodPole p={[27, 0, 0]} />
      {wires.map((c, i) => (
        <Tube key={i} curve={c} radius={0.03} m={MAT.wire} segments={8} radial={3} />
      ))}
      <LitBuildings p={[run, 0, dz]} power={power} variant={variant} seed={label.length} spread={variant === "town" ? 7 : 5} count={variant === "town" ? 16 : 5} />
      <Label text={label} p={[run, variant === "hospital" ? 11.5 : 8, dz]} size={0.8} color="#ffe2b0" opacityRef={() => 0.85} />
    </group>
  );
}
