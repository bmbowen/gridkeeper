"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { MissionDef, Vec3 } from "@/sim/types";
import { viewFx } from "@/state/fx";
import { GEO, MAT, glow } from "../materials";
import { Beam, Box, Cyl, Label, Lamp } from "../parts";
import { game, PALETTE, seeded } from "../util";
import { Fence, Ground, Scatter, Slab } from "./common";

// Building footprint.
const X0 = -44;
const X1 = 42;
const Z0 = -28;
const Z1 = 30;
const EAVE = 11.5;
const LINES_Z = [-14, -2, 10];

const floorMat = new THREE.MeshStandardMaterial({ color: "#3b424b", roughness: 0.32, metalness: 0.15 });
const lanePaint = new THREE.MeshStandardMaterial({ color: "#d9a81e", roughness: 0.7 });
const walkPaint = new THREE.MeshStandardMaterial({ color: "#2c6b4a", roughness: 0.7 });
const cladding = new THREE.MeshStandardMaterial({ color: "#56626e", roughness: 0.75, metalness: 0.3 });
const claddingDark = new THREE.MeshStandardMaterial({ color: "#2a323c", roughness: 0.75, metalness: 0.3 });
const crate = new THREE.MeshStandardMaterial({ color: "#9a7448", roughness: 0.9 });
const crateBlue = new THREE.MeshStandardMaterial({ color: "#2b5d8e", roughness: 0.7 });
const rackMat = new THREE.MeshStandardMaterial({ color: "#c2571a", roughness: 0.6, metalness: 0.4 });

let hazardTex: THREE.CanvasTexture | null = null;
function hazardStripes(): THREE.CanvasTexture {
  if (hazardTex) return hazardTex;
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#17191c";
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = "#e8b01c";
  for (let i = -64; i < 128; i += 32) {
    ctx.beginPath();
    ctx.moveTo(i, 64);
    ctx.lineTo(i + 16, 64);
    ctx.lineTo(i + 80, 0);
    ctx.lineTo(i + 64, 0);
    ctx.fill();
  }
  hazardTex = new THREE.CanvasTexture(c);
  hazardTex.wrapS = hazardTex.wrapT = THREE.RepeatWrapping;
  hazardTex.colorSpace = THREE.SRGBColorSpace;
  return hazardTex;
}

/** Yellow/black hazard border strip on the floor. */
function HazardStrip({ a, b, width = 0.45 }: { a: [number, number]; b: [number, number]; width?: number }) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const mat = useMemo(() => {
    const t = hazardStripes().clone();
    t.needsUpdate = true;
    t.repeat.set(len / 0.9, 1);
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 });
  }, [len]);
  const horizontal = Math.abs(b[0] - a[0]) > Math.abs(b[1] - a[1]);
  return (
    <mesh material={mat} position={[(a[0] + b[0]) / 2, 0.075, (a[1] + b[1]) / 2]} rotation={[-Math.PI / 2, 0, horizontal ? 0 : Math.PI / 2]} receiveShadow>
      <planeGeometry args={[len, width]} />
    </mesh>
  );
}

/** Warren roof truss spanning the building along Z at a given X. The roof itself is left off. */
function Truss({ x }: { x: number }) {
  const bays = 10;
  // End frames are full weight; interior ones stay slender so they never hide the lines below.
  const k = x === X0 || x === X1 ? 1 : 0.55;
  const dz = (Z1 - Z0) / bays;
  return (
    <group>
      <Beam a={[x, EAVE, Z0]} b={[x, EAVE, Z1]} radius={0.09 * k} m={MAT.darkSteel} square shadow={false} />
      <Beam a={[x, EAVE + 2.2, Z0]} b={[x, EAVE + 2.2, Z1]} radius={0.07 * k} m={MAT.darkSteel} square shadow={false} />
      {Array.from({ length: bays }, (_, i) => {
        const z = Z0 + i * dz;
        const up = i % 2 === 0;
        return <Beam key={i} a={[x, up ? EAVE : EAVE + 2.2, z]} b={[x, up ? EAVE + 2.2 : EAVE, z + dz]} radius={0.035 * k} m={MAT.darkSteel} square shadow={false} />;
      })}
    </group>
  );
}

