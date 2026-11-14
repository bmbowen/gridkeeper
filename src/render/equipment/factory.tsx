"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { EquipDef, Vec3 } from "@/sim/types";
import { GEO, MAT, glow } from "../materials";
import { Beam, Box, Cyl, Label, Lamp, Particles, Spinner } from "../parts";
import { equipState, PALETTE } from "../util";
import { equipLamp, type EquipProps } from "./substation";

// ------------------------------------------------------------------ shared factory bits

const panelMat = new THREE.MeshBasicMaterial({ color: "#f2c230", transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false });
const beltMat = new THREE.MeshStandardMaterial({ color: "#15181c", roughness: 0.75, metalness: 0.1 });
const cardboard = new THREE.MeshStandardMaterial({ color: "#a67c4e", roughness: 0.9 });
const palletMat = new THREE.MeshStandardMaterial({ color: "#6b5236", roughness: 0.95 });
const sheetMat = new THREE.MeshStandardMaterial({ color: "#b9c2ca", metalness: 0.9, roughness: 0.28 });
const trayMat = new THREE.MeshStandardMaterial({ color: "#3d4854", metalness: 0.8, roughness: 0.4 });
const packMat = new THREE.MeshStandardMaterial({ color: "#1d5fa8", metalness: 0.4, roughness: 0.4, emissive: "#38d6ff", emissiveIntensity: 0.35 });
const PRODUCT = [
  { mat: sheetMat, s: [1.0, 0.06, 0.8] as Vec3 },
  { mat: trayMat, s: [1.0, 0.26, 0.8] as Vec3 },
  { mat: packMat, s: [1.0, 0.36, 0.8] as Vec3 },
];

/** Is this unit taking bad commands and still moving? */
const erratic = (id: string) => {
  const s = equipState(id);
  return !!s && s.manip && !s.tripped && s.setpoint > 0;
};

/**
 * Andon stack light: green running, amber waiting / abnormal, red stopped or unsafe.
 * The top beacon is the standard equipment lamp.
 */
export function Andon({ id, p, height = 3 }: { id: string; p?: Vec3; height?: number }) {
  const mats = useMemo(() => [new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial(), new THREE.MeshBasicMaterial()].map((m) => ((m.toneMapped = false), m)), []);
  const cols = useMemo(() => [new THREE.Color(PALETTE.red), new THREE.Color(PALETTE.amber), new THREE.Color(PALETTE.green)], []);
  useFrame(({ clock }) => {
    const s = equipState(id);
    if (!s) return;
    const blink = Math.sin(clock.elapsedTime * 9) > 0 ? 1 : 0.15;
    const red = s.tripped || s.manip || s.condition <= 0 || s.setpoint === 0;
    const amber = !red && (s.arming || s.local || s.out < 0.05);
    const green = !red && !amber;
    mats[0].color.copy(cols[0]).multiplyScalar(red ? (s.manip ? 3 * blink + 0.3 : 2.4) : 0.07);
    mats[1].color.copy(cols[1]).multiplyScalar(amber ? (s.arming ? 3 * blink + 0.3 : 2.2) : 0.07);
    mats[2].color.copy(cols[2]).multiplyScalar(green ? 2 : 0.07);
  });
  return (
    <group position={p}>
      <Cyl p={[0, height / 2, 0]} s={[0.04, height, 0.04]} m={MAT.steel} low shadow={false} />
      {mats.map((m, i) => (
        <mesh key={i} geometry={GEO.cyl} material={m} position={[0, height + 0.48 - i * 0.2, 0]} scale={[0.1, 0.18, 0.1]} />
      ))}
      <Lamp p={[0, height + 0.72, 0]} size={0.09} state={equipLamp(id)} />
    </group>
  );
}

