"use client";
import { useMemo } from "react";
import * as THREE from "three";
import type { MissionDef, Vec3 } from "@/sim/types";
import { LitBuildings, TransmissionTower } from "../equipment/substation";
import { MAT } from "../materials";
import { Beam, Box, Cyl, Insulator, Label, Lamp, Particles } from "../parts";
import { game, seeded } from "../util";
import { Fence, Ground, LightPole, Scatter, Slab } from "./common";

const SODIUM = "#ffab52";
const yard = new THREE.MeshStandardMaterial({ color: "#3a3d42", roughness: 1 });
const deck = new THREE.MeshStandardMaterial({ color: "#565b61", roughness: 0.9 });
const hillMat = new THREE.MeshStandardMaterial({ color: "#0d1422", roughness: 1, flatShading: true });
const coolPipe = new THREE.MeshStandardMaterial({ color: "#2d6fa8", metalness: 0.4, roughness: 0.45 });
const fuelPipe = new THREE.MeshStandardMaterial({ color: "#d0a020", metalness: 0.4, roughness: 0.5 });
const tankMat = new THREE.MeshStandardMaterial({ color: "#c2c9ce", metalness: 0.3, roughness: 0.55 });
const treeMat = new THREE.MeshStandardMaterial({ color: "#16261f", roughness: 1, flatShading: true });
const treeGeo = new THREE.ConeGeometry(1, 1, 6);
const gratingGeo = new THREE.BoxGeometry(1, 1, 1);

/** Hanging high-bay light: a glowing lamp on a drop rod. */
function HighBay({ p }: { p: Vec3 }) {
  return (
    <group position={p}>
      <Beam a={[0, 0, 0]} b={[0, 1.2, 0]} radius={0.03} m={MAT.darkSteel} shadow={false} />
      <mesh material={MAT.darkSteel} position={[0, 0, 0]}>
        <coneGeometry args={[0.5, 0.4, 10, 1, true]} />
      </mesh>
      <Lamp p={[0, -0.12, 0]} size={0.24} state={() => ({ color: "#dff0ff" })} />
    </group>
  );
}

/** Open steel frame of the turbine hall: columns, eaves, roof trusses and a bridge crane. No cladding, so the machines stay visible. */
function TurbineHall() {
  const xs = [-23, 1];
  const zs = [-27.5, -9, 9, 27.5];
  const h = 12.5;
  return (
    <group>
      {xs.map((x) =>
        zs.map((z) => (
          <group key={`${x}|${z}`}>
            <Beam a={[x, 0, z]} b={[x, h, z]} radius={0.22} m={MAT.darkSteel} square />
            <Box p={[x, 0.25, z]} s={[1, 0.5, 1]} m={MAT.concrete} />
          </group>
        )),
      )}
      {xs.map((x) => (
        <group key={x}>
          <Beam a={[x, h, zs[0]]} b={[x, h, zs[3]]} radius={0.2} m={MAT.darkSteel} square />
          {/* crane rail */}
          <Beam a={[x, h - 2.2, zs[0]]} b={[x, h - 2.2, zs[3]]} radius={0.14} m={MAT.paintYellow} square />
          {/* bracing in the end bays */}
          <Beam a={[x, 0.5, zs[0]]} b={[x, h - 2.2, zs[1]]} radius={0.06} m={MAT.darkSteel} shadow={false} />
          <Beam a={[x, h - 2.2, zs[2]]} b={[x, 0.5, zs[3]]} radius={0.06} m={MAT.darkSteel} shadow={false} />
        </group>
      ))}
      {/* roof trusses: shallow pitched top chord over a flat bottom chord */}
      {zs.map((z) => (
        <group key={z}>
          <Beam a={[xs[0], h, z]} b={[xs[1], h, z]} radius={0.12} m={MAT.darkSteel} square />
          <Beam a={[xs[0], h, z]} b={[-11, h + 2, z]} radius={0.1} m={MAT.darkSteel} square />
          <Beam a={[-11, h + 2, z]} b={[xs[1], h, z]} radius={0.1} m={MAT.darkSteel} square />
          {[-19, -15, -11, -7, -3].map((x, i) => (
            <Beam key={x} a={[x, h, z]} b={[x + (i < 2 ? 4 : i > 2 ? -4 : 0), h + 2 - Math.abs(x + (i < 2 ? 4 : i > 2 ? -4 : 0) + 11) / 6, z]} radius={0.04} m={MAT.darkSteel} shadow={false} />
          ))}
        </group>
      ))}
      <Beam a={[-11, h + 2, zs[0]]} b={[-11, h + 2, zs[3]]} radius={0.1} m={MAT.darkSteel} square />
      {/* overhead bridge crane parked between units 1 and 2 */}
      <group position={[0, h - 1.7, -9.5]}>
        <Beam a={[xs[0], 0, -0.7]} b={[xs[1], 0, -0.7]} radius={0.3} m={MAT.paintYellow} square />
        <Beam a={[xs[0], 0, 0.7]} b={[xs[1], 0, 0.7]} radius={0.3} m={MAT.paintYellow} square />
        <Box p={[-9, 0.2, 0]} s={[2, 0.9, 2]} m={MAT.darkSteel} />
        <Beam a={[-9, -0.2, 0]} b={[-9, -3.4, 0]} radius={0.03} m={MAT.wire} shadow={false} />
        <Box p={[-9, -3.6, 0]} s={[0.4, 0.5, 0.4]} m={MAT.paintYellow} />
      </group>
      {[-18, 0, 18].map((z) => (
        <group key={z}>
          <HighBay p={[-17, h - 1.4, z]} />
          <HighBay p={[-6, h - 1.4, z]} />
        </group>
      ))}
      <pointLight position={[-11, 10.5, 0]} color="#cfe4ff" intensity={260} distance={60} decay={1.5} />
    </group>
  );
}

