"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo } from "react";
import * as THREE from "three";
import type { MissionDef, Vec3 } from "@/sim/types";
import { MAT } from "../materials";
import { Beam, Box, Cyl, Label, Particles } from "../parts";
import { game, seeded } from "../util";
import { Fence, Ground, LightPole, noiseTexture, Scatter, Slab } from "./common";

const bankMat = new THREE.MeshStandardMaterial({ color: "#4c5a3a", roughness: 1 });
const mudMat = new THREE.MeshStandardMaterial({ color: "#5a5140", roughness: 1 });
const apron = new THREE.MeshStandardMaterial({ color: "#7d8587", roughness: 0.95 });
const trunkMat = new THREE.MeshStandardMaterial({ color: "#3d3024", roughness: 1 });
const leafMat = new THREE.MeshStandardMaterial({ color: "#2f5a3c", roughness: 1, flatShading: true });
const leafMat2 = new THREE.MeshStandardMaterial({ color: "#3f6e44", roughness: 1, flatShading: true });
const reedMat = new THREE.MeshStandardMaterial({ color: "#6f7a45", roughness: 1 });
const hillMat = new THREE.MeshStandardMaterial({ color: "#3a5646", roughness: 1, flatShading: true });
const coneGeo = new THREE.ConeGeometry(1, 1, 7);
const trunkGeo = new THREE.CylinderGeometry(1, 1, 1, 6);
const rockGeo = new THREE.IcosahedronGeometry(1, 0);
const hillGeo = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);

/** Slowly drifting water surface: a lit material whose noise map scrolls downstream. */
function useFlowingWater(color: string, speed: [number, number], repeat: [number, number], opacity = 0.92) {
  const mat = useMemo(() => {
    const tex = noiseTexture(77, "#9fd8e2", "#ffffff", 256, 1);
    tex.repeat.set(repeat[0], repeat[1]);
    return new THREE.MeshStandardMaterial({ color, map: tex, roughness: 0.14, metalness: 0.45, transparent: opacity < 1, opacity });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color, opacity]);
  useFrame((_, dt) => {
    if (!mat.map) return;
    mat.map.offset.x += speed[0] * dt;
    mat.map.offset.y += speed[1] * dt;
  });
  return mat;
}

