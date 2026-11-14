"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Vec3 } from "@/sim/types";
import { viewFx } from "@/state/fx";
import { MAT } from "../materials";
import { Arc, Beam, Box, Cyl, HeatPlume, Insulator, Label, Lamp, Particles, Spinner } from "../parts";
import { catenary, equipState, game, PALETTE } from "../util";
import { equipLamp, LitBuildings, type EquipProps } from "./substation";

// ------------------------------------------------------------------ helpers

const UP = new THREE.Vector3(0, 1, 0);

/** Box beam between two points as a geometry (for merging many members into one draw call). */
function beamGeo(a: Vec3, b: Vec3, r: number): THREE.BufferGeometry {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const dir = vb.clone().sub(va);
  const len = dir.length();
  const g = new THREE.BoxGeometry(r * 2, len, r * 2);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(va.add(vb).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

const towerCache = new Map<string, THREE.BufferGeometry>();

/** Diorama-scale lattice tower, merged into a single geometry. Crossarm runs along local Z. */
function towerGeometry(height: number, arm: number, old: boolean): THREE.BufferGeometry {
  const key = `${height}|${arm}|${old}`;
  const hit = towerCache.get(key);
  if (hit) return hit;
  const parts: THREE.BufferGeometry[] = [];
  if (old) {
    // Wood H-frame.
    parts.push(beamGeo([0, 0, -arm * 0.55], [0, height, -arm * 0.55], 0.11), beamGeo([0, 0, arm * 0.55], [0, height, arm * 0.55], 0.11));
    parts.push(beamGeo([0, height - 0.5, -arm], [0, height - 0.5, arm], 0.09));
    parts.push(beamGeo([0, height * 0.45, -arm * 0.55], [0, height - 1.2, arm * 0.55], 0.05), beamGeo([0, height * 0.45, arm * 0.55], [0, height - 1.2, -arm * 0.55], 0.05));
  } else {
    const b = 1.05;
    const t = 0.22;
    for (const [x, z] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ])
      parts.push(beamGeo([x * b, 0, z * b], [x * t, height, z * t], 0.07));
    const levels = 4;
    for (let i = 0; i < levels; i++) {
      const y0 = (i / levels) * height;
      const y1 = ((i + 1) / levels) * height;
      const w0 = b - (y0 / height) * (b - t);
      const w1 = b - (y1 / height) * (b - t);
      const f = i % 2 ? 1 : -1;
      parts.push(beamGeo([-w0 * f, y0, w0], [w1 * f, y1, w1], 0.035), beamGeo([w0 * f, y0, -w0], [-w1 * f, y1, -w1], 0.035));
      parts.push(beamGeo([w0, y0, -w0 * f], [w1, y1, w1 * f], 0.035), beamGeo([-w0, y0, w0 * f], [-w1, y1, -w1 * f], 0.035));
    }
    parts.push(beamGeo([0, height - 1.6, -arm], [0, height - 1.6, arm], 0.08));
    parts.push(beamGeo([0, height - 0.5, 0], [0, height - 1.6, -arm], 0.035), beamGeo([0, height - 0.5, 0], [0, height - 1.6, arm], 0.035));
    parts.push(beamGeo([0, height - 3.6, -arm * 0.7], [0, height - 3.6, arm * 0.7], 0.06));
    parts.push(beamGeo([0, height, 0], [0, height + 0.9, 0], 0.05));
  }
  const g = mergeGeometries(parts)!;
  parts.forEach((p) => p.dispose());
  towerCache.set(key, g);
  return g;
}

function glowMat(): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial();
  m.toneMapped = false;
  return m;
}

const C_LIVE = new THREE.Color("#ffe2a0");
const C_AMBER = new THREE.Color(PALETTE.amber);
const C_RED = new THREE.Color(PALETTE.red);
const C_CYAN = new THREE.Color("#8fe6ff");

// ------------------------------------------------------------------ transmission line

const LINE_PULSES = 6;

/**
 * A transmission corridor between two endpoints given in `visual` (x1,z1,x2,z2, local to pos).
 * The route bows so that it passes through the equipment position, which is where it is selected.
 * Conductors glow with load: warm when live, amber near rating, pulsing red when overloaded, dark when tripped.
 */
