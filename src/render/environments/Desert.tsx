"use client";
import { useMemo } from "react";
import * as THREE from "three";
import type { MissionDef, Vec3 } from "@/sim/types";
import { MAT } from "../materials";
import { Beam, Box, Label, Particles } from "../parts";
import { seeded } from "../util";
import { Fence, Ground, LightPole, Scatter, Slab } from "./common";

const sand = new THREE.MeshStandardMaterial({ color: "#8a5a3c", roughness: 1 });
const mesaMat = new THREE.MeshStandardMaterial({ color: "#7c4630", roughness: 1, flatShading: true });
const mesaCap = new THREE.MeshStandardMaterial({ color: "#9a5c3c", roughness: 1, flatShading: true });
const gravel = new THREE.MeshStandardMaterial({ color: "#8b8176", roughness: 1 });
const cactus = new THREE.MeshStandardMaterial({ color: "#2f4a34", roughness: 0.9 });
const shrub = new THREE.MeshStandardMaterial({ color: "#5a5a36", roughness: 1, flatShading: true });
const rockGeo = new THREE.IcosahedronGeometry(1, 0);
const shrubGeo = new THREE.IcosahedronGeometry(1, 1);

function Mesa({ p, r, h, seed }: { p: Vec3; r: number; h: number; seed: number }) {
  const rot = (seed * 1.7) % 3;
  return (
    <group position={p} rotation={[0, rot, 0]}>
      <mesh material={mesaMat} position={[0, h * 0.22, 0]}>
        <cylinderGeometry args={[r * 1.05, r * 1.5, h * 0.44, 9]} />
      </mesh>
      <mesh material={mesaCap} position={[0, h * 0.7, 0]}>
        <cylinderGeometry args={[r * 0.82, r * 0.98, h * 0.6, 8]} />
      </mesh>
      <mesh material={mesaMat} position={[r * 0.15, h * 1.04, -r * 0.1]}>
        <cylinderGeometry args={[r * 0.5, r * 0.62, h * 0.12, 7]} />
      </mesh>
    </group>
  );
}

function Saguaro({ p, s, seed }: { p: Vec3; s: number; seed: number }) {
  const a = seed % 2 === 0;
  return (
    <group position={p} scale={s} rotation={[0, seed, 0]}>
      <mesh material={cactus} position={[0, 2.2, 0]} castShadow>
        <capsuleGeometry args={[0.32, 4, 4, 8]} />
      </mesh>
      <mesh material={cactus} position={[0.75, 2.4, 0]} castShadow>
        <capsuleGeometry args={[0.2, 1.4, 4, 6]} />
      </mesh>
      <mesh material={cactus} position={[0.42, 1.75, 0]} rotation={[0, 0, Math.PI / 2]}>
        <capsuleGeometry args={[0.2, 0.5, 4, 6]} />
      </mesh>
      {a && (
        <>
          <mesh material={cactus} position={[-0.7, 3, 0]} castShadow>
            <capsuleGeometry args={[0.18, 1.1, 4, 6]} />
          </mesh>
          <mesh material={cactus} position={[-0.4, 2.5, 0]} rotation={[0, 0, Math.PI / 2]}>
            <capsuleGeometry args={[0.18, 0.4, 4, 6]} />
          </mesh>
        </>
      )}
    </group>
  );
}

/** Open-roof control house so the consoles and racks inside stay visible. */
function ControlHouse({ rect }: { rect: [number, number, number, number] }) {
  const [x0, z0, x1, z1] = rect;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;
  return (
    <group>
      <Box p={[cx, 0.1, cz]} s={[w + 0.6, 0.2, d + 0.6]} m={MAT.concrete} shadow={false} />
      <Box p={[cx, 0.215, cz]} s={[w, 0.03, d]} m={MAT.floor} shadow={false} />
      {/* tall back walls */}
      <Box p={[cx, 2, z0]} s={[w + 0.3, 3.6, 0.3]} m={MAT.wall} />
      <Box p={[x0, 2, cz]} s={[0.3, 3.6, d]} m={MAT.wall} />
      {/* low front walls with glazing */}
      <Box p={[cx, 0.65, z1]} s={[w + 0.3, 0.9, 0.25]} m={MAT.wallDark} />
      <Box p={[x1, 0.65, cz]} s={[0.25, 0.9, d]} m={MAT.wallDark} />
      <Box p={[cx, 1.7, z1]} s={[w, 1.2, 0.05]} m={MAT.glass} shadow={false} />
      <Box p={[x1, 1.7, cz]} s={[0.05, 1.2, d]} m={MAT.glass} shadow={false} />
      {[x0, cx, x1].map((x) => (
        <Box key={x} p={[x, 2, z1]} s={[0.25, 3.6, 0.25]} m={MAT.wallDark} />
      ))}
      <Box p={[x1, 2, z0]} s={[0.3, 3.6, 0.3]} m={MAT.wallDark} />
      {/* roof edge beams hint at the removed roof */}
      <Beam a={[x0, 3.8, z1]} b={[x1, 3.8, z1]} radius={0.1} m={MAT.wallDark} square />
      <Beam a={[x1, 3.8, z0]} b={[x1, 3.8, z1]} radius={0.1} m={MAT.wallDark} square />
      {/* cable tray along the back wall, HVAC outside */}
      <Box p={[cx, 3.1, z0 + 0.5]} s={[w - 1, 0.1, 0.5]} m={MAT.galvanized} shadow={false} />
      <Box p={[x0 - 1.2, 0.8, cz - 2]} s={[1.6, 1.4, 1.6]} m={MAT.paintLight} />
      <Box p={[x0 - 1.2, 0.8, cz + 1]} s={[1.6, 1.4, 1.6]} m={MAT.paintLight} />
      <pointLight position={[cx, 3.2, cz]} color="#bfe6ff" intensity={38} distance={20} decay={1.7} />
      <Label text="CONTROL HOUSE" p={[cx, 4.6, z0]} size={0.7} color="#9fd8ff" opacityRef={() => 0.55} />
    </group>
  );
}