/** Roller-frame conveyor section along local X, centred on the origin. Belt top at y = 1. */
function ConveyorFrame({ length, width = 1.3 }: { length: number; width?: number }) {
  const legs = useMemo(() => {
    const n = Math.max(2, Math.round(length / 3.2) + 1);
    return Array.from({ length: n }, (_, i) => -length / 2 + 0.3 + (i * (length - 0.6)) / (n - 1));
  }, [length]);
  return (
    <group>
      <Box p={[0, 0.94, 0]} s={[length, 0.1, width - 0.12]} m={beltMat} shadow={false} />
      <Box p={[0, 0.98, width / 2]} s={[length, 0.26, 0.07]} m={MAT.paintBlue} shadow={false} />
      <Box p={[0, 0.98, -width / 2]} s={[length, 0.26, 0.07]} m={MAT.paintBlue} />
      <Cyl p={[length / 2, 0.92, 0]} s={[0.13, width - 0.1, 0.13]} r={[Math.PI / 2, 0, 0]} m={MAT.steel} low shadow={false} />
      <Cyl p={[-length / 2, 0.92, 0]} s={[0.13, width - 0.1, 0.13]} r={[Math.PI / 2, 0, 0]} m={MAT.steel} low shadow={false} />
      {legs.map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Box p={[0, 0.44, width / 2 - 0.04]} s={[0.09, 0.88, 0.09]} m={MAT.darkSteel} shadow={false} />
          <Box p={[0, 0.44, -width / 2 + 0.04]} s={[0.09, 0.88, 0.09]} m={MAT.darkSteel} shadow={false} />
          <Box p={[0, 0.3, 0]} s={[0.06, 0.06, width - 0.1]} m={MAT.darkSteel} shadow={false} />
        </group>
      ))}
    </group>
  );
}

/**
 * Products riding a belt. They advance with the unit's output, freeze in place when the
 * unit is halted, and thin out to an empty belt when the line upstream has run dry.
 */