function Column({ p }: { p: Vec3 }) {
  return (
    <group position={p}>
      <Box p={[0, 0.3, 0]} s={[0.9, 0.6, 0.9]} m={MAT.hazard} shadow={false} />
      <Box p={[0, EAVE / 2, 0]} s={[0.3, EAVE, 0.06]} m={MAT.steel} shadow={false} />
      <Box p={[0, EAVE / 2, 0.14]} s={[0.06, EAVE, 0.3]} m={MAT.steel} shadow={false} />
      <Box p={[0, EAVE / 2, -0.14]} s={[0.06, EAVE, 0.3]} m={MAT.steel} shadow={false} />
    </group>
  );
}

/** High-bay luminaire hanging from the trusses. Brightness sags with plant output. */
function HighBays({ spots }: { spots: Vec3[] }) {
  const mat = useMemo(() => glow("#dfeeff", 3), []);
  const base = useMemo(() => new THREE.Color("#dfeeff"), []);
  useFrame(() => {
    mat.color.copy(base).multiplyScalar(3.2 * (1 - viewFx.mix * 0.7));
  });
  const shades = useMemo(() => spots.map((p) => ({ p: [p[0], p[1] + 0.22, p[2]] as Vec3, s: [0.62, 0.4, 0.62] as Vec3 })), [spots]);
  const rods = useMemo(() => spots.map((p) => ({ p: [p[0], (p[1] + EAVE) / 2 + 0.3, p[2]] as Vec3, s: [0.03, EAVE - p[1], 0.03] as Vec3 })), [spots]);
  const discs = useMemo(() => spots.map((p) => ({ p, s: [0.5, 0.05, 0.5] as Vec3 })), [spots]);
  return (
    <group>
      <Scatter geometry={GEO.cone} material={MAT.blackMetal} items={shades} />
      <Scatter geometry={GEO.cyl8} material={MAT.darkSteel} items={rods} />
      <Scatter geometry={GEO.cyl} material={mat} items={discs} />
    </group>
  );
}

/** Pallet racking bay with a deterministic mix of crates. */
function Racking({ p, bays = 4, rot = 0, seed = 1 }: { p: Vec3; bays?: number; rot?: number; seed?: number }) {
  const W = 3.2;
  const levels = [0.15, 2.4, 4.6];
  const { boxes, blue } = useMemo(() => {
    const rnd = seeded(seed * 131 + 7);
    const boxes: { p: Vec3; s: Vec3 }[] = [];
    const blue: { p: Vec3; s: Vec3 }[] = [];
    for (let b = 0; b < bays; b++)
      for (const y of levels)
        for (const dx of [-0.75, 0.75]) {
          if (rnd() < 0.2) continue;
          const h = 1.0 + rnd() * 0.8;
          (rnd() < 0.3 ? blue : boxes).push({ p: [b * W + W / 2 + dx, y + 0.12 + h / 2, 0], s: [1.25, h, 1.1] });
        }
    return { boxes, blue };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bays, seed]);
  return (
    <group position={p} rotation={[0, rot, 0]}>
      {Array.from({ length: bays + 1 }, (_, i) => (
        <group key={i} position={[i * W, 0, 0]}>
          <Box p={[0, 3.4, -0.6]} s={[0.1, 6.8, 0.1]} m={MAT.paintBlue} shadow={false} />
          <Box p={[0, 3.4, 0.6]} s={[0.1, 6.8, 0.1]} m={MAT.paintBlue} shadow={false} />
          <Beam a={[0, 0.3, -0.6]} b={[0, 2.2, 0.6]} radius={0.025} m={MAT.paintBlue} shadow={false} />
          <Beam a={[0, 2.6, 0.6]} b={[0, 4.6, -0.6]} radius={0.025} m={MAT.paintBlue} shadow={false} />
        </group>
      ))}
      {levels.slice(1).concat(6.7).map((y) => (
        <group key={y}>
          <Box p={[(bays * W) / 2, y, -0.6]} s={[bays * W, 0.14, 0.07]} m={rackMat} shadow={false} />
          <Box p={[(bays * W) / 2, y, 0.6]} s={[bays * W, 0.14, 0.07]} m={rackMat} shadow={false} />
        </group>
      ))}
      <Scatter geometry={GEO.box} material={crate} items={boxes} castShadow />
      {blue.length > 0 && <Scatter geometry={GEO.box} material={crateBlue} items={blue} castShadow />}
    </group>
  );
}

