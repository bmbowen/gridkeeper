"use client";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import type { MissionDef, Vec3 } from "@/sim/types";
import { viewFx } from "@/state/fx";
import { useSave } from "@/state/save";
import { StaticFeed } from "../equipment/grid";
import { MAT } from "../materials";
import { Beam, Box, Label, Particles } from "../parts";
import { equipState, game, seeded } from "../util";
import { Ground, Scatter, Slab } from "./common";

const hillMat = new THREE.MeshStandardMaterial({ color: "#0f1c1c", roughness: 1, flatShading: true });
const treeMat = new THREE.MeshStandardMaterial({ color: "#12281f", roughness: 1, flatShading: true });
const riverMat = new THREE.MeshStandardMaterial({ color: "#123a52", metalness: 0.5, roughness: 0.18, emissive: "#06202e", emissiveIntensity: 0.6 });
const roadMat = new THREE.MeshStandardMaterial({ color: "#1b1f25", roughness: 0.9 });
const cloudMat = new THREE.MeshBasicMaterial({ color: "#0b1020", transparent: true, opacity: 0, depthWrite: false, fog: false });
const hillGeo = new THREE.SphereGeometry(1, 9, 6);
const treeGeo = new THREE.ConeGeometry(1, 1, 6);

type P2 = [number, number];

/** Flat ribbon following a 2D path (rivers, highways). */
function Ribbon({ pts, width, y, m }: { pts: P2[]; width: number; y: number; m: THREE.Material }) {
  const geo = useMemo(() => {
    const curve = new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, y, z)));
    const n = pts.length * 12;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const p = curve.getPoint(i / n);
      const t = curve.getTangent(i / n);
      const px = -t.z;
      const pz = t.x;
      const l = Math.hypot(px, pz) || 1;
      pos.push(p.x + (px / l) * width * 0.5, y, p.z + (pz / l) * width * 0.5, p.x - (px / l) * width * 0.5, y, p.z - (pz / l) * width * 0.5);
      if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [pts, width, y]);
  return <mesh geometry={geo} material={m} receiveShadow />;
}

let skylineTex: THREE.CanvasTexture | null = null;
function skylineWindows(): THREE.CanvasTexture {
  if (skylineTex) return skylineTex;
  const c = document.createElement("canvas");
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, 64, 128);
  const rnd = seeded(808);
  for (let y = 0; y < 21; y++)
    for (let x = 0; x < 8; x++) {
      if (rnd() < 0.42) {
        ctx.fillStyle = rnd() < 0.78 ? "#ffd58a" : "#bfe3ff";
        ctx.fillRect(x * 8 + 2, y * 6 + 2, 4, 3);
      }
    }
  skylineTex = new THREE.CanvasTexture(c);
  skylineTex.magFilter = THREE.NearestFilter;
  return skylineTex;
}

/**
 * Distant city blocks drawn as one instanced mesh. Window light follows `power()`,
 * so a blackout rolls across the whole horizon.
 */