export function Line({ def }: EquipProps) {
  const v = def.visual ?? {};
  const old = !!v.old;
  const height = old ? 5.2 : 8.5;
  const arm = old ? 1.5 : 2;
  const wireY = old ? height - 0.4 : height - 1.6;

  const built = useMemo(() => {
    const p1 = new THREE.Vector3(Number(v.x1 ?? -15), 0, Number(v.z1 ?? 0));
    const p2 = new THREE.Vector3(Number(v.x2 ?? 15), 0, Number(v.z2 ?? 0));
    const c = p1.clone().add(p2).multiplyScalar(-0.5);
    const route = new THREE.QuadraticBezierCurve3(p1, c, p2);
    const n = old ? 7 : 5;
    const towers: { p: THREE.Vector3; rot: number; perp: THREE.Vector3 }[] = [];
    for (let i = 0; i < n; i++) {
      const t = 0.07 + (i / (n - 1)) * 0.86;
      const p = route.getPoint(t);
      const tan = route.getTangent(t);
      towers.push({ p, rot: Math.atan2(-tan.z, tan.x), perp: new THREE.Vector3(-tan.z, 0, tan.x).normalize() });
    }
    // Conductor attachment points per phase: both ends drop to substation height.
    const phases = old ? [-1, 0, 1] : [-1, 1, 0];
    const tubes: THREE.BufferGeometry[] = [];
    const centre: THREE.Vector3[] = [];
    phases.forEach((ph, k) => {
      const pts: THREE.Vector3[] = [];
      const off = (perp: THREE.Vector3, y: number) => (base: THREE.Vector3) => base.clone().addScaledVector(perp, ph * arm * (old ? 0.9 : 0.95)).setY(y);
      pts.push(off(towers[0].perp, 3.1)(p1));
      for (const tw of towers) pts.push(off(tw.perp, !old && ph === 0 ? height - 3.7 : wireY)(tw.p));
      pts.push(off(towers[n - 1].perp, 3.1)(p2));
      for (let i = 0; i < pts.length - 1; i++) {
        const cat = catenary(pts[i], pts[i + 1], i === 0 || i === pts.length - 2 ? 0.02 : 0.055, 7);
        tubes.push(new THREE.TubeGeometry(cat, 7, old ? 0.05 : 0.06, 4, false));
        if (k === 0) centre.push(...cat.getPoints(5));
      }
    });
    const wires = mergeGeometries(tubes)!;
    tubes.forEach((t) => t.dispose());
    const mid = towers[Math.floor(n / 2)];
    return { towers, wires, path: new THREE.CatmullRomCurve3(centre), mid, perpMid: mid.perp };
  }, [v.x1, v.z1, v.x2, v.z2, old, arm, height, wireY]);

  const towerGeo = useMemo(() => towerGeometry(height, arm, old), [height, arm, old]);
  const wireMat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#aab3bb", metalness: 0.8, roughness: 0.4, emissive: "#000000" }), []);
  const pulseMat = useMemo(glowMat, []);
  const wires = useRef<THREE.Mesh>(null);
  const pulses = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  const phase = useRef(Math.random());

  useFrame(({ clock }, dt) => {
    const s = equipState(def.id);
    if (!s) return;
    const live = !s.tripped && s.out > 0.05;
    const time = clock.elapsedTime;
    let k = 0;
    if (live) {
      if (s.overloadTimer > 0 || s.load > 1.12) {
        col.copy(C_RED);
        k = 1.6 + Math.sin(time * (8 + s.overloadTimer)) * 0.9;
      } else if (s.load > 0.92) {
        col.copy(C_AMBER);
        k = 0.9 + (s.load - 0.92) * 3;
      } else {
        col.copy(C_LIVE);
        k = 0.22 + s.load * 0.25;
      }
      if (s.arming) k += Math.sin(time * 14) > 0 ? 0.8 : 0;
    }
    wireMat.emissive.copy(col).multiplyScalar(k * (1 - viewFx.mix * 0.6));
    wireMat.color.set(s.tripped ? "#3a4048" : "#aab3bb");
    // A tripped line hangs slack.
    if (wires.current) wires.current.position.y = THREE.MathUtils.damp(wires.current.position.y, s.tripped ? -0.9 : 0, 5, dt);
    const im = pulses.current;
    if (im) {
      im.visible = live;
      if (live) {
        phase.current += dt * (0.1 + Math.min(1.6, s.load) * 0.16);
        pulseMat.color.copy(s.load > 1.12 ? C_RED : s.load > 0.92 ? C_AMBER : C_LIVE).multiplyScalar(3 * (1 - viewFx.mix * 0.7));
        for (let i = 0; i < LINE_PULSES; i++) {
          const t = (phase.current + i / LINE_PULSES) % 1;
          built.path.getPoint(t, dummy.position);
          dummy.scale.setScalar(0.11 + Math.sin(t * Math.PI) * 0.08);
          dummy.updateMatrix();
          im.setMatrixAt(i, dummy.matrix);
        }
        im.instanceMatrix.needsUpdate = true;
      }
    }
  });

  const mid = built.mid;
  const arcA: Vec3 = [mid.p.x + built.perpMid.x * arm, wireY, mid.p.z + built.perpMid.z * arm];
  const arcB: Vec3 = [mid.p.x - built.perpMid.x * arm, wireY - (old ? 0 : 0.2), mid.p.z - built.perpMid.z * arm];
  return (
    <group>
      {built.towers.map((t, i) => (
        <group key={i} position={t.p} rotation={[0, t.rot, 0]}>
          <mesh geometry={towerGeo} material={old ? MAT.wood : MAT.galvanized} castShadow />
          <Lamp p={[0, height + (old ? 0.2 : 1), 0]} size={0.14} state={equipLamp(def.id)} />
        </group>
      ))}
      <mesh ref={wires} geometry={built.wires} material={wireMat} />
      <instancedMesh ref={pulses} args={[undefined, undefined, LINE_PULSES]} material={pulseMat} frustumCulled={false}>
        <sphereGeometry args={[1, 8, 6]} />
      </instancedMesh>
      <Arc
        a={arcA}
        b={arcB}
        active={() => {
          const s = equipState(def.id);
          const g = game();
          return !!s && !!g && ((s.tripped && g.time - s.tripAt < 1.4) || s.overloadTimer > 5);
        }}
      />
      {/* overloaded conductors shed sparks before they let go */}
      <Particles p={[mid.p.x, wireY, mid.p.z]} count={24} rate={() => Math.max(0, (equipState(def.id)?.overloadTimer ?? 0) - 1) * 4} color="#ffb020" intensity={3} size={[0.7, 0.15]} life={[0.4, 0.9]} velocity={[0, 0.6, 0]} jitter={3} radius={arm} gravity={9} additive opacity={0.95} />
      {/* generous invisible hit target around the middle of the corridor */}
      <mesh visible={false} position={[mid.p.x, height / 2, mid.p.z]} rotation={[0, mid.rot, 0]}>
        <boxGeometry args={[9, height + 1, arm * 2 + 2]} />
      </mesh>
      <Label text={def.name.split(" · ")[0].toUpperCase()} p={[mid.p.x, height + 2.4, mid.p.z]} size={0.62} color="#ffe2b0" opacityRef={() => 0.7 * (1 - viewFx.mix * 0.6)} />
    </group>
  );
}