function BeltProducts({ id, length, stage, y = 1.0, spacing = 1.9, rate = 1.5 }: { id: string; length: number; stage: number; y?: number; spacing?: number; rate?: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const n = Math.max(1, Math.floor(length / spacing));
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const st = useRef({ offset: 0, fill: 1 });
  const prod = PRODUCT[Math.max(0, Math.min(2, stage))];
  useFrame((_, dtRaw) => {
    const im = ref.current;
    const s = equipState(id);
    if (!im || !s) return;
    const dt = Math.min(dtRaw, 0.05);
    const halted = s.tripped || s.manip || s.setpoint === 0 || s.condition <= 0;
    const moving = Math.min(1.2, s.out);
    st.current.offset = (st.current.offset + moving * rate * dt) % spacing;
    // Starved (running but nothing arriving) → belt empties. Halted → parts stay where they are.
    const target = halted || moving > 0.05 ? 1 : 0;
    st.current.fill = THREE.MathUtils.damp(st.current.fill, target, 1.2, dt);
    const total = n * spacing;
    for (let i = 0; i < n; i++) {
      const x = -total / 2 + ((st.current.offset + i * spacing) % total);
      // Parts grow in at the head of the belt and shrink out at the tail.
      const edge = Math.max(0, Math.min(1, (total / 2 - Math.abs(x)) * 2.5));
      dummy.position.set(x, y + prod.s[1] / 2, 0);
      dummy.scale.set(prod.s[0], prod.s[1], prod.s[2]).multiplyScalar(st.current.fill * edge);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  });
  return <instancedMesh ref={ref} args={[GEO.box, prod.mat, n]} castShadow frustumCulled={false} />;
}

// ------------------------------------------------------------------ conveyor

export function Conveyor({ def }: EquipProps) {
  const length = Number(def.visual?.length ?? 10);
  const stage = Number(def.visual?.stage ?? 0);
  return (
    <group>
      <ConveyorFrame length={length} />
      <BeltProducts id={def.id} length={length} stage={stage} />
      {/* drive unit */}
      <Box p={[length / 2 - 0.8, 0.55, 0.95]} s={[0.7, 0.5, 0.45]} m={MAT.paintGrey} />
      <Cyl p={[length / 2 - 0.8, 0.55, 1.3]} s={[0.2, 0.3, 0.2]} r={[Math.PI / 2, 0, 0]} m={MAT.darkSteel} low />
      <Andon id={def.id} p={[0, 0, 0.95]} height={2.1} />
    </group>
  );
}

// ------------------------------------------------------------------ six-axis robot cell

const beamGeo = new THREE.BoxGeometry(1, 0.025, 0.025);

export function Robot({ def }: EquipProps) {
  const weld = def.visual?.variant !== "assembly";
  const j1 = useRef<THREE.Group>(null);
  const j2 = useRef<THREE.Group>(null);
  const j3 = useRef<THREE.Group>(null);
  const j5 = useRef<THREE.Group>(null);
  const part = useRef<THREE.Mesh>(null);
  const phase = useRef(def.pos[2] * 0.7 + (weld ? 0 : 1.7));
  const curtain = useMemo(() => glow(PALETTE.green, 2), []);
  const strip = useMemo(() => glow(PALETTE.cyan, 1), []);
  const torch = useMemo(() => glow("#bfe9ff", 0.1), []);
  const cG = useMemo(() => new THREE.Color(PALETTE.green), []);
  const cR = useMemo(() => new THREE.Color(PALETTE.red), []);
  const cA = useMemo(() => new THREE.Color(PALETTE.amber), []);
  const cW = useMemo(() => new THREE.Color("#bfe9ff"), []);
  const arcOn = useRef(0);

  useFrame(({ clock }, dtRaw) => {
    const s = equipState(def.id);
    if (!s) return;
    const dt = Math.min(dtRaw, 0.05);
    const bad = erratic(def.id);
    const run = s.tripped ? 0 : Math.min(1, s.out);
    // Erratic: too fast, with jerks. Halted or starved: frozen mid-motion.
    phase.current += dt * (bad ? 6.5 : run * 2.1);
    const p = phase.current;
    const w = 0.5 + 0.5 * Math.sin(p);
    let a1 = Math.sin(p * 0.5) * 0.55;
    let a2 = THREE.MathUtils.lerp(-0.12, 0.56, w);
    let a3 = THREE.MathUtils.lerp(0.95, 1.72, w);
    let a5 = Math.sin(p * 2) * 0.45;
    if (bad) {
      a1 += Math.sin(p * 3.7) * 0.9 + Math.sign(Math.sin(p * 11.3)) * 0.18;
      a2 += Math.sin(p * 5.1) * 0.35;
      a3 += Math.sign(Math.sin(p * 7.9)) * 0.3;
      a5 += Math.sin(p * 13) * 1.2;
    }
    const k = bad ? 26 : 9;
    if (j1.current) j1.current.rotation.y = THREE.MathUtils.damp(j1.current.rotation.y, a1, k, dt);
    if (j2.current) j2.current.rotation.x = THREE.MathUtils.damp(j2.current.rotation.x, a2, k, dt);
    if (j3.current) j3.current.rotation.x = THREE.MathUtils.damp(j3.current.rotation.x, a3, k, dt);
    if (j5.current) j5.current.rotation.x = THREE.MathUtils.damp(j5.current.rotation.x, a5, k, dt);

    const working = !bad && run > 0.05 && w > 0.72;
    arcOn.current = weld && working ? 1 : 0;
    torch.color.copy(cW).multiplyScalar(arcOn.current ? 3 + Math.random() * 4 : weld ? 0.1 : 0.4);
    if (part.current) part.current.visible = run > 0.05 || bad || s.manip || s.setpoint === 0 || s.tripped;

    const blink = Math.sin(clock.elapsedTime * 12) > 0 ? 1 : 0.1;
    if (bad) {
      curtain.color.copy(cR).multiplyScalar(3.5 * blink + 0.3);
      strip.color.copy(cR).multiplyScalar(3 * blink + 0.4);
    } else if (s.setpoint === 0 || s.tripped) {
      curtain.color.copy(cR).multiplyScalar(1.6);
      strip.color.copy(cR).multiplyScalar(1.2);
    } else if (s.arming) {
      curtain.color.copy(cA).multiplyScalar(2.5 * blink + 0.4);
      strip.color.copy(cA).multiplyScalar(2);
    } else {
      curtain.color.copy(cG).multiplyScalar(1.8);
      strip.color.copy(cG).multiplyScalar(run > 0.05 ? 0.9 : 0.25);
    }
  });

  const paint = weld ? MAT.paintOrange : MAT.paintYellow;
  const stage = PRODUCT[weld ? 1 : 2];
  return (
    <group>
      {/* cell floor plate + fixture table on the line */}
      <Box p={[0, 0.04, -1.2]} s={[6.6, 0.08, 6.6]} m={MAT.concreteDark} shadow={false} />
      <Box p={[0, 0.5, 0]} s={[2.6, 1, 1.5]} m={MAT.darkSteel} />
      <Box p={[0, 1.03, 0]} s={[2.9, 0.08, 1.7]} m={MAT.steel} />
      {[-1.15, 1.15].map((x) => (
        <Box key={x} p={[x, 1.2, 0.7]} s={[0.16, 0.26, 0.16]} m={MAT.paintRed} shadow={false} />
      ))}
      <mesh ref={part} geometry={GEO.box} material={stage.mat} position={[0, 1.07 + stage.s[1] / 2, 0]} scale={stage.s} castShadow />
      {weld && <Particles p={[0.2, 1.35, 0.1]} count={26} rate={() => arcOn.current * 55} color="#ffc65c" intensity={4} size={[0.5, 0.1]} life={[0.25, 0.6]} velocity={[0, 2.4, 0]} jitter={4.5} radius={0.1} gravity={9} additive opacity={1} />}

      {/* the arm */}
      <group position={[0, 0, -2.5]}>
        <Cyl p={[0, 0.3, 0]} s={[0.75, 0.6, 0.75]} m={MAT.darkSteel} />
        <Cyl p={[0, 0.63, 0]} s={[0.6, 0.08, 0.6]} m={MAT.steel} shadow={false} />
        <group ref={j1} position={[0, 0.66, 0]}>
          <Cyl p={[0, 0.3, 0]} s={[0.5, 0.6, 0.5]} m={paint} />
          <Box p={[0, 0.5, -0.5]} s={[0.55, 0.5, 0.55]} m={MAT.blackMetal} />
          <group ref={j2} position={[0, 0.75, 0]}>
            <Cyl s={[0.34, 0.95, 0.34]} r={[0, 0, Math.PI / 2]} m={MAT.blackMetal} />
            <Box p={[0, 1.05, 0]} s={[0.42, 2.1, 0.5]} m={paint} />
            <Box p={[0.25, 1.05, 0]} s={[0.06, 1.7, 0.2]} m={MAT.blackMetal} shadow={false} />
            <group ref={j3} position={[0, 2.1, 0]}>
              <Cyl s={[0.28, 0.8, 0.28]} r={[0, 0, Math.PI / 2]} m={MAT.blackMetal} />
              <Box p={[0, -0.2, 0]} s={[0.5, 0.5, 0.5]} m={paint} />
              <Cyl p={[0, 0.95, 0]} s={[0.17, 1.9, 0.17]} m={paint} />
              <Cyl p={[0.2, 0.8, 0]} s={[0.035, 1.5, 0.035]} m={MAT.rubber} low shadow={false} />
              <group ref={j5} position={[0, 1.9, 0]}>
                <Cyl s={[0.2, 0.34, 0.2]} r={[0, 0, Math.PI / 2]} m={MAT.blackMetal} />
                {weld ? (
                  <>
                    <Cyl p={[0, 0.32, 0]} s={[0.07, 0.6, 0.07]} m={MAT.copper} low />
                    <mesh geometry={GEO.sphereLow} material={torch} position={[0, 0.66, 0]} scale={0.09} />
                  </>
                ) : (
                  <>
                    <Box p={[0, 0.2, 0]} s={[0.6, 0.1, 0.3]} m={MAT.steel} />
                    <Box p={[-0.26, 0.42, 0]} s={[0.06, 0.4, 0.24]} m={MAT.steel} />
                    <Box p={[0.26, 0.42, 0]} s={[0.06, 0.4, 0.24]} m={MAT.steel} />
                    <mesh geometry={GEO.box} material={torch} position={[0, 0.27, 0]} scale={[0.3, 0.04, 0.1]} />
                  </>
                )}
              </group>
            </group>
          </group>
        </group>
      </group>

      {/* safety cage: three fenced sides, light curtain on the operator side */}
      {[
        [-3.2, -4.4],
        [3.2, -4.4],
        [-3.2, -1.3],
        [3.2, -1.3],
        [0, -4.4],
      ].map(([x, z], i) => (
        <Box key={i} p={[x, 1.1, z]} s={[0.1, 2.2, 0.1]} m={MAT.hazard} shadow={false} />
      ))}
      <Beam a={[-3.2, 2.2, -4.4]} b={[3.2, 2.2, -4.4]} radius={0.04} m={MAT.hazard} square shadow={false} />
      <Beam a={[-3.2, 2.2, -4.4]} b={[-3.2, 2.2, -1.3]} radius={0.04} m={MAT.hazard} square shadow={false} />
      <Beam a={[3.2, 2.2, -4.4]} b={[3.2, 2.2, -1.3]} radius={0.04} m={MAT.hazard} square shadow={false} />
      <mesh material={panelMat} position={[0, 1.1, -4.4]} scale={[6.4, 2.2, 1]}>
        <planeGeometry />
      </mesh>
      <mesh material={panelMat} position={[-3.2, 1.1, -2.85]} rotation={[0, Math.PI / 2, 0]} scale={[3.1, 2.2, 1]}>
        <planeGeometry />
      </mesh>
      <mesh material={panelMat} position={[3.2, 1.1, -2.85]} rotation={[0, Math.PI / 2, 0]} scale={[3.1, 2.2, 1]}>
        <planeGeometry />
      </mesh>
      <mesh geometry={GEO.box} material={strip} position={[0, 2.26, -4.4]} scale={[6.4, 0.05, 0.05]} />
      {[-3.2, 3.2].map((x) => (
        <Box key={x} p={[x, 0.85, 1.9]} s={[0.16, 1.7, 0.16]} m={MAT.hazard} shadow={false} />
      ))}
      {[0.35, 0.7, 1.05, 1.4].map((y) => (
        <mesh key={y} geometry={beamGeo} material={curtain} position={[0, y, 1.9]} scale={[6.4, 1, 1]} />
      ))}
      {/* robot controller cabinet + andon */}
      <Box p={[2.4, 0.85, -5.2]} s={[1.1, 1.7, 0.7]} m={MAT.paintLight} />
      <Box p={[2.4, 1.2, -4.84]} s={[0.5, 0.3, 0.03]} m={MAT.blackMetal} shadow={false} />
      <Andon id={def.id} p={[3.2, 0, 1.9]} height={2.4} />
      <Label text={weld ? "WELD" : "ASSEMBLY"} p={[0, 4.6, -2.5]} size={0.55} color="#ffe2b0" opacityRef={() => 0.5} />
    </group>
  );
}

// ------------------------------------------------------------------ stamping press

export function Press({ def }: EquipProps) {
  const ram = useRef<THREE.Group>(null);
  const flash = useMemo(() => glow("#ffb347", 0), []);
  const cFlash = useMemo(() => new THREE.Color("#ffb347"), []);
  const phase = useRef(def.pos[2] * 0.37);
  const hit = useRef(0);
  const sheet = useRef<THREE.Mesh>(null);
  useFrame((_, dtRaw) => {
    const s = equipState(def.id);
    if (!s) return;
    const dt = Math.min(dtRaw, 0.05);
    const bad = erratic(def.id);
    const run = s.tripped ? 0 : Math.min(1, s.out);
    const before = phase.current % 1;
    phase.current += dt * (bad ? 2.6 + Math.sin(phase.current * 5) * 1.4 : run * 0.85);
    const c = phase.current % 1;
    // Slow lift, fast stroke.
    const y = c < 0.72 ? c / 0.72 : 1 - (c - 0.72) / 0.28;
    if (ram.current) ram.current.position.y = 2.15 + y * 1.25 + (bad ? (Math.random() - 0.5) * 0.06 : 0);
    if (c < before) hit.current = 1;
    hit.current = Math.max(0, hit.current - dt * 6);
    flash.color.copy(cFlash).multiplyScalar(hit.current * 5);
    if (sheet.current) sheet.current.visible = run > 0.05 || bad || s.tripped || s.setpoint === 0;
  });
  return (
    <group>
      <Box p={[0, 0.1, 0]} s={[5.4, 0.2, 5]} m={MAT.concreteDark} shadow={false} />
      {/* bed and bolster */}
      <Box p={[0, 0.85, 0]} s={[4, 1.3, 3.2]} m={MAT.paintGreen} />
      <Box p={[0, 1.6, 0]} s={[3.4, 0.2, 2.6]} m={MAT.steel} />
      <Box p={[0, 1.8, 0]} s={[2.2, 0.2, 1.6]} m={MAT.darkSteel} />
      <mesh ref={sheet} geometry={GEO.box} material={sheetMat} position={[0, 1.94, 0]} scale={[1.6, 0.05, 1.1]} />
      <mesh geometry={GEO.box} material={flash} position={[0, 2, 0]} scale={[1.9, 0.06, 1.3]} />
      {/* uprights */}
      {[
        [-1.7, -1.3],
        [1.7, -1.3],
        [-1.7, 1.3],
        [1.7, 1.3],
      ].map(([x, z], i) => (
        <group key={i}>
          <Box p={[x, 3.4, z]} s={[0.6, 3.8, 0.6]} m={MAT.paintGreen} />
          <Cyl p={[x * 0.72, 3.3, z * 0.72]} s={[0.09, 3.6, 0.09]} m={MAT.aluminium} low shadow={false} />
        </group>
      ))}
      {/* crown with drive */}
      <Box p={[0, 5.95, 0]} s={[4.2, 1.5, 3.4]} m={MAT.paintGreen} />
      <Box p={[0, 6.78, 0]} s={[3.2, 0.2, 2.4]} m={MAT.darkSteel} />
      <Box p={[0, 5.9, 1.72]} s={[2.2, 0.5, 0.04]} m={MAT.hazard} shadow={false} />
      <Spinner p={[2.25, 5.9, 0]} axis="x" speed={() => (erratic(def.id) ? 14 : (equipState(def.id)?.tripped ? 0 : Math.min(1, equipState(def.id)?.out ?? 0)) * 5)}>
        <Cyl s={[1.15, 0.28, 1.15]} r={[0, 0, Math.PI / 2]} m={MAT.blackMetal} />
        <Box s={[0.32, 2.0, 0.22]} m={MAT.paintRed} shadow={false} />
        <Box s={[0.32, 0.22, 2.0]} m={MAT.paintRed} shadow={false} />
      </Spinner>
      <Box p={[-2.4, 5.6, 0]} s={[0.7, 0.9, 1.2]} m={MAT.paintGrey} />
      {/* ram + upper die */}
      <group ref={ram} position={[0, 3.4, 0]}>
        <Box p={[0, 1.2, 0]} s={[2.9, 1.7, 2.1]} m={MAT.paintGrey} />
        <Box p={[0, 0.2, 0]} s={[2.3, 0.3, 1.7]} m={MAT.darkSteel} />
        <Box p={[0, 0, 0]} s={[1.8, 0.14, 1.2]} m={MAT.steel} />
        <Cyl p={[-0.8, 2.6, 0]} s={[0.2, 1.4, 0.2]} m={MAT.aluminium} low />
        <Cyl p={[0.8, 2.6, 0]} s={[0.2, 1.4, 0.2]} m={MAT.aluminium} low />
      </group>
      {/* coil feeder on the upstream side */}
      <group position={[-4.4, 0, 0]}>
        <Box p={[0, 0.5, 0]} s={[1.5, 1, 1.9]} m={MAT.paintGrey} />
        <Spinner p={[0, 1.95, 0]} axis="z" speed={() => (equipState(def.id)?.tripped ? 0 : Math.min(1.2, equipState(def.id)?.out ?? 0) * 0.8)}>
          <Cyl s={[1.15, 1.25, 1.15]} r={[Math.PI / 2, 0, 0]} m={sheetMat} />
          <Cyl s={[0.4, 1.4, 0.4]} r={[Math.PI / 2, 0, 0]} m={MAT.blackMetal} />
          <Box s={[2.0, 0.1, 1.3]} m={MAT.darkSteel} shadow={false} />
        </Spinner>
        <Box p={[1.6, 1.86, 0]} s={[2.6, 0.04, 1.1]} r={[0, 0, 0.03]} m={sheetMat} shadow={false} />
      </group>
      {/* stamped blanks leave on a short roller table toward the infeed conveyor */}
      <group position={[2.9, 0, 0]}>
        <ConveyorFrame length={1.9} />
      </group>
      <Particles p={[0, 2, 0]} count={24} rate={() => hit.current * 80} color="#ffb347" intensity={4} size={[0.45, 0.08]} life={[0.2, 0.55]} velocity={[0, 1.6, 0]} jitter={6} radius={0.7} gravity={10} additive opacity={1} />
      {/* operator pendant + andon */}
      <Box p={[2.6, 0.75, 2.2]} s={[0.12, 1.5, 0.12]} m={MAT.darkSteel} />
      <Box p={[2.6, 1.55, 2.2]} s={[0.6, 0.45, 0.2]} m={MAT.paintLight} />
      <Andon id={def.id} p={[-2.3, 0, 2.3]} height={3.2} />
      <Label text="PRESS" p={[0, 7.6, 0]} size={0.55} color="#ffe2b0" opacityRef={() => 0.5} />
    </group>
  );
}

// ------------------------------------------------------------------ end-of-line packer / palletizer

const STACK = 12;

export function Packer({ def }: EquipProps) {
  const stack = useRef<THREE.InstancedMesh>(null);
  const moving = useRef<THREE.Mesh>(null);
  const display = useMemo(() => glow(PALETTE.green, 1.6), []);
  const cG = useMemo(() => new THREE.Color(PALETTE.green), []);
  const cR = useMemo(() => new THREE.Color(PALETTE.red), []);
  const cA = useMemo(() => new THREE.Color(PALETTE.amber), []);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const t = useRef((def.pos[2] + 20) * 0.31);
  useFrame(({ clock }, dtRaw) => {
    const s = equipState(def.id);
    const im = stack.current;
    if (!s || !im) return;
    const dt = Math.min(dtRaw, 0.05);
    const run = s.tripped ? 0 : Math.min(1, s.out);
    t.current += dt * run * 0.55;
    const total = t.current % (STACK + 2); // two beats with a full pallet before it is taken away
    const count = Math.min(STACK, Math.floor(total));
    for (let i = 0; i < STACK; i++) {
      const layer = Math.floor(i / 4);
      const k = i % 4;
      dummy.position.set(5.4 + (k % 2 ? 0.52 : -0.52), 0.42 + layer * 0.52, k < 2 ? -0.42 : 0.42);
      dummy.scale.set(0.98, 0.5, 0.8).multiplyScalar(i < count ? 1 : 0);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    // The box currently travelling from the case sealer to the pallet.
    if (moving.current) {
      const f = total % 1;
      moving.current.visible = run > 0.05 && count < STACK;
      moving.current.position.set(2.6 + f * 2.2, 1.26, 0);
    }
    const halted = s.tripped || s.manip || s.condition <= 0;
    display.color.copy(halted ? cR : run < 0.05 ? cA : cG).multiplyScalar(halted ? (Math.sin(clock.elapsedTime * 9) > 0 ? 2.6 : 0.4) : 1.6);
  });
  return (
    <group>
      {/* infeed from the assembly cell */}
      <group position={[-5, 0, 0]}>
        <ConveyorFrame length={6.4} />
        <BeltProducts id={def.id} length={6.4} stage={2} />
      </group>
      {/* test + case-packing enclosure */}
      <Box p={[0, 0.1, 0]} s={[4.4, 0.2, 3.4]} m={MAT.concreteDark} shadow={false} />
      <Box p={[0, 1.55, 0]} s={[3.8, 2.7, 2.8]} m={MAT.paintLight} />
      <Box p={[0, 2.98, 0]} s={[4, 0.16, 3]} m={MAT.paintBlue} />
      <Box p={[0, 1.7, 1.42]} s={[2.6, 1.3, 0.04]} m={MAT.glass} shadow={false} />
      <Box p={[-1.9, 1.3, 0]} s={[0.06, 0.9, 1.5]} m={MAT.blackMetal} shadow={false} />
      <Box p={[1.9, 1.3, 0]} s={[0.06, 0.9, 1.5]} m={MAT.blackMetal} shadow={false} />
      <mesh geometry={GEO.box} material={display} position={[1.2, 2.55, 1.43]} scale={[0.9, 0.3, 0.03]} />
      <Box p={[-1.3, 3.5, -0.6]} s={[0.9, 0.9, 0.9]} m={MAT.paintGrey} />
      {/* outfeed rollers to the pallet station */}
      <group position={[3.4, 0, 0]}>
        <ConveyorFrame length={2.8} />
      </group>
      <mesh ref={moving} geometry={GEO.box} material={cardboard} scale={[0.98, 0.5, 0.8]} castShadow />
      {/* pallet being built + stretch-wrap mast */}
      <Box p={[5.4, 0.08, 0]} s={[2.5, 0.16, 2.1]} m={palletMat} />
      <instancedMesh ref={stack} args={[GEO.box, cardboard, STACK]} castShadow frustumCulled={false} />
      <Box p={[6.95, 1.4, -1.1]} s={[0.18, 2.8, 0.18]} m={MAT.paintBlue} />
      <Spinner p={[6.95, 1.5, -0.85]} axis="y" speed={() => (equipState(def.id)?.tripped ? 0 : Math.min(1, equipState(def.id)?.out ?? 0) * 3)}>
        <Cyl s={[0.14, 0.7, 0.14]} m={MAT.glass} low shadow={false} />
      </Spinner>
      {/* finished pallets waiting for the AGV */}
      {[0, 1].map((i) => (
        <group key={i} position={[5.2 + i * 0.2, 0, 3 + i * 2.4]}>
          <Box p={[0, 0.08, 0]} s={[2.3, 0.16, 1.9]} m={palletMat} />
          <Box p={[0, 0.95, 0]} s={[2.1, 1.56, 1.7]} m={cardboard} />
          <Box p={[0, 0.95, 0]} s={[2.14, 0.3, 1.74]} m={MAT.glass} shadow={false} />
        </group>
      ))}
      <Andon id={def.id} p={[2.1, 0, 1.6]} height={3.3} />
      <Label text="PACK" p={[0, 4.7, 0]} size={0.55} color="#ffe2b0" opacityRef={() => 0.5} />
    </group>
  );
}

// ------------------------------------------------------------------ compressed air plant

export function Compressor({ def }: EquipProps) {
  const gauge = useMemo(() => glow(PALETTE.green, 1.6), []);
  const cG = useMemo(() => new THREE.Color(PALETTE.green), []);
  const cR = useMemo(() => new THREE.Color(PALETTE.red), []);
  const body = useRef<THREE.Group>(null);
  const running = () => {
    const s = equipState(def.id);
    return s && !s.tripped ? Math.min(1, s.out) : 0;
  };
  useFrame(({ clock }) => {
    const r = running();
    gauge.color.copy(r > 0.05 ? cG : cR).multiplyScalar(r > 0.05 ? 1.6 : Math.sin(clock.elapsedTime * 9) > 0 ? 3 : 0.3);
    if (body.current) body.current.position.y = r > 0.05 ? Math.sin(clock.elapsedTime * 48) * 0.006 : 0;
  });
  return (
    <group>
      <Box p={[0, 0.1, 0]} s={[8.4, 0.2, 5]} m={MAT.concreteDark} shadow={false} />
      {/* two packaged screw compressors */}
      <group ref={body}>
        {[-2.6, 0.2].map((x) => (
          <group key={x} position={[x, 0, -0.6]}>
            <Box p={[0, 1.15, 0]} s={[2.3, 1.9, 1.8]} m={MAT.paintBlue} />
            <Box p={[0, 2.14, 0]} s={[2.4, 0.1, 1.9]} m={MAT.darkSteel} />
            <Box p={[0, 1.25, 0.92]} s={[1.5, 1.1, 0.04]} m={MAT.blackMetal} shadow={false} />
            <mesh geometry={GEO.box} material={gauge} position={[0.75, 1.75, 0.93]} scale={[0.4, 0.2, 0.03]} />
            <Spinner p={[0, 2.22, 0]} axis="y" speed={() => running() * 20}>
              {[0, 1, 2, 3].map((i) => (
                <Box key={i} p={[0, 0, 0]} s={[1.3, 0.03, 0.2]} r={[0.3, (i * Math.PI) / 4, 0]} m={MAT.aluminium} shadow={false} />
              ))}
            </Spinner>
            <mesh material={MAT.darkSteel} position={[0, 2.22, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <torusGeometry args={[0.7, 0.05, 6, 20]} />
            </mesh>
          </group>
        ))}
      </group>
      {/* vertical air receivers */}
      {[2.5, 3.6].map((x, i) => (
        <group key={x} position={[x, 0, i ? 0.9 : -0.9]}>
          <Cyl p={[0, 2.3, 0]} s={[0.75, 3.6, 0.75]} m={MAT.paintLight} />
          <mesh geometry={GEO.sphere} material={MAT.paintLight} position={[0, 4.1, 0]} scale={[0.75, 0.4, 0.75]} castShadow />
          <Cyl p={[0, 0.3, 0]} s={[0.5, 0.6, 0.5]} m={MAT.darkSteel} low />
          <Box p={[0, 2.6, 0.76]} s={[0.5, 0.25, 0.03]} m={MAT.hazard} shadow={false} />
        </group>
      ))}
      {/* piping to the plant header */}
      <Beam a={[-2.6, 2.2, -1.4]} b={[-2.6, 5.4, -1.4]} radius={0.1} m={MAT.paintTeal} />
      <Beam a={[0.2, 2.2, -1.4]} b={[0.2, 5.4, -1.4]} radius={0.1} m={MAT.paintTeal} />
      <Beam a={[-2.6, 5.4, -1.4]} b={[3.6, 5.4, -1.4]} radius={0.1} m={MAT.paintTeal} />
      <Beam a={[2.5, 4.4, -0.9]} b={[2.5, 5.4, -1.4]} radius={0.08} m={MAT.paintTeal} />
      <Beam a={[3.6, 4.4, 0.9]} b={[3.6, 5.4, -1.4]} radius={0.08} m={MAT.paintTeal} />
      <Andon id={def.id} p={[-3.9, 0, 1.6]} height={3} />
      <Label text="PLANT AIR" p={[0, 6.2, 0]} size={0.55} color="#ffe2b0" opacityRef={() => 0.5} />
    </group>
  );
}