/** Two-tier pipe rack on bents carrying cooling water and fuel across the site. */
function PipeRack({ from, to, pipes }: { from: Vec3; to: Vec3; pipes: { off: number; y: number; r: number; m: THREE.Material }[] }) {
  const a = new THREE.Vector3(...from);
  const b = new THREE.Vector3(...to);
  const len = a.distanceTo(b);
  const dir = b.clone().sub(a).normalize();
  const side = new THREE.Vector3(-dir.z, 0, dir.x);
  const n = Math.max(1, Math.round(len / 7));
  return (
    <group>
      {Array.from({ length: n + 1 }, (_, i) => {
        const c = a.clone().lerp(b, i / n);
        const l = c.clone().addScaledVector(side, -1.3);
        const r = c.clone().addScaledVector(side, 1.3);
        return (
          <group key={i}>
            <Beam a={[l.x, 0, l.z]} b={[l.x, 6.4, l.z]} radius={0.1} m={MAT.galvanized} square />
            <Beam a={[r.x, 0, r.z]} b={[r.x, 6.4, r.z]} radius={0.1} m={MAT.galvanized} square />
            <Beam a={[l.x, 4.4, l.z]} b={[r.x, 4.4, r.z]} radius={0.09} m={MAT.galvanized} square />
            <Beam a={[l.x, 6.2, l.z]} b={[r.x, 6.2, r.z]} radius={0.09} m={MAT.galvanized} square />
          </group>
        );
      })}
      {pipes.map((p, i) => {
        const s = a.clone().addScaledVector(side, p.off);
        const e = b.clone().addScaledVector(side, p.off);
        return <Beam key={i} a={[s.x, p.y + p.r, s.z]} b={[e.x, p.y + p.r, e.z]} radius={p.r} m={p.m} />;
      })}
    </group>
  );
}