// ------------------------------------------------------------------ power plant

const coolingTowerGeo = (() => {
  let g: THREE.LatheGeometry | null = null;
  return () => {
    if (g) return g;
    const pts: THREE.Vector2[] = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector2(1.35 + Math.pow(Math.abs(t - 0.68), 1.7) * 2.2, t * 6));
    }
    g = new THREE.LatheGeometry(pts, 20);
    return g;
  };
})();

function useWindowGlow(id: string, color = "#ffd58a", base = 2) {
  const mat = useMemo(glowMat, []);
  const cur = useRef(1);
  const c = useMemo(() => new THREE.Color(color), [color]);
  useFrame(({ clock }, dt) => {
    const s = equipState(id);
    if (!s) return;
    const target = s.tripped ? 0 : Math.min(1, s.out + 0.15);
    cur.current = THREE.MathUtils.damp(cur.current, target, target < cur.current ? 8 : 2, dt);
    const flick = s.manip || s.arming ? (Math.sin(clock.elapsedTime * 22) > 0 ? 1 : 0.35) : 1;
    mat.color.copy(c).multiplyScalar(base * cur.current * flick + 0.03);
  });
  return mat;
}

function Stack({ p, h, id, r = 0.45 }: { p: Vec3; h: number; id: string; r?: number }) {
  return (
    <group position={p}>
      <Cyl p={[0, h / 2, 0]} s={[r, h, r]} m={MAT.concrete} />
      <Cyl p={[0, h - 0.5, 0]} s={[r * 1.06, 0.5, r * 1.06]} m={MAT.paintRed} shadow={false} />
      <Cyl p={[0, h - 1.7, 0]} s={[r * 1.06, 0.5, r * 1.06]} m={MAT.paintRed} shadow={false} />
      <Lamp p={[r + 0.1, h, 0]} size={0.16} state={() => ({ color: PALETTE.red, off: Math.sin(performance.now() / 700) < -0.2 })} />
      <Particles p={[0, h + 0.2, 0]} count={22} rate={() => {
        const s = equipState(id);
        return s && !s.tripped ? s.out * 5 : 0;
      }} color="#59616c" size={[1.2, 4.5]} life={[2.5, 4.5]} velocity={[0.7, 2.2, 0.2]} radius={r * 0.6} opacity={0.5} drift={1.4} />
    </group>
  );
}