/** Automated guided vehicle shuttling pallets along an aisle. Parks when the plant is down. */
function Agv({ z, x0, x1, phase = 0, loaded }: { z: number; x0: number; x1: number; phase?: number; loaded?: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const t = useRef(phase);
  const beacon = useMemo(() => glow(PALETTE.cyan, 2.4), []);
  const scan = useMemo(() => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.cyan).multiplyScalar(1.5), transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    m.toneMapped = false;
    return m;
  }, []);
  useFrame((_, dt) => {
    const g = game();
    const run = g ? Math.min(1, g.production + 0.15) : 1;
    t.current += Math.min(dt, 0.05) * 0.09 * (g && g.production < 0.05 ? 0 : run);
    const u = t.current % 2;
    const k = u < 1 ? u : 2 - u;
    const e = k * k * (3 - 2 * k);
    if (ref.current) {
      ref.current.position.set(x0 + (x1 - x0) * e, 0, z);
      ref.current.rotation.y = u < 1 ? 0 : Math.PI;
    }
  });
  return (
    <group ref={ref}>
      <Box p={[0, 0.3, 0]} s={[2.4, 0.36, 1.5]} m={MAT.paintYellow} />
      <Box p={[0, 0.5, 0]} s={[2.1, 0.06, 1.3]} m={MAT.blackMetal} shadow={false} />
      <Box p={[1.22, 0.28, 0]} s={[0.06, 0.2, 1.3]} m={MAT.rubber} shadow={false} />
      <mesh geometry={GEO.cyl} material={beacon} position={[0.95, 0.6, 0]} scale={[0.12, 0.12, 0.12]} />
      <mesh material={scan} position={[2.6, 0.09, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.8, 16, -0.7, 1.4]} />
      </mesh>
      {loaded && (
        <>
          <Box p={[-0.1, 0.6, 0]} s={[1.9, 0.14, 1.3]} m={crate} />
          <Box p={[-0.1, 1.3, 0]} s={[1.7, 1.25, 1.15]} m={crate} />
        </>
      )}
    </group>
  );
}

function Forklift({ p, rot = 0 }: { p: Vec3; rot?: number }) {
  return (
    <group position={p} rotation={[0, rot, 0]}>
      <Box p={[0, 0.75, 0]} s={[2, 0.9, 1.3]} m={MAT.paintOrange} />
      <Box p={[-0.7, 1.25, 0]} s={[0.6, 0.5, 1.2]} m={MAT.blackMetal} />
      {[
        [-0.2, -0.6],
        [-0.2, 0.6],
        [0.9, -0.6],
        [0.9, 0.6],
      ].map(([x, z], i) => (
        <Beam key={i} a={[x, 1.2, z]} b={[x, 2.5, z]} radius={0.04} m={MAT.blackMetal} />
      ))}
      <Box p={[0.35, 2.52, 0]} s={[1.4, 0.06, 1.3]} m={MAT.blackMetal} />
      <Box p={[1.15, 1.7, -0.4]} s={[0.1, 3.2, 0.12]} m={MAT.darkSteel} />
      <Box p={[1.15, 1.7, 0.4]} s={[0.1, 3.2, 0.12]} m={MAT.darkSteel} />
      <Box p={[1.8, 0.2, -0.35]} s={[1.3, 0.06, 0.14]} m={MAT.steel} />
      <Box p={[1.8, 0.2, 0.35]} s={[1.3, 0.06, 0.14]} m={MAT.steel} />
      {[
        [-0.6, -0.7],
        [-0.6, 0.7],
        [0.7, -0.7],
        [0.7, 0.7],
      ].map(([x, z], i) => (
        <Cyl key={i} p={[x, 0.32, z]} s={[0.32, 0.22, 0.32]} r={[Math.PI / 2, 0, 0]} m={MAT.rubber} low />
      ))}
    </group>
  );
}