function FuelTank({ p, r = 5, h = 9 }: { p: Vec3; r?: number; h?: number }) {
  return (
    <group position={p}>
      <Cyl p={[0, 0.2, 0]} s={[r + 0.6, 0.4, r + 0.6]} m={MAT.concrete} />
      <Cyl p={[0, h / 2 + 0.4, 0]} s={[r, h, r]} m={tankMat} />
      <mesh material={tankMat} position={[0, h + 0.4, 0]} castShadow>
        <coneGeometry args={[r, 1.1, 24]} />
      </mesh>
      {[0.3, 0.6, 0.9].map((t) => (
        <mesh key={t} material={MAT.darkSteel} position={[0, h * t + 0.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[r + 0.03, 0.06, 5, 32]} />
        </mesh>
      ))}
      {/* spiral stair, drawn as a rising run of treads */}
      {Array.from({ length: 14 }, (_, i) => {
        const a = (i / 14) * Math.PI * 1.2;
        return <Box key={i} p={[Math.cos(a) * (r + 0.45), 0.8 + (i / 14) * h, Math.sin(a) * (r + 0.45)]} s={[0.9, 0.08, 0.5]} r={[0, -a, 0]} m={MAT.galvanized} shadow={false} />;
      })}
      <Lamp p={[0, h + 1.2, 0]} size={0.16} state={() => ({ color: "#ff3d4a", off: Math.sin(performance.now() / 800 + p[2]) < 0 })} />
    </group>
  );
}

/** Open-roof control building split into the control room and the DMZ server room. */
function ControlBuilding({ ctrl, dmz }: { ctrl: [number, number, number, number]; dmz: [number, number, number, number] }) {
  const x0 = ctrl[0];
  const x1 = dmz[2];
  const z0 = Math.min(ctrl[1], dmz[1]);
  const z1 = Math.max(ctrl[3], dmz[3]);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;
  const split = (ctrl[2] + dmz[0]) / 2;
  return (
    <group>
      <Box p={[cx, 0.1, cz]} s={[w + 0.8, 0.2, d + 0.8]} m={MAT.concrete} shadow={false} />
      <Box p={[cx, 0.215, cz]} s={[w, 0.03, d]} m={MAT.floor} shadow={false} />
      <Box p={[cx, 2.1, z0]} s={[w + 0.3, 3.8, 0.3]} m={MAT.wall} />
      <Box p={[x0, 2.1, cz]} s={[0.3, 3.8, d]} m={MAT.wall} />
      <Box p={[cx, 0.65, z1]} s={[w + 0.3, 0.9, 0.25]} m={MAT.wallDark} />
      <Box p={[x1, 0.65, cz]} s={[0.25, 0.9, d]} m={MAT.wallDark} />
      <Box p={[cx, 1.75, z1]} s={[w, 1.3, 0.05]} m={MAT.glass} shadow={false} />
      <Box p={[x1, 1.75, cz]} s={[0.05, 1.3, d]} m={MAT.glass} shadow={false} />
      {/* partition between control room and server room */}
      <Box p={[split, 0.65, cz]} s={[0.2, 0.9, d]} m={MAT.wallDark} />
      <Box p={[split, 1.75, cz]} s={[0.05, 1.3, d]} m={MAT.glass} shadow={false} />
      {[x0, split, x1].map((x) => (
        <Box key={x} p={[x, 2.1, z1]} s={[0.3, 3.8, 0.3]} m={MAT.wallDark} />
      ))}
      <Box p={[x1, 2.1, z0]} s={[0.3, 3.8, 0.3]} m={MAT.wallDark} />
      <Beam a={[x0, 4, z1]} b={[x1, 4, z1]} radius={0.1} m={MAT.wallDark} square />
      <Beam a={[x1, 4, z0]} b={[x1, 4, z1]} radius={0.1} m={MAT.wallDark} square />
      {/* big mimic board on the back wall of the control room */}
      <Box p={[(ctrl[0] + ctrl[2]) / 2, 2.4, z0 + 0.22]} s={[ctrl[2] - ctrl[0] - 4, 1.8, 0.1]} m={MAT.blackMetal} shadow={false} />
      {[-6, -2, 2, 6].map((dx, i) => (
        <Lamp key={dx} p={[(ctrl[0] + ctrl[2]) / 2 + dx, 2.4 + (i % 2 ? 0.3 : -0.3), z0 + 0.32]} size={0.12} state={() => ({ color: (game()?.production ?? 1) > 0.9 ? "#3dff9e" : (game()?.production ?? 1) > 0.5 ? "#ffb020" : "#ff3d4a" })} />
      ))}
      <Box p={[cx, 3.3, z0 + 0.6]} s={[w - 2, 0.1, 0.5]} m={MAT.galvanized} shadow={false} />
      <Box p={[x0 - 1.3, 0.9, cz]} s={[1.7, 1.6, 2.6]} m={MAT.paintLight} />
      <pointLight position={[cx, 3.4, cz]} color="#bfe6ff" intensity={70} distance={30} decay={1.7} />
      <Label text="CONTROL ROOM" p={[(ctrl[0] + ctrl[2]) / 2, 4.9, z0]} size={0.7} color="#9fd8ff" opacityRef={() => 0.55} />
    </group>
  );
}

/** Rigid bus supports and disconnects between the step-up transformers and the export gantry. */
function Switchyard() {
  return (
    <group>
      {[-18, 0, 18].map((z) => (
        <group key={z} position={[17, 0, z * 0.55]}>
          {[-2.6, 0, 2.6].map((dz) => (
            <group key={dz} position={[0, 0, dz]}>
              <Beam a={[0, 0, 0]} b={[0, 4.6, 0]} radius={0.09} m={MAT.galvanized} square />
              <Insulator p={[0, 4.6, 0]} height={1.5} radius={0.2} sheds={6} />
            </group>
          ))}
          <Box p={[0, 0.1, 0]} s={[1.6, 0.2, 7]} m={MAT.concrete} shadow={false} />
        </group>
      ))}
    </group>
  );
}

export function Plant({ mission }: { mission: MissionDef }) {
  const ctrl = mission.zones.find((z) => z.id === "ctrl")!.rect;
  const dmz = mission.zones.find((z) => z.id === "dmz")!.rect;
  const { trees, grating } = useMemo(() => {
    const rnd = seeded(303);
    const trees: { p: Vec3; s: Vec3; ry: number }[] = [];
    for (let i = 0; i < 260; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 120 + rnd() * 260;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r - 10;
      if (x > 60 && Math.abs(z) < 40) continue; // keep the transmission corridor clear
      const h = 7 + rnd() * 9;
      trees.push({ p: [x, h / 2, z], s: [2.2 + rnd() * 2, h, 2.2 + rnd() * 2], ry: rnd() * 6 });
    }
    // Catwalk grating panels along the boiler-to-turbine corridor.
    const grating: { p: Vec3; s: Vec3 }[] = [];
    for (let z = -24; z <= 24; z += 3) grating.push({ p: [-26.6, 6.6, z], s: [1.6, 0.08, 2.9] });
    return { trees, grating };
  }, []);
  const posts = useMemo(() => {
    const out: { p: Vec3; s: Vec3 }[] = [];
    for (let z = -24; z <= 24; z += 6) {
      out.push({ p: [-27.3, 3.3, z], s: [0.14, 6.6, 0.14] }, { p: [-25.9, 3.3, z], s: [0.14, 6.6, 0.14] });
      out.push({ p: [-27.35, 7.15, z], s: [0.06, 1.1, 0.06] }, { p: [-25.85, 7.15, z], s: [0.06, 1.1, 0.06] });
    }
    return out;
  }, []);

  return (
    <group>
      <Ground color="#1c2420" vary="#2c3a30" seed={31} />
      {/* site slab, power block deck, roads */}
      <Slab rect={[-74, -72, 64, 56]} m={yard} />
      <Slab rect={[-40, -30, 14, 30]} m={deck} y={0.06} />
      <Slab rect={[-52, -66, -18, -30]} m={deck} y={0.06} />
      <Slab rect={[-74, 38, 64, 44]} m={MAT.asphalt} y={0.07} />
      <Slab rect={[2.5, -30, 6.5, 38]} m={MAT.asphalt} y={0.08} />
      <Slab rect={[20, 56, 28, 180]} m={MAT.asphalt} y={0.02} />
      <Fence rect={[-74, -72, 64, 56]} height={3} />

      <TurbineHall />
      <ControlBuilding ctrl={ctrl} dmz={dmz} />
      <Switchyard />

      {/* circulating-water headers: pumps → corridor → each condenser */}
      <Beam a={[-24.3, 0.75, -57]} b={[-24.3, 0.75, 19]} radius={0.5} m={coolPipe} />
      <Beam a={[-23, 0.75, -57]} b={[-23, 0.75, 19]} radius={0.5} m={coolPipe} />
      {[-18, 0, 18].map((z) => (
        <group key={z}>
          <Beam a={[-24.3, 0.75, z + 1]} b={[-14.7, 0.75, z + 2.4]} radius={0.38} m={coolPipe} />
          <Beam a={[-23, 0.75, z - 1]} b={[-14.7, 0.75, z - 2.4]} radius={0.38} m={coolPipe} />
        </group>
      ))}
      {/* return header back to the towers */}
      <PipeRack
        from={[-21, 0, -31]}
        to={[-52, 0, -31]}
        pipes={[
          { off: -0.7, y: 4.5, r: 0.45, m: coolPipe },
          { off: 0.6, y: 4.5, r: 0.45, m: coolPipe },
          { off: 0, y: 6.3, r: 0.22, m: MAT.galvanized },
        ]}
      />
      {/* fuel gas from the tank farm to the boiler fronts */}
      <PipeRack
        from={[-52, 0, 32.5]}
        to={[-28, 0, 32.5]}
        pipes={[
          { off: -0.6, y: 4.5, r: 0.26, m: fuelPipe },
          { off: 0.5, y: 4.5, r: 0.2, m: MAT.galvanized },
          { off: 0, y: 6.3, r: 0.3, m: fuelPipe },
        ]}
      />
      <Beam a={[-28, 4.8, 32.5]} b={[-28, 4.8, -18]} radius={0.24} m={fuelPipe} />
      {[-18, 0, 18].map((z) => (
        <Beam key={z} a={[-28, 4.8, z]} b={[-28.9, 3.3, z]} radius={0.2} m={fuelPipe} shadow={false} />
      ))}
      {/* elevated catwalk linking the boiler platforms */}
      <Scatter geometry={gratingGeo} material={MAT.galvanized} items={grating} castShadow />
      <Scatter geometry={gratingGeo} material={MAT.galvanized} items={posts} />
      <Beam a={[-27.35, 7.7, -25.5]} b={[-27.35, 7.7, 25.5]} radius={0.035} m={MAT.paintYellow} shadow={false} />
      <Beam a={[-25.85, 7.7, -25.5]} b={[-25.85, 7.7, 25.5]} radius={0.035} m={MAT.paintYellow} shadow={false} />

      {/* tank farm inside a containment bund */}
      <Slab rect={[-70, -2, -46, 34]} m={MAT.concreteDark} y={0.09} />
      {[
        [-58, 34.4, 24.6, 0.8],
        [-58, -2.4, 24.6, 0.8],
        [-70.4, 16, 0.8, 37.6],
        [-45.6, 16, 0.8, 37.6],
      ].map(([x, z, w, d], i) => (
        <Box key={i} p={[x, 0.6, z]} s={[w, 1.1, d]} m={MAT.concrete} shadow={false} />
      ))}
      <FuelTank p={[-62, 0, 6]} />
      <FuelTank p={[-62, 0, 24]} />
      <FuelTank p={[-51.5, 0, 15]} r={3.6} h={7} />

      {/* auxiliary buildings */}
      <Box p={[-8, 3, -52]} s={[22, 6, 12]} m={MAT.wallDark} />
      <Box p={[-8, 6.2, -52]} s={[22.6, 0.4, 12.6]} m={MAT.darkSteel} />
      <Box p={[30, 2.5, -48]} s={[16, 5, 10]} m={MAT.wall} />
      <Cyl p={[44, 4, -56]} s={[3, 8, 3]} m={tankMat} />
      <Cyl p={[52, 3, -50]} s={[2.4, 6, 2.4]} m={tankMat} />

      {/* sodium-vapour yard lighting */}
      <LightPole p={[-46, 0, -24]} rot={0.6} color={SODIUM} light={110} height={11} />
      <LightPole p={[16, 0, -30]} rot={2.2} color={SODIUM} light={90} height={11} />
      <LightPole p={[-44, 0, 36]} rot={-0.7} color={SODIUM} height={11} />
      <LightPole p={[8, 0, 40]} rot={-1.6} color={SODIUM} height={10} />
      <LightPole p={[42, 0, -22]} rot={2.6} color={SODIUM} height={11} />
      <LightPole p={[42, 0, 20]} rot={-2.6} color={SODIUM} height={11} />
      <LightPole p={[-64, 0, -44]} rot={0.3} color={SODIUM} height={11} />
      <LightPole p={[58, 0, 46]} rot={-2.4} color={SODIUM} height={10} />

      {/* a second, unpowered line leaving north-east gives the yard depth */}
      <TransmissionTower p={[46, 0, -66]} height={20} rot={0.5} />
      <TransmissionTower p={[96, 0, -112]} height={22} rot={0.5} />

      {/* the town this plant feeds: its lights follow the plant's output */}
      <LitBuildings p={[176, 0, -24]} power={() => game()?.production ?? 1} variant="city" seed={9} spread={46} count={34} tall={0.8} />
      <LitBuildings p={[150, 0, 66]} power={() => game()?.production ?? 1} variant="town" seed={4} spread={30} count={26} />

      {/* treeline and low hills on the horizon */}
      <Scatter geometry={treeGeo} material={treeMat} items={trees} />
      {[
        [-260, -180, 120, 40],
        [-60, -330, 170, 52],
        [200, -300, 130, 36],
        [-340, 80, 120, 44],
        [330, 150, 140, 34],
      ].map(([x, z, r, h], i) => (
        <mesh key={i} material={hillMat} position={[x, h * 0.3, z]} scale={[r, h, r * 0.8]}>
          <sphereGeometry args={[1, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      ))}

      {/* ground mist drifting off the cooling basins, lit by the yard lights */}
      <Particles p={[-34, 0.6, -44]} count={50} rate={() => 7} color="#c8d6e2" size={[5, 12]} life={[5, 9]} velocity={[1.6, 0.25, 0.7]} jitter={0.6} radius={18} opacity={0.12} />
      <Particles p={[-10, 0.5, 4]} count={40} rate={() => 5} color="#ffcf9a" intensity={1.2} size={[0.3, 0.5]} life={[5, 9]} velocity={[1.2, 0.3, 0.4]} jitter={0.7} radius={50} opacity={0.3} additive />
    </group>
  );
}