export function Plant({ def }: EquipProps) {
  const peaker = !!def.visual?.peaker;
  const windows = useWindowGlow(def.id);
  const yard = useWindowGlow(def.id, "#bfe6ff", 2.4);
  const live = () => {
    const s = equipState(def.id);
    return s && !s.tripped ? s.out : 0;
  };
  return (
    <group scale={peaker ? 0.86 : 1}>
      <Box p={[0, 0.12, 0]} s={[14, 0.24, 11]} m={MAT.concreteDark} shadow={false} />
      {/* turbine hall */}
      <Box p={[-0.6, 2.2, 0.4]} s={[7.2, 4, 4.6]} m={MAT.wallDark} />
      <Box p={[-0.6, 4.35, 0.4]} s={[7.5, 0.3, 4.9]} m={MAT.darkSteel} />
      {[1.3, 2.7].map((y) => (
        <mesh key={y} material={windows} position={[-0.6, y, 2.72]}>
          <planeGeometry args={[6.4, 0.5]} />
        </mesh>
      ))}
      <mesh material={windows} position={[-4.22, 2.4, 0.4]} rotation={[0, -Math.PI / 2, 0]}>
        <planeGeometry args={[3.6, 0.9]} />
      </mesh>
      {/* roof vents */}
      {[-2.6, -0.6, 1.4].map((x) => (
        <Box key={x} p={[x, 4.75, 0.4]} s={[0.9, 0.5, 2.6]} m={MAT.paintGrey} />
      ))}
      {peaker ? (
        <>
          {[-2.6, 0, 2.6].map((x, i) => (
            <group key={x}>
              <Box p={[x, 1.6, -3]} s={[2, 2.8, 2.2]} m={MAT.paintGrey} />
              <Stack p={[x, 0, -3]} h={7.5 + (i % 2)} id={def.id} r={0.38} />
            </group>
          ))}
          <Cyl p={[5.2, 1.5, 2.6]} s={[1.5, 3, 1.5]} m={MAT.paintLight} />
          <Cyl p={[5.2, 1.5, -1.2]} s={[1.5, 3, 1.5]} m={MAT.paintLight} />
        </>
      ) : (
        <>
          {/* heat-recovery boiler with catwalks */}
          <Box p={[4.2, 3.4, -1.6]} s={[3, 6.6, 3.6]} m={MAT.darkSteel} />
          {[2, 3.8, 5.6].map((y) => (
            <Box key={y} p={[4.2, y, -1.6]} s={[3.3, 0.08, 3.9]} m={MAT.galvanized} shadow={false} />
          ))}
          <Beam a={[2.4, 4.4, 0]} b={[1, 4.4, 0.4]} radius={0.28} m={MAT.paintOrange} />
          <Stack p={[5, 0, 1.7]} h={12.5} id={def.id} />
          <Stack p={[3.4, 0, 2.4]} h={10.5} id={def.id} r={0.4} />
          {/* cooling tower with a plume that dies with the unit */}
          <mesh geometry={coolingTowerGeo()} material={MAT.concrete} position={[-4.6, 0.2, -3.2]} castShadow />
          <Particles p={[-4.6, 6.3, -3.2]} count={34} rate={() => live() * 9} color="#d5dde6" size={[1.6, 6.5]} life={[3, 5]} velocity={[0.6, 2, 0.1]} radius={1.1} opacity={0.34} drift={1.5} />
          <Cyl p={[0.5, 1.2, -3.6]} s={[1.3, 2.4, 1.3]} m={MAT.paintLight} />
        </>
      )}
      {/* step-up yard */}
      <group position={[-5, 0, 3.6]}>
        <Box p={[0, 0.9, 0]} s={[1.6, 1.4, 1.2]} m={MAT.paintGrey} />
        {[-0.45, 0, 0.45].map((x) => (
          <Insulator key={x} p={[x, 1.6, 0]} height={0.9} radius={0.13} sheds={4} />
        ))}
        <Beam a={[-1.2, 0.2, 1]} b={[-1.2, 3.4, 1]} radius={0.06} m={MAT.galvanized} square />
        <Beam a={[1.2, 0.2, 1]} b={[1.2, 3.4, 1]} radius={0.06} m={MAT.galvanized} square />
        <Beam a={[-1.4, 3.4, 1]} b={[1.4, 3.4, 1]} radius={0.06} m={MAT.galvanized} square />
        <mesh material={yard} position={[0, 3.55, 1]} scale={[2.6, 0.06, 0.06]}>
          <boxGeometry />
        </mesh>
      </group>
      {/* control room annex */}
      <Box p={[-3.6, 1, 3.4]} s={[1.4, 1.6, 1.6]} m={MAT.paintLight} />
      <Lamp p={[-3.6, 2, 3.4]} size={0.22} state={equipLamp(def.id)} />
      <Lamp p={[3, 4.75, 2.9]} size={0.2} state={equipLamp(def.id)} />
      <HeatPlume p={[-0.6, 4.6, 0.4]} heat={() => equipState(def.id)?.heat ?? 0} fire={() => equipState(def.id)?.fire ?? 0} />
    </group>
  );
}