function Skyline({ p, seed, spread, count, tall }: { p: Vec3; seed: number; spread: number; count: number; tall: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: "#232a35", roughness: 0.85, emissive: "#ffd9a0", emissiveMap: skylineWindows(), emissiveIntensity: 1.5 }), []);
  const cur = useRef(1);
  const done = useRef(false);
  useFrame(({ clock }, dt) => {
    const im = ref.current;
    if (im && !done.current) {
      const rnd = seeded(seed * 613 + 7);
      const o = new THREE.Object3D();
      for (let i = 0; i < count; i++) {
        const w = 3 + rnd() * 5;
        const d = 3 + rnd() * 5;
        const h = (5 + rnd() * rnd() * 46) * tall;
        o.position.set((rnd() - 0.5) * spread * 2, h / 2, (rnd() - 0.5) * spread * 1.5);
        o.scale.set(w, h, d);
        o.updateMatrix();
        im.setMatrixAt(i, o.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
      done.current = true;
    }
    const g = game();
    const target = g ? Math.max(0, Math.min(1, g.production)) : 1;
    const prev = cur.current;
    cur.current = THREE.MathUtils.damp(prev, target, target < prev ? 5 : 1.6, dt);
    const flicker = cur.current < 0.95 && cur.current > 0.05 ? 0.8 + Math.sin(clock.elapsedTime * 31 + seed) * 0.2 : 1;
    mat.emissiveIntensity = 1.6 * cur.current * flicker;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} material={mat} position={p} frustumCulled={false}>
      <boxGeometry />
    </instancedMesh>
  );
}

const CARS = 22;

/** Headlights and tail lights streaming along a highway. */
function Traffic({ pts, y = 0.4, speed = 0.012 }: { pts: P2[]; y?: number; speed?: number }) {
  const curve = useMemo(() => new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, y, z))), [pts, y]);
  const white = useRef<THREE.InstancedMesh>(null);
  const red = useRef<THREE.InstancedMesh>(null);
  const mats = useMemo(() => {
    const a = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fff2cf").multiplyScalar(2.6) });
    const b = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ff3b30").multiplyScalar(2.4) });
    a.toneMapped = b.toneMapped = false;
    return [a, b];
  }, []);
  const offs = useMemo(() => {
    const r = seeded(pts.length * 31 + 5);
    return Array.from({ length: CARS }, () => ({ o: r(), v: 0.8 + r() * 0.5 }));
  }, [pts]);
  const d = useMemo(() => new THREE.Object3D(), []);
  const tan = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ clock }) => {
    const reduced = useSave.getState().settings.reducedMotion;
    const time = reduced ? 0 : clock.elapsedTime;
    for (const [im, dir] of [
      [white.current, 1],
      [red.current, -1],
    ] as const) {
      if (!im) continue;
      for (let i = 0; i < CARS; i++) {
        let t = (offs[i].o + time * speed * offs[i].v * dir + (dir < 0 ? 0.37 : 0)) % 1;
        if (t < 0) t += 1;
        curve.getPoint(t, d.position);
        curve.getTangent(t, tan);
        d.position.x += -tan.z * 0.55 * dir;
        d.position.z += tan.x * 0.55 * dir;
        d.scale.setScalar(0.17);
        d.updateMatrix();
        im.setMatrixAt(i, d.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  });
  return (
    <>
      <instancedMesh ref={white} args={[undefined, undefined, CARS]} material={mats[0]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 4]} />
      </instancedMesh>
      <instancedMesh ref={red} args={[undefined, undefined, CARS]} material={mats[1]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 4]} />
      </instancedMesh>
    </>
  );
}