/** Open-topped glazed control room on the supervisory zone. */
function ControlRoom({ rect }: { rect: [number, number, number, number] }) {
  const [x0, z0, x1, z1] = rect;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;
  return (
    <group>
      <Box p={[cx, 0.12, cz]} s={[w, 0.1, d]} m={MAT.floor} shadow={false} />
      <Box p={[cx, 1.7, z0]} s={[w + 0.3, 3.2, 0.25]} m={MAT.wallDark} />
      <Box p={[cx, 2.1, z0 + 0.15]} s={[w - 2, 1.5, 0.04]} m={MAT.glass} shadow={false} />
      <Box p={[x0, 0.6, cz]} s={[0.2, 1, d]} m={MAT.wallDark} />
      <Box p={[x1, 0.6, cz]} s={[0.2, 1, d]} m={MAT.wallDark} />
      <Box p={[cx, 0.6, z1]} s={[w + 0.2, 1, 0.2]} m={MAT.wallDark} />
      <Box p={[x0, 1.7, cz]} s={[0.05, 1.2, d]} m={MAT.glass} shadow={false} />
      <Box p={[x1, 1.7, cz]} s={[0.05, 1.2, d]} m={MAT.glass} shadow={false} />
      <Box p={[cx, 1.7, z1]} s={[w, 1.2, 0.05]} m={MAT.glass} shadow={false} />
      {[x0, x1].map((x) => [z0, z1].map((z) => <Box key={`${x}${z}`} p={[x, 1.7, z]} s={[0.25, 3.3, 0.25]} m={MAT.wallDark} />))}
      {/* line overview wall */}
      <Box p={[cx, 2.2, z0 + 0.35]} s={[9, 1.4, 0.08]} m={MAT.blackMetal} shadow={false} />
      <pointLight position={[cx, 3, cz]} color="#bfe6ff" intensity={26} distance={16} decay={1.7} />
      <Label text="CONTROL ROOM" p={[cx, 4.2, z0]} size={0.7} color="#9fd8ff" opacityRef={() => 0.55} />
    </group>
  );
}

/** Mesh-walled server cage for the enterprise zone. */
function ServerCage({ rect }: { rect: [number, number, number, number] }) {
  const [x0, z0, x1, z1] = rect;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const tiles = useMemo(() => new THREE.MeshStandardMaterial({ color: "#aeb6bd", roughness: 0.5, metalness: 0.2 }), []);
  const idle = useMemo(() => {
    const out: { p: Vec3; s: Vec3 }[] = [];
    for (const x of [x0 + 2.5, x0 + 4, x1 - 2.5]) out.push({ p: [x, 1.2, z0 + 1.6], s: [0.9, 2.1, 0.9] });
    return out;
  }, [x0, x1, z0]);
  return (
    <group>
      <Box p={[cx, 0.14, cz]} s={[x1 - x0, 0.14, z1 - z0]} m={tiles} shadow={false} />
      <Fence rect={[x0, z0, x1, z1]} height={3.2} />
      <Scatter geometry={GEO.box} material={MAT.blackMetal} items={idle} castShadow />
      {/* in-row cooler */}
      <Box p={[x1 - 1.2, 1.3, z1 - 1.4]} s={[1.4, 2.4, 1.2]} m={MAT.paintLight} />
      <Lamp p={[x1 - 1.2, 2.65, z1 - 1.4]} size={0.1} state={() => ({ color: PALETTE.cyan })} />
      <pointLight position={[cx, 2.8, cz]} color="#a78bfa" intensity={16} distance={13} decay={1.7} />
      <Label text="SERVER CAGE" p={[cx, 4.2, z0]} size={0.7} color="#c9b8ff" opacityRef={() => 0.55} />
    </group>
  );
}