// ------------------------------------------------------------------ wind farm

const windTowerGeo = new THREE.CylinderGeometry(0.14, 0.3, 8.5, 10);
const bladeGeo = (() => {
  const g = new THREE.BoxGeometry(0.08, 3.6, 0.5);
  g.translate(0, 1.85, 0);
  return g;
})();

function WindTurbine({ p, id, k }: { p: Vec3; id: string; k: number }) {
  return (
    <group position={p} rotation={[0, 0.25 + k * 0.07, 0]}>
      <mesh geometry={windTowerGeo} material={MAT.paintLight} position={[0, 4.25, 0]} castShadow />
      <Box p={[0.15, 8.6, 0]} s={[1.1, 0.42, 0.42]} m={MAT.paintLight} />
      <Spinner
        p={[-0.5, 8.6, 0]}
        r={[k * 1.3, 0, 0]}
        axis="x"
        speed={() => {
          const s = equipState(id);
          const g = game();
          if (!s || s.tripped) return 0;
          return s.out * (2.1 + (k % 3) * 0.25) * (g?.weather === "storm" ? 1.5 : 1);
        }}
      >
        {[0, 1, 2].map((i) => (
          <mesh key={i} geometry={bladeGeo} material={MAT.paintLight} rotation={[(i * Math.PI * 2) / 3, 0, 0]} castShadow />
        ))}
        <mesh material={MAT.paintGrey} scale={[0.3, 0.22, 0.22]}>
          <sphereGeometry args={[1, 10, 8]} />
        </mesh>
      </Spinner>
      <Lamp p={[0.3, 8.95, 0]} size={0.13} state={() => ({ color: PALETTE.red, off: Math.sin(performance.now() / 650 + k) < 0 })} />
    </group>
  );
}

export function WindFarm({ def }: EquipProps) {
  const spots: Vec3[] = [
    [-5.5, 0, -6],
    [0.5, 0, -8],
    [5.5, 0, -4],
    [-3, 0, 1],
    [3.5, 0, 3],
    [-6, 0, 7],
    [0, 0, 8],
  ];
  const glow = useWindowGlow(def.id, "#bfe6ff", 2.2);
  return (
    <group>
      {spots.map((p, i) => (
        <WindTurbine key={i} p={p} id={def.id} k={i} />
      ))}
      {/* collector station */}
      <Box p={[6, 0.1, 8]} s={[4, 0.2, 3.4]} m={MAT.concreteDark} shadow={false} />
      <Box p={[6.6, 0.95, 8]} s={[1.6, 1.5, 1.4]} m={MAT.paintLight} />
      <Box p={[4.9, 0.75, 8]} s={[1, 1.1, 1]} m={MAT.paintGrey} />
      {[-0.3, 0, 0.3].map((z) => (
        <Insulator key={z} p={[4.9, 1.3, 8 + z]} height={0.7} radius={0.1} sheds={3} />
      ))}
      <mesh material={glow} position={[6.6, 1.2, 8.71]}>
        <planeGeometry args={[1, 0.3]} />
      </mesh>
      <Lamp p={[6.6, 1.95, 8]} size={0.22} state={equipLamp(def.id)} />
    </group>
  );
}

// ------------------------------------------------------------------ substation