/** Rain, rolling cloud bank and lightning while the simulation weather is "storm". */
function Storm() {
  const light = useRef<THREE.PointLight>(null);
  const clouds = useRef<THREE.Group>(null);
  const bolt = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(10 * 3), 3));
    const m = new THREE.LineBasicMaterial({ color: new THREE.Color("#cfe4ff").multiplyScalar(5), toneMapped: false, fog: false });
    const l = new THREE.Line(g, m);
    l.frustumCulled = false;
    l.visible = false;
    return l;
  }, []);
  const state = useRef({ next: 2, flash: 0, amount: 0 });
  const storm = () => game()?.weather === "storm";
  useFrame(({ clock }, dt) => {
    const s = state.current;
    const on = storm();
    s.amount = THREE.MathUtils.damp(s.amount, on ? 1 : 0, 1.2, dt);
    cloudMat.opacity = s.amount * 0.82 * (1 - viewFx.mix * 0.5);
    if (clouds.current) {
      clouds.current.visible = s.amount > 0.01;
      clouds.current.position.x = Math.sin(clock.elapsedTime * 0.03) * 20;
    }
    const reduced = useSave.getState().settings.reducedMotion;
    s.flash = Math.max(0, s.flash - dt * 3.2);
    if (on && !reduced) {
      s.next -= dt;
      if (s.next <= 0) {
        s.next = 3 + Math.random() * 6;
        s.flash = 1;
        // A jagged bolt somewhere on the far side of the valley.
        const x = -90 + Math.random() * 180;
        const z = -150 - Math.random() * 60;
        const pos = bolt.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < 10; i++) {
          const t = i / 9;
          pos[i * 3] = x + (Math.random() - 0.5) * 9 * (i > 0 ? 1 : 0);
          pos[i * 3 + 1] = 70 * (1 - t);
          pos[i * 3 + 2] = z + (Math.random() - 0.5) * 6;
        }
        bolt.geometry.attributes.position.needsUpdate = true;
        if (light.current) light.current.position.set(x * 0.5, 80, -70);
      }
    }
    bolt.visible = s.flash > 0.55;
    if (light.current) light.current.intensity = s.flash * s.flash * 9000 * (1 - viewFx.mix * 0.7);
  });
  return (
    <>
      <pointLight ref={light} color="#bcd4ff" intensity={0} distance={420} decay={1.4} position={[0, 80, -70]} />
      <primitive object={bolt} />
      <group ref={clouds} visible={false}>
        {[
          [-120, 62, -190, 90],
          [-20, 70, -210, 110],
          [90, 60, -180, 80],
          [170, 66, -120, 90],
          [-190, 64, -90, 80],
          [30, 86, -120, 120],
        ].map(([x, y, z, r], i) => (
          <mesh key={i} material={cloudMat} position={[x, y, z]} scale={[r, r * 0.16, r * 0.6]} renderOrder={-5}>
            <sphereGeometry args={[1, 12, 8]} />
          </mesh>
        ))}
      </group>
      <Particles p={[0, 42, 6]} count={340} rate={() => (storm() ? 300 : 0)} color="#9fc4ff" intensity={1.3} size={[0.42, 0.42]} life={[0.75, 0.95]} velocity={[-7, -46, 2]} jitter={2} radius={72} opacity={0.5} />
    </>
  );
}

/** Open-roof control centre with a video wall, so the consoles inside stay visible. */
function ControlCentre({ rect }: { rect: [number, number, number, number] }) {
  const [x0, z0, x1, z1] = rect;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const w = x1 - x0;
  const d = z1 - z0;
  const wall = useMemo(() => {
    const m = new THREE.MeshBasicMaterial();
    m.toneMapped = false;
    return m;
  }, []);
  useFrame(({ clock }) => {
    const g = game();
    const p = g ? g.production : 1;
    // The wall map turns from calm cyan to red as the city goes dark.
    wall.color.set(p > 0.9 ? "#2aa7d8" : p > 0.5 ? "#d89a2a" : "#d83a3a").multiplyScalar(1.2 + Math.sin(clock.elapsedTime * (p > 0.9 ? 1 : 6)) * 0.25);
  });
  return (
    <group>
      <Box p={[cx, 0.1, cz]} s={[w + 0.8, 0.2, d + 0.8]} m={MAT.concrete} shadow={false} />
      <Box p={[cx, 0.215, cz]} s={[w, 0.03, d]} m={MAT.floor} shadow={false} />
      <Box p={[cx, 2.2, z0]} s={[w + 0.3, 4, 0.3]} m={MAT.wallDark} />
      <Box p={[x0, 2.2, cz]} s={[0.3, 4, d]} m={MAT.wallDark} />
      <Box p={[x1, 0.65, cz]} s={[0.25, 0.9, d]} m={MAT.wallDark} />
      <Box p={[cx, 0.65, z1]} s={[w + 0.3, 0.9, 0.25]} m={MAT.wallDark} />
      <Box p={[cx, 1.7, z1]} s={[w, 1.2, 0.05]} m={MAT.glass} shadow={false} />
      <Box p={[x1, 1.7, cz]} s={[0.05, 1.2, d]} m={MAT.glass} shadow={false} />
      {[x0, cx, x1].map((x) => (
        <Box key={x} p={[x, 2.2, z1]} s={[0.25, 4, 0.25]} m={MAT.wallDark} />
      ))}
      <Beam a={[x0, 4.2, z1]} b={[x1, 4.2, z1]} radius={0.1} m={MAT.wallDark} square />
      <Beam a={[x1, 4.2, z0]} b={[x1, 4.2, z1]} radius={0.1} m={MAT.wallDark} square />
      {/* video wall */}
      {[-0.32, 0, 0.32].map((k) => (
        <mesh key={k} material={wall} position={[cx + k * w, 2.5, z0 + 0.17]}>
          <planeGeometry args={[w * 0.29, 2.2]} />
        </mesh>
      ))}
      {/* rooftop plant and comms dish outside */}
      <Box p={[x0 - 1.6, 0.9, cz - 1.5]} s={[1.8, 1.6, 1.8]} m={MAT.paintLight} />
      <Box p={[x0 - 1.6, 0.9, cz + 1.5]} s={[1.8, 1.6, 1.8]} m={MAT.paintLight} />
      <pointLight position={[cx, 3.4, cz]} color="#9fdcff" intensity={46} distance={24} decay={1.7} />
      <Label text="GRID CONTROL CENTRE" p={[cx, 5.2, z0]} size={0.7} color="#9fd8ff" opacityRef={() => 0.55} />
    </group>
  );
}