function River() {
  const mat = useFlowingWater("#2b7f93", [0.004, 0.03], [3, 22]);
  return (
    <group>
      {/* the ground plane is flat, so the river is a surface laid just above it with raised berms */}
      <mesh material={mat} position={[-66, 0.06, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[52, 900]} />
      </mesh>
      <Box p={[-39.6, 0.3, -228]} s={[3.2, 0.7, 444]} m={bankMat} shadow={false} />
      <Box p={[-39.6, 0.3, 228]} s={[3.2, 0.7, 444]} m={bankMat} shadow={false} />
      <Box p={[-92.4, 0.3, 0]} s={[3.2, 0.7, 900]} m={bankMat} shadow={false} />
      {/* gravel bars */}
      <Box p={[-78, 0.09, -40]} s={[9, 0.1, 46]} m={mudMat} shadow={false} />
      <Box p={[-52, 0.09, 70]} s={[7, 0.1, 38]} m={mudMat} shadow={false} />
    </group>
  );
}

/** Rectangular settling / sludge lagoon with a concrete rim. */
function Pond({ rect, color }: { rect: [number, number, number, number]; color: string }) {
  const [x0, z0, x1, z1] = rect;
  const mat = useFlowingWater(color, [0.006, 0.002], [2, 2]);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  return (
    <group>
      <Box p={[cx, 0.25, cz]} s={[x1 - x0 + 1.2, 0.5, z1 - z0 + 1.2]} m={MAT.concrete} shadow={false} />
      <mesh material={mat} position={[cx, 0.52, cz]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[x1 - x0, z1 - z0]} />
      </mesh>
      <Beam a={[x0, 1.3, z0 - 0.5]} b={[x1, 1.3, z0 - 0.5]} radius={0.03} m={MAT.hazard} shadow={false} />
      <Beam a={[x0, 1.3, z1 + 0.5]} b={[x1, 1.3, z1 + 0.5]} radius={0.03} m={MAT.hazard} shadow={false} />
      {/* walkway across the middle */}
      <Box p={[cx, 0.75, cz]} s={[1, 0.1, z1 - z0 + 1.2]} m={MAT.galvanized} shadow={false} />
    </group>
  );
}

/** Open-roof building so the consoles and racks inside stay visible. */
function OpenBuilding({ rect, label, light = 34 }: { rect: [number, number, number, number]; label: string; light?: number }) {
  const [x0, z0, x1, z1] = rect;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;
  return (
    <group>
      <Box p={[cx, 0.1, cz]} s={[w + 0.6, 0.2, d + 0.6]} m={MAT.concrete} shadow={false} />
      <Box p={[cx, 0.215, cz]} s={[w, 0.03, d]} m={MAT.floor} shadow={false} />
      <Box p={[cx, 2, z0]} s={[w + 0.3, 3.6, 0.3]} m={MAT.wall} />
      <Box p={[x0, 2, cz]} s={[0.3, 3.6, d]} m={MAT.wall} />
      {/* blue wainscot band ties the buildings to the plant livery */}
      <Box p={[cx, 3.5, z0 + 0.02]} s={[w + 0.34, 0.5, 0.3]} m={MAT.paintTeal} shadow={false} />
      <Box p={[x0 + 0.02, 3.5, cz]} s={[0.3, 0.5, d]} m={MAT.paintTeal} shadow={false} />
      <Box p={[cx, 0.65, z1]} s={[w + 0.3, 0.9, 0.25]} m={MAT.wallDark} />
      <Box p={[x1, 0.65, cz]} s={[0.25, 0.9, d]} m={MAT.wallDark} />
      <Box p={[cx, 1.7, z1]} s={[w, 1.2, 0.05]} m={MAT.glass} shadow={false} />
      <Box p={[x1, 1.7, cz]} s={[0.05, 1.2, d]} m={MAT.glass} shadow={false} />
      {[x0, x1].map((x) => (
        <Box key={x} p={[x, 2, z1]} s={[0.25, 3.6, 0.25]} m={MAT.wallDark} />
      ))}
      <Box p={[x1, 2, z0]} s={[0.3, 3.6, 0.3]} m={MAT.wallDark} />
      <Beam a={[x0, 3.8, z1]} b={[x1, 3.8, z1]} radius={0.1} m={MAT.wallDark} square />
      <Beam a={[x1, 3.8, z0]} b={[x1, 3.8, z1]} radius={0.1} m={MAT.wallDark} square />
      <Box p={[cx, 3.0, z0 + 0.5]} s={[w - 1, 0.1, 0.5]} m={MAT.galvanized} shadow={false} />
      <pointLight position={[cx, 3.2, cz]} color="#cfeaff" intensity={light} distance={18} decay={1.7} />
      <Label text={label} p={[cx, 4.7, z0]} size={0.7} color="#bfe6f2" opacityRef={() => 0.55} />
    </group>
  );
}

/** Elevated pipe rack: steel bents carrying utility lines. */
function PipeRack({ from, to, z }: { from: number; to: number; z: number }) {
  const bents = useMemo(() => {
    const out: number[] = [];
    for (let x = from; x <= to + 0.01; x += 7) out.push(x);
    return out;
  }, [from, to]);
  const len = to - from;
  const cx = (from + to) / 2;
  return (
    <group>
      {bents.map((x) => (
        <group key={x} position={[x, 0, z]}>
          <Beam a={[0, 0, -1.1]} b={[0, 4.2, -1.1]} radius={0.09} m={MAT.galvanized} square />
          <Beam a={[0, 0, 1.1]} b={[0, 4.2, 1.1]} radius={0.09} m={MAT.galvanized} square />
          <Beam a={[0, 4.2, -1.4]} b={[0, 4.2, 1.4]} radius={0.09} m={MAT.galvanized} square />
          <Beam a={[0, 3, -1.1]} b={[0, 3, 1.1]} radius={0.07} m={MAT.galvanized} square />
          <Beam a={[0, 0.2, -1.1]} b={[0, 3, 1.1]} radius={0.03} m={MAT.galvanized} shadow={false} />
        </group>
      ))}
      <Cyl p={[cx, 4.5, z - 0.8]} s={[0.2, len, 0.2]} r={[0, 0, Math.PI / 2]} m={MAT.paintYellow} low />
      <Cyl p={[cx, 4.45, z - 0.1]} s={[0.15, len, 0.15]} r={[0, 0, Math.PI / 2]} m={MAT.paintGreen} low />
      <Cyl p={[cx, 4.5, z + 0.7]} s={[0.22, len, 0.22]} r={[0, 0, Math.PI / 2]} m={MAT.paintLight} low />
      <Cyl p={[cx, 3.22, z - 0.5]} s={[0.14, len, 0.14]} r={[0, 0, Math.PI / 2]} m={MAT.paintBlue} low />
      <Box p={[cx, 3.12, z + 0.5]} s={[len, 0.08, 0.6]} m={MAT.galvanized} shadow={false} />
    </group>
  );
}

export function Water({ mission }: { mission: MissionDef }) {
  const ctrl = mission.zones.find((z) => z.id === "ctrl")!.rect;
  const dmz = mission.zones.find((z) => z.id === "dmz")!.rect;

  const { trunks, crowns, crowns2, reeds, rocks, hills } = useMemo(() => {
    const rnd = seeded(2204);
    type Item = { p: Vec3; s: Vec3; ry: number };
    const trunks: Item[] = [];
    const crowns: Item[] = [];
    const crowns2: Item[] = [];
    const reeds: Item[] = [];
    const rocks: Item[] = [];
    const hills: Item[] = [];
    // keep the plant, the river channel and the districts clear
    const blocked = (x: number, z: number) => (x > -40 && x < 48 && z > -50 && z < 52) || (x < -38 && x > -94) || (x > 44 && x < 84 && z > -40 && z < 40) || (Math.abs(x - 2) < 5 && z > 40);
    for (let i = 0; i < 520; i++) {
      const x = -260 + rnd() * 520;
      const z = -260 + rnd() * 500;
      if (blocked(x, z)) continue;
      const h = 4.5 + rnd() * 5.5;
      const r = 1.5 + rnd() * 1.4;
      trunks.push({ p: [x, h * 0.18, z], s: [0.22, h * 0.36, 0.22], ry: 0 });
      const tgt = rnd() > 0.45 ? crowns : crowns2;
      tgt.push({ p: [x, h * 0.36 + h * 0.34, z], s: [r, h * 0.7, r], ry: rnd() * 6 });
      tgt.push({ p: [x, h * 0.36 + h * 0.62, z], s: [r * 0.68, h * 0.5, r * 0.68], ry: rnd() * 6 });
    }
    for (let i = 0; i < 240; i++) {
      const side = rnd() > 0.35 ? -40.6 : -91.4;
      const z = -200 + rnd() * 400;
      if (side > -50 && Math.abs(z) < 6) continue; // intake mouth
      const h = 0.9 + rnd() * 1.2;
      reeds.push({ p: [side + (rnd() - 0.5) * 2.6, h / 2 + 0.3, z], s: [0.05, h, 0.05], ry: 0 });
    }
    for (let i = 0; i < 60; i++) {
      const z = -200 + rnd() * 400;
      const s = 0.4 + rnd() * 1.1;
      rocks.push({ p: [rnd() > 0.5 ? -42 - rnd() * 3 : -90 + rnd() * 3, 0.15, z], s: [s, s * 0.6, s * 1.2], ry: rnd() * 6 });
    }
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2 + rnd() * 0.3;
      const d = 300 + rnd() * 120;
      const r = 70 + rnd() * 80;
      hills.push({ p: [Math.cos(a) * d, -2, Math.sin(a) * d], s: [r, 24 + rnd() * 40, r], ry: rnd() * 6 });
    }
    return { trunks, crowns, crowns2, reeds, rocks, hills };
  }, []);

  return (
    <group>
      <Ground color="#4a6240" vary="#6d8552" seed={23} />
      <River />
      {/* plant apron, roads */}
      <Slab rect={[-38, -44, 44, 48]} m={apron} />
      <Slab rect={[-36, 18.6, 42, 21.4]} m={MAT.asphalt} y={0.05} />
      <Slab rect={[-1, 48, 5, 160]} m={MAT.asphalt} y={0.02} />
      <Slab rect={[-1, 34, 5, 48]} m={MAT.asphalt} y={0.05} />
      <Slab rect={[44, -1.6, 300, 1.6]} m={MAT.asphalt} y={0.02} />
      <Fence rect={[-38, -44, 44, 48]} />
      <OpenBuilding rect={ctrl} label="CONTROL ROOM" />
      <OpenBuilding rect={dmz} label="SERVER ROOM" light={22} />
      {/* settling lagoons and sludge drying beds north of the process line */}
      <Pond rect={[-34, -41, -14, -26]} color="#3f7a78" />
      <Pond rect={[-10, -41, 10, -26]} color="#4d7a68" />
      <Pond rect={[14, -41, 30, -26]} color="#6b6a48" />
      <Label text="SETTLING LAGOONS" p={[-12, 2.6, -42]} size={0.7} color="#bfe6f2" opacityRef={() => 0.5} />
      {/* chemical store and workshop */}
      <group position={[36, 0, -33]}>
        <Box p={[0, 2, 0]} s={[9, 4, 12]} m={MAT.wall} />
        <Box p={[0, 4.15, 0]} s={[9.6, 0.3, 12.6]} m={MAT.paintTeal} />
        <Box p={[-4.52, 1.6, 2]} s={[0.06, 3, 3.4]} m={MAT.paintBlue} shadow={false} />
        <Cyl p={[-6.5, 2.2, -3.5]} s={[1.4, 4.4, 1.4]} m={MAT.paintLight} />
        <Cyl p={[-6.5, 2.2, -0.2]} s={[1.4, 4.4, 1.4]} m={MAT.paintLight} />
      </group>
      <PipeRack from={-30} to={33} z={-20.5} />
      {/* cable trench covers from the process ring to the control room */}
      <Slab rect={[13.9, 4, 15.1, 18.6]} m={MAT.concreteDark} y={0.07} />
      <Slab rect={[-25, -0.5, 27, 0.5]} m={MAT.concreteDark} y={0.07} />
      <LightPole p={[-30, 0, -22]} rot={0.8} color="#e8f6ff" light={70} />
      <LightPole p={[38, 0, -20]} rot={2.5} color="#e8f6ff" />
      <LightPole p={[-30, 0, 17]} rot={-0.6} color="#e8f6ff" />
      <LightPole p={[30, 0, 17]} rot={-2.4} color="#e8f6ff" light={60} />
      <LightPole p={[8, 0, -17]} rot={1.57} color="#e8f6ff" />
      {/* landscape */}
      <Scatter geometry={hillGeo} material={hillMat} items={hills} />
      <Scatter geometry={trunkGeo} material={trunkMat} items={trunks} />
      <Scatter geometry={coneGeo} material={leafMat} items={crowns} castShadow />
      <Scatter geometry={coneGeo} material={leafMat2} items={crowns2} castShadow />
      <Scatter geometry={trunkGeo} material={reedMat} items={reeds} />
      <Scatter geometry={rockGeo} material={mudMat} items={rocks} />
      {/* river mist at dawn, drizzle once the weather turns */}
      <Particles p={[-62, 0.6, 0]} count={60} rate={() => 7} color="#dff3f2" size={[6, 16]} life={[7, 12]} velocity={[0.5, 0.25, 1.1]} jitter={0.5} radius={60} opacity={0.085} />
      <Particles p={[5, 0.4, 0]} count={36} rate={() => 3.5} color="#e6f6f4" size={[5, 12]} life={[7, 12]} velocity={[0.7, 0.15, 0.3]} jitter={0.4} radius={46} opacity={0.05} />
      <Particles p={[6, 34, 6]} count={260} rate={() => (game()?.weather === "storm" ? 150 : 0)} color="#cfe6f2" size={[0.32, 0.26]} life={[1.2, 1.6]} velocity={[2.5, -24, 1]} jitter={1.2} radius={62} opacity={0.4} />
    </group>
  );
}