export function Substation({ def }: EquipProps) {
  const big = !!def.visual?.big;
  const bus = useMemo(() => new THREE.MeshStandardMaterial({ color: "#c5ccd3", metalness: 0.9, roughness: 0.3, emissive: "#000000" }), []);
  const yardLight = useWindowGlow(def.id, "#ffe6b8", 2.6);
  useFrame(({ clock }) => {
    const s = equipState(def.id);
    if (!s) return;
    const live = !s.tripped && s.out > 0.05;
    const k = live ? 0.35 + s.out * 0.3 : 0;
    bus.emissive.copy(s.manip || s.arming ? C_RED : C_CYAN).multiplyScalar((s.arming ? (Math.sin(clock.elapsedTime * 14) > 0 ? 1.4 : 0.2) : k) * (1 - viewFx.mix * 0.5));
  });
  const w = 8;
  return (
    <group scale={big ? 1.3 : 1}>
      <Box p={[0, 0.1, 0]} s={[w + 2, 0.2, 7.6]} m={MAT.concreteDark} shadow={false} />
      <Box p={[0, 0.22, 0]} s={[w + 1.4, 0.05, 7]} m={MAT.concrete} shadow={false} />
      {/* gantries */}
      {[-w / 2, w / 2].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Beam a={[0, 0.2, -2.3]} b={[0, 4.6, -2.3]} radius={0.09} m={MAT.galvanized} square />
          <Beam a={[0, 0.2, 2.3]} b={[0, 4.6, 2.3]} radius={0.09} m={MAT.galvanized} square />
          <Beam a={[0, 4.6, -2.6]} b={[0, 4.6, 2.6]} radius={0.1} m={MAT.galvanized} square />
          <Beam a={[0, 0.3, -2.3]} b={[0, 4.4, 2.3]} radius={0.03} m={MAT.galvanized} shadow={false} />
        </group>
      ))}
      {/* three-phase bus on post insulators */}
      {[-1.4, 0, 1.4].map((z) => (
        <group key={z}>
          <mesh material={bus} position={[0, 3.1, z]} rotation={[0, 0, Math.PI / 2]} scale={[0.07, w, 0.07]}>
            <cylinderGeometry args={[1, 1, 1, 8]} />
          </mesh>
          {[-2.4, 0, 2.4].map((x) => (
            <group key={x}>
              <Insulator p={[x, 1.9, z]} height={1.15} radius={0.13} sheds={5} />
              <Beam a={[x, 0.2, z]} b={[x, 1.9, z]} radius={0.05} m={MAT.galvanized} />
            </group>
          ))}
        </group>
      ))}
      {/* transformers */}
      {[-1.9, 1.9].map((x) => (
        <group key={x} position={[x, 0, -2.6]}>
          <Box p={[0, 1, 0]} s={[1.9, 1.5, 1.3]} m={MAT.paintGrey} />
          {[-0.6, -0.2, 0.2, 0.6].map((fx) => (
            <Box key={fx} p={[fx, 1, -0.82]} s={[0.07, 1.2, 0.34]} m={MAT.paintLight} shadow={false} />
          ))}
          {[-0.5, 0, 0.5].map((ix) => (
            <Insulator key={ix} p={[ix, 1.75, 0]} height={0.75} radius={0.11} sheds={4} />
          ))}
        </group>
      ))}
      {/* breakers with individual lamps */}
      {[-2.6, 0, 2.6].map((x) => (
        <group key={x} position={[x, 0, 2.7]}>
          <Box p={[0, 0.85, 0]} s={[0.8, 1.3, 0.7]} m={MAT.paintTeal} />
          <Insulator p={[-0.2, 1.5, 0]} height={0.6} radius={0.09} sheds={3} />
          <Insulator p={[0.2, 1.5, 0]} height={0.6} radius={0.09} sheds={3} />
          <Lamp p={[0, 1.2, 0.4]} size={0.13} state={equipLamp(def.id)} />
        </group>
      ))}
      {/* relay kiosk and yard lights */}
      <Box p={[w / 2 + 0.2, 0.9, -2.7]} s={[1.3, 1.5, 1.3]} m={MAT.paintLight} />
      <Lamp p={[w / 2 + 0.2, 1.9, -2.7]} size={0.24} state={equipLamp(def.id)} />
      {[
        [-w / 2 - 0.6, 3.3],
        [w / 2 + 0.6, 3.3],
      ].map(([x, z]) => (
        <group key={x} position={[x, 0, z]}>
          <Beam a={[0, 0, 0]} b={[0, 4.2, 0]} radius={0.05} m={MAT.galvanized} />
          <mesh material={yardLight} position={[0, 4.25, 0]} scale={0.17}>
            <sphereGeometry args={[1, 8, 6]} />
          </mesh>
        </group>
      ))}
      <Arc
        a={[-2.4, 3.1, -1.4]}
        b={[2.4, 3.1, 1.4]}
        active={() => {
          const s = equipState(def.id);
          const g = game();
          return !!s && !!g && s.tripped && g.time - s.tripAt < 1.2;
        }}
      />
      <HeatPlume p={[0, 2, -2.6]} heat={() => equipState(def.id)?.heat ?? 0} fire={() => equipState(def.id)?.fire ?? 0} />
    </group>
  );
}

// ------------------------------------------------------------------ city district