export function Desert({ mission }: { mission: MissionDef }) {
  const ctrl = mission.zones.find((z) => z.id === "ctrl")!.rect;
  const { rocks, shrubs, saguaros } = useMemo(() => {
    const rnd = seeded(1977);
    const outside = (x: number, z: number) => x < -42 || x > 34 || z < -28 || z > 46;
    const rocks: { p: Vec3; s: Vec3; ry: number }[] = [];
    const shrubs: { p: Vec3; s: Vec3; ry: number }[] = [];
    const saguaros: { p: Vec3; s: number; seed: number }[] = [];
    for (let i = 0; i < 420; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 35 + rnd() * rnd() * 240;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r + 8;
      if (!outside(x, z)) continue;
      const k = rnd();
      if (k < 0.3) {
        const s = 0.4 + rnd() * 1.6;
        rocks.push({ p: [x, s * 0.3, z], s: [s * (0.8 + rnd()), s * 0.6, s * (0.8 + rnd())], ry: rnd() * 6 });
      } else if (k < 0.93) {
        const s = 0.5 + rnd() * 0.9;
        shrubs.push({ p: [x, s * 0.35, z], s: [s * 1.3, s * 0.7, s * 1.3], ry: rnd() * 6 });
      } else if (saguaros.length < 22 && r < 170) saguaros.push({ p: [x, 0, z], s: 0.8 + rnd() * 0.7, seed: i });
    }
    return { rocks, shrubs, saguaros };
  }, []);

  return (
    <group>
      <Ground color="#8a5c40" vary="#b07a52" seed={11} />
      {/* yard pad and access road */}
      <Slab rect={[-38, -24, 30, 40]} m={gravel} />
      <Slab rect={[-2, 40, 6, 150]} m={MAT.asphalt} y={0.02} />
      <Slab rect={[-30, 26.5, 26, 28.2]} m={MAT.asphalt} y={0.05} />
      <Fence rect={[-38, -24, 30, 40]} />
      <ControlHouse rect={ctrl} />
      {/* bus support structures between bays for visual depth */}
      {[-10, 3].map((x) =>
        [-9, 9].map((z) => (
          <group key={`${x}${z}`} position={[x, 0, z]}>
            <Beam a={[0, 0, -2]} b={[0, 5.2, -2]} radius={0.09} m={MAT.galvanized} square />
            <Beam a={[0, 0, 2]} b={[0, 5.2, 2]} radius={0.09} m={MAT.galvanized} square />
            <Beam a={[0, 5.2, -2.4]} b={[0, 5.2, 2.4]} radius={0.09} m={MAT.galvanized} square />
          </group>
        )),
      )}
      {/* cable trench covers from the yard to the control house */}
      <Slab rect={[4.4, -14, 5.6, 18]} m={MAT.concreteDark} y={0.07} />
      <Slab rect={[-17, -0.6, 16, 0.6]} m={MAT.concreteDark} y={0.07} />
      <LightPole p={[-24, 0, -19]} rot={0.8} light={90} />
      <LightPole p={[20, 0, -19]} rot={2.4} />
      <LightPole p={[-24, 0, 16]} rot={-0.6} />
      <LightPole p={[19, 0, 17]} rot={-2.4} light={70} />
      {/* distance */}
      <Mesa p={[-210, 0, -150]} r={62} h={46} seed={1} />
      <Mesa p={[-70, 0, -260]} r={84} h={58} seed={2} />
      <Mesa p={[120, 0, -230]} r={56} h={40} seed={3} />
      <Mesa p={[-300, 0, 40]} r={70} h={52} seed={4} />
      <Mesa p={[250, 0, -90]} r={48} h={34} seed={5} />
      <Mesa p={[-170, 0, 210]} r={52} h={30} seed={6} />
      <Mesa p={[40, 0, -380]} r={110} h={70} seed={7} />
      <Scatter geometry={rockGeo} material={sand} items={rocks} castShadow />
      <Scatter geometry={shrubGeo} material={shrub} items={shrubs} />
      {saguaros.map((s) => (
        <Saguaro key={s.seed} {...s} />
      ))}
      {/* drifting dust catching the low sun */}
      <Particles p={[0, 0.5, 5]} count={70} rate={() => 9} color="#ffb070" intensity={1.4} size={[0.35, 0.6]} life={[5, 9]} velocity={[2.2, 0.25, 0.6]} jitter={0.8} radius={55} opacity={0.35} additive />
    </group>
  );
}