export function Factory({ mission }: { mission: MissionDef }) {
  const sup = mission.zones.find((z) => z.id === "sup")!.rect;
  const ent = mission.zones.find((z) => z.id === "ent")!.rect;
  const columnsX = [-44, -22.5, -1, 20.5, 42];
  const columns = useMemo(() => {
    const out: Vec3[] = [];
    for (const x of columnsX) for (const z of [Z0, -8, 4, Z1]) if (x === X0 || x === X1 || z === Z0) out.push([x, 0, z]);
    // Columns only on the walled sides and the gable ends: the open sides stay clear for the camera.
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const bays = useMemo(() => {
    const out: Vec3[] = [];
    for (const x of [-33, -11.5, 9.5, 31]) for (const z of [-21, -8, 4, 17]) out.push([x, 9.2, z]);
    return out;
  }, []);
  const header = 8.6;
  return (
    <group>
      <Ground color="#0c1014" vary="#1a2028" seed={41} repeat={70} />
      {/* yard outside: apron and truck dock on the east */}
      <Slab rect={[X1, -28, 70, 34]} m={MAT.asphalt} y={0.02} />
      <Slab rect={[X0 - 6, Z1, X1, 44]} m={MAT.asphalt} y={0.02} />
      {/* shop floor */}
      <Slab rect={[X0, Z0, X1, Z1]} m={floorMat} y={0.03} h={0.08} />
      {/* aisles: walkway green with yellow edges */}
      <Slab rect={[X0 + 1, 15.6, X1 - 1, 18.2]} m={walkPaint} y={0.072} h={0.01} />
      <Slab rect={[X0 + 1, 15.45, X1 - 1, 15.6]} m={lanePaint} y={0.074} h={0.01} />
      <Slab rect={[X0 + 1, 18.2, X1 - 1, 18.35]} m={lanePaint} y={0.074} h={0.01} />
      <Slab rect={[30.2, -24, 32.8, 15.45]} m={walkPaint} y={0.072} h={0.01} />
      <Slab rect={[30.05, -24, 30.2, 15.45]} m={lanePaint} y={0.074} h={0.01} />
      <Slab rect={[32.8, -24, 32.95, 15.45]} m={lanePaint} y={0.074} h={0.01} />
      {/* line boundary markings and hazard borders around the presses */}
      {LINES_Z.map((z) => (
        <group key={z}>
          <Slab rect={[-33, z + 5.3, 28.5, z + 5.42]} m={lanePaint} y={0.074} h={0.01} />
          <Slab rect={[-33, z - 6.02, 28.5, z - 5.9]} m={lanePaint} y={0.074} h={0.01} />
          <HazardStrip a={[-33.2, z - 2.9]} b={[-33.2, z + 2.9]} />
          <HazardStrip a={[-33.2, z + 2.9]} b={[-24.8, z + 2.9]} />
          <HazardStrip a={[-33.2, z - 2.9]} b={[-24.8, z - 2.9]} />
          <Label text={`LINE ${LINES_Z.indexOf(z) + 1}`} p={[-36.5, 3.4, z]} size={0.95} color="#ffd98a" opacityRef={() => 0.75} />
        </group>
      ))}
      {/* structure: north and west walls only, open roof */}
      <Box p={[(X0 + X1) / 2, EAVE / 2, Z0 - 0.2]} s={[X1 - X0 + 0.8, EAVE, 0.4]} m={cladding} />
      <Box p={[(X0 + X1) / 2, 1.2, Z0 + 0.05]} s={[X1 - X0, 2.4, 0.12]} m={claddingDark} shadow={false} />
      <Box p={[(X0 + X1) / 2, 7.4, Z0 + 0.05]} s={[X1 - X0, 0.5, 0.1]} m={MAT.paintBlue} shadow={false} />
      <Box p={[X0 - 0.2, EAVE / 2, (Z0 + Z1) / 2]} s={[0.4, EAVE, Z1 - Z0 + 0.8]} m={cladding} />
      <Box p={[X0 + 0.05, 1.2, (Z0 + Z1) / 2]} s={[0.12, 2.4, Z1 - Z0]} m={claddingDark} shadow={false} />
      <Box p={[X0 + 0.05, 7.4, (Z0 + Z1) / 2]} s={[0.1, 0.5, Z1 - Z0]} m={MAT.paintBlue} shadow={false} />
      {/* roller doors on the west wall */}
      {[-14, 10].map((z) => (
        <Box key={z} p={[X0 + 0.12, 2.6, z + 6]} s={[0.1, 5.2, 5]} m={MAT.galvanized} shadow={false} />
      ))}
      {/* clerestory windows on the north wall glow with the moonlit sky */}
      {[-33, -11.5, 9.5, 31].map((x) => (
        <Box key={x} p={[x, 9.4, Z0 + 0.06]} s={[12, 1.4, 0.06]} m={MAT.glass} shadow={false} />
      ))}
      {columns.map((p, i) => (
        <Column key={i} p={p} />
      ))}
      {columnsX.map((x) => (
        <Truss key={x} x={x} />
      ))}
      <Beam a={[X0, EAVE, Z1]} b={[X1, EAVE, Z1]} radius={0.09} m={MAT.steel} square shadow={false} />
      <Beam a={[X1, EAVE, Z0]} b={[X1, EAVE, Z1]} radius={0.09} m={MAT.steel} square shadow={false} />
      <Beam a={[X0, EAVE + 2.2, -8]} b={[X1, EAVE + 2.2, -8]} radius={0.04} m={MAT.steel} square shadow={false} />
      <Beam a={[X0, EAVE + 2.2, 4]} b={[X1, EAVE + 2.2, 4]} radius={0.04} m={MAT.steel} square shadow={false} />
      <Beam a={[X0, EAVE + 2.2, 16.5]} b={[X1, EAVE + 2.2, 16.5]} radius={0.04} m={MAT.steel} square shadow={false} />
      <HighBays spots={bays} />
      <pointLight position={[-22, 13, -8]} color="#e6f0ff" intensity={150} distance={70} decay={1.5} />
      <pointLight position={[20, 13, -8]} color="#e6f0ff" intensity={150} distance={70} decay={1.5} />
      <pointLight position={[-1, 13, 10]} color="#e6f0ff" intensity={150} distance={70} decay={1.5} />
      {/* compressed-air header from the air plant, with a drop to each press */}
      <Beam a={[-40.6, 5.4, -22.9]} b={[-40.6, header, -22.9]} radius={0.12} m={MAT.paintTeal} shadow={false} />
      <Beam a={[-40.6, header, -22.9]} b={[-40.6, header, 12]} radius={0.12} m={MAT.paintTeal} shadow={false} />
      {LINES_Z.map((z) => (
        <group key={z}>
          <Beam a={[-40.6, header, z - 2.2]} b={[-30.4, header, z - 2.2]} radius={0.08} m={MAT.paintTeal} shadow={false} />
          <Beam a={[-30.4, header, z - 2.2]} b={[-30.4, 5.9, z - 2.2]} radius={0.08} m={MAT.paintTeal} shadow={false} />
        </group>
      ))}
      {/* storage, vehicles, props */}
      <Racking p={[-8, 0, -26.4]} bays={5} seed={1} />
      <Racking p={[12, 0, -26.4]} bays={5} seed={2} />
      <Racking p={[-42.4, 0, 28.5]} bays={3} rot={Math.PI / 2} seed={3} />
      <Racking p={[-38, 0, 27]} bays={5} seed={4} />
      <Agv z={16.9} x0={-30} x1={36} phase={0.2} loaded />
      <Agv z={-20.5} x0={30} x1={-22} phase={1.1} />
      <Forklift p={[36.5, 0, -18]} rot={2.2} />
      <Forklift p={[-18, 0, 25.5]} rot={-0.4} />
      {[
        [35, -8],
        [35.5, -4.6],
        [36, 3],
        [35.2, 6.4],
      ].map(([x, z], i) => (
        <group key={i} position={[x, 0, z]}>
          <Box p={[0, 0.08, 0]} s={[2.3, 0.16, 1.9]} m={crate} />
          <Box p={[0, 0.9, 0]} s={[2.1, 1.5, 1.7]} m={i % 2 ? crateBlue : crate} />
        </group>
      ))}
      <ControlRoom rect={sup} />
      <ServerCage rect={ent} />
      {/* telecom compound outside the east wall */}
      <Fence rect={[44, 9, 57, 29]} height={2.4} />
      <Box p={[46.5, 1.1, 19]} s={[2, 2.2, 3]} m={MAT.paintLight} />
      <Label text="HALDEN MOTIVE · PACK PLANT 2" p={[-1, 10.2, Z0 + 0.3]} size={1.2} color="#9fd8ff" opacityRef={() => 0.5} />
    </group>
  );
}