function StreetLights({ id, w, d }: { id: string; w: number; d: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(glowMat, []);
  const cur = useRef(1);
  const pts = useMemo(() => {
    const out: Vec3[] = [];
    for (let x = -w; x <= w + 0.01; x += w / 3) {
      out.push([x, 0.7, -d], [x, 0.7, d]);
    }
    for (let z = -d + d / 2; z < d; z += d / 2) out.push([-w, 0.7, z], [w, 0.7, z]);
    return out;
  }, [w, d]);
  useFrame((_, dt) => {
    const im = ref.current;
    if (im && !im.userData.set) {
      const o = new THREE.Object3D();
      pts.forEach((p, i) => {
        o.position.set(...p);
        o.scale.setScalar(0.16);
        o.updateMatrix();
        im.setMatrixAt(i, o.matrix);
      });
      im.instanceMatrix.needsUpdate = true;
      im.userData.set = true;
    }
    const s = equipState(id);
    const target = s ? Math.min(1, s.out / Math.max(0.05, s.setpoint)) : 1;
    cur.current = THREE.MathUtils.damp(cur.current, target, target < cur.current ? 9 : 2, dt);
    mat.color.set("#ffcf8a").multiplyScalar(2.6 * cur.current + 0.02);
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, pts.length]} material={mat} frustumCulled={false}>
      <sphereGeometry args={[1, 6, 4]} />
    </instancedMesh>
  );
}

/** Landmark tower with a glowing crown: marks the priority district. */
function Spire({ id }: { id: string }) {
  const crown = useWindowGlow(id, "#6fe3ff", 3);
  return (
    <group position={[1.5, 0, -1]}>
      <Box p={[0, 9, 0]} s={[2.6, 18, 2.6]} m={MAT.wallDark} />
      <Box p={[0, 19.2, 0]} s={[1.8, 2.4, 1.8]} m={MAT.darkSteel} />
      {[4, 8, 12, 16].map((y) => (
        <mesh key={y} material={crown} position={[0, y, 0]} scale={[2.68, 0.12, 2.68]}>
          <boxGeometry />
        </mesh>
      ))}
      <mesh material={crown} position={[0, 20.5, 0]} scale={[1.9, 0.2, 1.9]}>
        <boxGeometry />
      </mesh>
      <Cyl p={[0, 22.4, 0]} s={[0.06, 3.6, 0.06]} m={MAT.steel} low />
      <Lamp p={[0, 24.3, 0]} size={0.2} state={() => ({ color: PALETTE.red, off: Math.sin(performance.now() / 800) < 0 })} />
    </group>
  );
}

export function District({ def }: EquipProps) {
  const v = def.visual ?? {};
  const spread = Number(v.spread ?? 9);
  const count = Number(v.count ?? 18);
  const tall = Number(v.tall ?? 0.25);
  const label = String(v.label ?? def.name.toUpperCase());
  const power = () => equipState(def.id)?.out ?? 0;
  const seed = label.length * 7 + count;
  const w = spread + 2.5;
  const d = spread * 0.7 + 2.5;
  const top = v.priority ? 27 : 6 + tall * 40;
  return (
    <group>
      <Box p={[0, 0.06, 0]} s={[w * 2, 0.12, d * 2]} m={MAT.asphalt} shadow={false} />
      <LitBuildings power={power} variant="city" seed={seed} spread={spread} count={count} tall={tall} />
      <StreetLights id={def.id} w={w - 0.4} d={d - 0.4} />
      {!!v.priority && (
        <>
          <Spire id={def.id} />
          <group position={[-spread + 2.5, 0, d - 3]} scale={0.5}>
            <LitBuildings power={power} variant="hospital" seed={3} count={0} />
          </group>
        </>
      )}
      {!!v.harbor && (
        <group position={[w - 1, 0, 0]}>
          {[-4, 3].map((z) => (
            <group key={z} position={[0, 0, z]}>
              <Beam a={[-0.8, 0, -0.9]} b={[-0.8, 5, -0.9]} radius={0.1} m={MAT.paintOrange} square />
              <Beam a={[-0.8, 0, 0.9]} b={[-0.8, 5, 0.9]} radius={0.1} m={MAT.paintOrange} square />
              <Beam a={[0.8, 0, -0.9]} b={[0.8, 5, -0.9]} radius={0.1} m={MAT.paintOrange} square />
              <Beam a={[0.8, 0, 0.9]} b={[0.8, 5, 0.9]} radius={0.1} m={MAT.paintOrange} square />
              <Beam a={[-2.5, 5.2, 0]} b={[4.5, 5.2, 0]} radius={0.16} m={MAT.paintOrange} square />
              <Beam a={[0, 7, 0]} b={[4.5, 5.2, 0]} radius={0.04} m={MAT.steel} shadow={false} />
              <Beam a={[0, 5.2, 0]} b={[0, 7, 0]} radius={0.08} m={MAT.paintOrange} square />
            </group>
          ))}
        </group>
      )}
      {!!v.industrial && (
        <group>
          <Box p={[-4, 1.6, 2]} s={[6, 3.2, 4]} m={MAT.wallDark} />
          <Box p={[3.5, 1.2, -2]} s={[5, 2.4, 3]} m={MAT.darkSteel} />
          {[
            [-5.5, 2],
            [-2.5, 2.6],
            [4.5, -2],
          ].map(([x, z], i) => (
            <group key={i} position={[x, 0, z]}>
              <Cyl p={[0, 3.6, 0]} s={[0.35, 7.2, 0.35]} m={MAT.concrete} />
              <Particles p={[0, 7.3, 0]} count={14} rate={() => power() * 3} color="#6a5a50" size={[1, 3.6]} life={[2, 3.5]} velocity={[0.6, 1.8, 0]} radius={0.2} opacity={0.45} drift={1.2} />
              <Particles p={[0, 7.2, 0]} count={6} rate={() => (i === 0 ? power() * 4 : 0)} color="#ff8a2a" intensity={3} size={[1.2, 0.3]} life={[0.3, 0.6]} velocity={[0, 1.6, 0]} radius={0.15} additive opacity={0.8} />
            </group>
          ))}
        </group>
      )}
      {/* feeder kiosk: equipment state plus a load-shed indicator */}
      <group position={[-w + 0.6, 0, -d + 0.6]}>
        <Box p={[0, 0.7, 0]} s={[1.1, 1.2, 0.9]} m={MAT.paintLight} />
        <Lamp p={[0, 1.55, 0]} size={0.24} state={equipLamp(def.id)} />
        <Beam a={[0.9, 0, 0]} b={[0.9, 3.2, 0]} radius={0.05} m={MAT.galvanized} />
        <Lamp
          p={[0.9, 3.4, 0]}
          size={0.26}
          state={() => {
            const s = equipState(def.id);
            return { color: PALETTE.amber, flash: true, off: !s || s.setpoint >= 1 };
          }}
        />
      </group>
      <Label text={label} p={[0, top, 0]} size={0.74} color="#ffe2b0" opacityRef={() => 0.85} />
    </group>
  );
}