const RIVER: P2[] = [
  [40, -260],
  [33, -150],
  [27.5, -80],
  [28.5, -40],
  [30.5, -10],
  [30, 16],
  [28, 44],
  [24, 80],
  [30, 150],
  [22, 260],
];
const HIGHWAY_NS: P2[] = [
  [-22, -260],
  [-30, -120],
  [-33.5, -60],
  [-33, -20],
  [-33, 20],
  [-32, 48],
  [-27, 58],
  [-36, 120],
  [-30, 260],
];
const HIGHWAY_EW: P2[] = [
  [-260, 70],
  [-120, 62],
  [-50, 57.5],
  [0, 58],
  [34, 57],
  [70, 60],
  [140, 54],
  [260, 62],
];

const eq = (id: string) => () => {
  const s = equipState(id);
  return s && !s.tripped ? s.out : 0;
};

export function Grid({ mission }: { mission: MissionDef }) {
  const cc = mission.zones.find((z) => z.id === "cc")!.rect;
  const by = useMemo(() => Object.fromEntries(mission.equipment.map((e) => [e.id, e.pos])) as Record<string, Vec3>, [mission]);

  const { hills, trees } = useMemo(() => {
    const rnd = seeded(505);
    const hills: { p: Vec3; s: Vec3; ry: number }[] = [];
    for (let i = 0; i < 46; i++) {
      const a = rnd() * Math.PI * 2;
      const r = 120 + rnd() * 260;
      const s = 30 + rnd() * 60;
      hills.push({ p: [Math.cos(a) * r, -2, Math.sin(a) * r], s: [s, s * (0.12 + rnd() * 0.22), s * (0.6 + rnd() * 0.6)], ry: rnd() * 6 });
    }
    // Keep trees off the facilities, the river and the roads.
    const keep: [number, number, number][] = [
      ...mission.equipment.map((e) => [e.pos[0], e.pos[2], e.kind === "line" ? 0 : 13] as [number, number, number]),
      ...mission.nodes.map((n) => [n.pos[0], n.pos[2], 4] as [number, number, number]),
    ];
    const trees: { p: Vec3; s: Vec3; ry: number }[] = [];
    for (let i = 0; i < 900 && trees.length < 420; i++) {
      const x = (rnd() - 0.5) * 300;
      const z = (rnd() - 0.5) * 300;
      if (Math.abs(x - 29) < 5 && Math.abs(z) < 120) continue;
      if (Math.abs(x + 33) < 3) continue;
      if (Math.abs(z - 58) < 4) continue;
      if (x > -32 && x < 24 && z > -36 && z < 36 && rnd() < 0.8) continue; // corridor right-of-way stays mostly clear
      if (keep.some(([kx, kz, kr]) => Math.hypot(x - kx, z - kz) < kr)) continue;
      const h = 1.6 + rnd() * 2.4;
      trees.push({ p: [x, h / 2, z], s: [h * 0.34, h, h * 0.34], ry: rnd() * 6 });
    }
    return { hills, trees };
  }, [mission]);

  return (
    <group>
      <Ground color="#16282a" vary="#2a4442" seed={55} />
      <Ribbon pts={RIVER} width={6} y={0.05} m={riverMat} />
      <Ribbon pts={HIGHWAY_NS} width={2.6} y={0.07} m={roadMat} />
      <Ribbon pts={HIGHWAY_EW} width={2.6} y={0.07} m={roadMat} />
      <Traffic pts={HIGHWAY_NS} />
      <Traffic pts={HIGHWAY_EW} speed={0.01} />
      {/* bridges over the river */}
      <Slab rect={[24, -9.6, 36, -7.4]} m={MAT.concrete} y={0.45} h={0.3} />
      <Slab rect={[23, 25, 35, 27.2]} m={MAT.concrete} y={0.45} h={0.3} />
      <ControlCentre rect={cc} />

      {/* generator ties into the switchyard */}
      <StaticFeed from={[by.plantA[0] + 5, 0, by.plantA[2] + 5]} to={[by.hub[0] - 4, 0, by.hub[2] - 4]} flow={eq("plantA")} height={4.4} />
      <StaticFeed from={[by.plantB[0] + 6, 0, by.plantB[2] + 1]} to={[by.hub[0] - 7, 0, by.hub[2]]} flow={eq("plantB")} height={4.4} />
      <StaticFeed from={[by.wind[0] + 6, 0, by.wind[2] + 6]} to={[by.hub[0] - 4, 0, by.hub[2] + 5]} flow={eq("wind")} height={4.4} />
      {/* distribution feeders across the river */}
      <StaticFeed from={[by.subN[0] + 5, 0, by.subN[2] + 2]} to={[by.downtown[0] - 11, 0, by.downtown[2] - 6]} flow={() => (eq("subN")() > 0.05 ? eq("downtown")() : 0)} />
      <StaticFeed from={[by.subS[0] + 5, 0, by.subS[2] - 2]} to={[by.downtown[0] - 11, 0, by.downtown[2] + 6]} flow={() => (eq("subS")() > 0.05 ? eq("downtown")() : 0)} />
      <StaticFeed from={[by.subN[0] + 4, 0, by.subN[2] - 3]} to={[by.north[0] - 11, 0, by.north[2] + 7]} flow={() => (eq("subN")() > 0.05 || eq("subS")() > 0.05 ? eq("north")() : 0)} />
      <StaticFeed from={[by.subS[0] + 4, 0, by.subS[2] + 3]} to={[by.harbor[0] - 11, 0, by.harbor[2] - 7]} flow={() => (eq("subN")() > 0.05 || eq("subS")() > 0.05 ? eq("harbor")() : 0)} />
      <StaticFeed from={[by.subS[0] - 1, 0, by.subS[2] + 4]} to={[by.foundry[0], 0, by.foundry[2] - 8]} flow={() => (eq("subN")() > 0.05 || eq("subS")() > 0.05 ? eq("foundry")() : 0)} />

      {/* the wider metro area: its lights follow how much of the city is supplied */}
      <Skyline p={[138, 0, -10]} seed={91} spread={46} count={90} tall={0.8} />
      <Skyline p={[112, 0, 96]} seed={17} spread={36} count={50} tall={0.42} />
      <Skyline p={[104, 0, -108]} seed={29} spread={34} count={46} tall={0.38} />
      <Skyline p={[-10, 0, 118]} seed={41} spread={44} count={60} tall={0.12} />
      <Skyline p={[-116, 0, 100]} seed={43} spread={30} count={36} tall={0.11} />
      <Skyline p={[-100, 0, -96]} seed={47} spread={28} count={30} tall={0.11} />
      <Skyline p={[24, 0, -128]} seed={53} spread={36} count={40} tall={0.12} />

      <Scatter geometry={hillGeo} material={hillMat} items={hills} />
      <Scatter geometry={treeGeo} material={treeMat} items={trees} />
      <Storm />
    </group>
  );
}