// ------------------------------------------------------------------ static distribution feed (scenery that reacts)

/**
 * Short pole line between two world points with moving pulses while `flow()` > 0.
 * Used by the environment for generator ties and substation-to-district feeders.
 */
export function StaticFeed({ from, to, flow, height = 3.4, color = "#ffe2a0" }: { from: Vec3; to: Vec3; flow: () => number; height?: number; color?: string }) {
  const built = useMemo(() => {
    const a = new THREE.Vector3(from[0], 0, from[2]);
    const b = new THREE.Vector3(to[0], 0, to[2]);
    const len = a.distanceTo(b);
    const n = Math.max(2, Math.round(len / 7) + 1);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) pts.push(a.clone().lerp(b, i / (n - 1)).setY(height));
    const tubes: THREE.BufferGeometry[] = [];
    const centre: THREE.Vector3[] = [];
    for (let i = 0; i < n - 1; i++) {
      const cat = catenary(pts[i], pts[i + 1], 0.04, 6);
      tubes.push(new THREE.TubeGeometry(cat, 6, 0.04, 3, false));
      centre.push(...cat.getPoints(4));
    }
    const poles = mergeGeometries(pts.map((p) => beamGeo([p.x, 0, p.z], [p.x, height + 0.15, p.z], 0.07)))!;
    return { wires: mergeGeometries(tubes)!, poles, path: new THREE.CatmullRomCurve3(centre), n: Math.max(2, Math.round(len / 9)) };
  }, [from, to, height]);
  const mat = useMemo(glowMat, []);
  const wire = useMemo(() => new THREE.MeshStandardMaterial({ color: "#8d959c", metalness: 0.7, roughness: 0.5, emissive: "#000000" }), []);
  const ref = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const phase = useRef(Math.random());
  const c = useMemo(() => new THREE.Color(color), [color]);
  useFrame((_, dt) => {
    const f = flow();
    const im = ref.current;
    wire.emissive.copy(c).multiplyScalar(f > 0.05 ? 0.16 * (1 - viewFx.mix * 0.6) : 0);
    if (!im) return;
    im.visible = f > 0.05;
    if (!im.visible) return;
    phase.current += dt * 0.3 * Math.min(1.2, f);
    mat.color.copy(c).multiplyScalar(2.6 * (1 - viewFx.mix * 0.7));
    for (let i = 0; i < built.n; i++) {
      const t = (phase.current + i / built.n) % 1;
      built.path.getPoint(t, dummy.position);
      dummy.scale.setScalar(0.1 + Math.sin(t * Math.PI) * 0.06);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <mesh geometry={built.poles} material={MAT.wood} castShadow />
      <mesh geometry={built.wires} material={wire} />
      <instancedMesh ref={ref} args={[undefined, undefined, built.n]} material={mat} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 4]} />
      </instancedMesh>
    </group>
  );
}
