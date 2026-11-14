"use client";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Vec3 } from "@/sim/types";
import { MAT } from "../materials";
import { Beam, Box, Lamp } from "../parts";
import { seeded } from "../util";

/** Procedural tiling noise texture for ground variation. */
export function noiseTexture(seed: number, base: string, vary: string, size = 256, repeat = 60): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d")!;
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const rnd = seeded(seed);
  for (let i = 0; i < 2600; i++) {
    ctx.globalAlpha = 0.05 + rnd() * 0.12;
    ctx.fillStyle = rnd() > 0.5 ? vary : "#000000";
    const r = 1 + rnd() * 5;
    ctx.beginPath();
    ctx.arc(rnd() * size, rnd() * size, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function Ground({ color, vary, seed = 1, size = 1400, repeat = 90 }: { color: string; vary: string; seed?: number; size?: number; repeat?: number }) {
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ map: noiseTexture(seed, color, vary, 256, repeat), roughness: 1, metalness: 0 }), [color, vary, seed, repeat]);
  return (
    <mesh material={mat} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
      <planeGeometry args={[size, size]} />
    </mesh>
  );
}

/** Flat slab on the ground: yard gravel, roads, floors. rect = [minX, minZ, maxX, maxZ]. */
export function Slab({ rect, y = 0.03, m, h = 0.06 }: { rect: [number, number, number, number]; y?: number; m: THREE.Material; h?: number }) {
  const [x0, z0, x1, z1] = rect;
  return <Box p={[(x0 + x1) / 2, y, (z0 + z1) / 2]} s={[x1 - x0, h, z1 - z0]} m={m} shadow={false} />;
}

/** Scatter many copies of one geometry with a single draw call. */
export function Scatter({ geometry, material, items, castShadow }: { geometry: THREE.BufferGeometry; material: THREE.Material; items: { p: Vec3; s: Vec3; ry?: number }[]; castShadow?: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    const d = new THREE.Object3D();
    items.forEach((it, i) => {
      d.position.set(...it.p);
      d.scale.set(...it.s);
      d.rotation.set(0, it.ry ?? 0, 0);
      d.updateMatrix();
      ref.current!.setMatrixAt(i, d.matrix);
    });
    ref.current!.instanceMatrix.needsUpdate = true;
    ref.current!.computeBoundingSphere();
  }, [items]);
  return <instancedMesh ref={ref} args={[geometry, material, items.length]} castShadow={castShadow} receiveShadow />;
}

let chainTex: THREE.CanvasTexture | null = null;
function chainLink(): THREE.CanvasTexture {
  if (chainTex) return chainTex;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const ctx = c.getContext("2d")!;
  ctx.strokeStyle = "#b8c2cc";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(32, 32);
  ctx.moveTo(32, 0);
  ctx.lineTo(0, 32);
  ctx.stroke();
  chainTex = new THREE.CanvasTexture(c);
  chainTex.wrapS = chainTex.wrapT = THREE.RepeatWrapping;
  return chainTex;
}

/** Chain-link perimeter fence around a rectangle, with a gap for a gate. */
export function Fence({ rect, height = 2.6, gate }: { rect: [number, number, number, number]; height?: number; gate?: { side: "s" | "e" | "n" | "w"; at: number; width: number } }) {
  const [x0, z0, x1, z1] = rect;
  const posts = useMemo(() => {
    const out: { p: Vec3; s: Vec3 }[] = [];
    const add = (x: number, z: number) => out.push({ p: [x, height / 2, z], s: [0.06, height, 0.06] });
    for (let x = x0; x <= x1 + 0.01; x += 4) {
      add(x, z0);
      add(x, z1);
    }
    for (let z = z0 + 4; z < z1; z += 4) {
      add(x0, z);
      add(x1, z);
    }
    return out;
  }, [x0, z0, x1, z1, height]);
  const panel = (len: number) => {
    const t = chainLink().clone();
    t.needsUpdate = true;
    t.repeat.set(len / 0.5, height / 0.5);
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false, color: "#9aa7b3" });
  };
  const sides = useMemo(() => {
    const defs: { side: string; a: Vec3; len: number; ry: number }[] = [
      { side: "n", a: [(x0 + x1) / 2, height / 2, z0], len: x1 - x0, ry: 0 },
      { side: "s", a: [(x0 + x1) / 2, height / 2, z1], len: x1 - x0, ry: 0 },
      { side: "w", a: [x0, height / 2, (z0 + z1) / 2], len: z1 - z0, ry: Math.PI / 2 },
      { side: "e", a: [x1, height / 2, (z0 + z1) / 2], len: z1 - z0, ry: Math.PI / 2 },
    ];
    return defs.map((d) => ({ ...d, mat: panel(d.len) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x0, z0, x1, z1, height]);
  void gate;
  return (
    <group>
      <Scatter geometry={new THREE.CylinderGeometry(1, 1, 1, 6)} material={MAT.galvanized} items={posts} />
      {sides.map((s) => (
        <mesh key={s.side} material={s.mat} position={s.a} rotation={[0, s.ry, 0]} renderOrder={2}>
          <planeGeometry args={[s.len, height]} />
        </mesh>
      ))}
      <Beam a={[x0, height, z0]} b={[x1, height, z0]} radius={0.03} m={MAT.galvanized} shadow={false} />
      <Beam a={[x0, height, z1]} b={[x1, height, z1]} radius={0.03} m={MAT.galvanized} shadow={false} />
      <Beam a={[x0, height, z0]} b={[x0, height, z1]} radius={0.03} m={MAT.galvanized} shadow={false} />
      <Beam a={[x1, height, z0]} b={[x1, height, z1]} radius={0.03} m={MAT.galvanized} shadow={false} />
    </group>
  );
}

/** Yard light pole. Set `light` to add a real point light (use sparingly). */
export function LightPole({ p, height = 9, color = "#ffe6b8", light, rot = 0 }: { p: Vec3; height?: number; color?: string; light?: number; rot?: number }) {
  return (
    <group position={p} rotation={[0, rot, 0]}>
      <Beam a={[0, 0, 0]} b={[0, height, 0]} radius={0.09} m={MAT.galvanized} />
      <Beam a={[0, height, 0]} b={[1.4, height + 0.2, 0]} radius={0.05} m={MAT.galvanized} />
      <Box p={[1.5, height + 0.12, 0]} s={[0.7, 0.14, 0.34]} m={MAT.darkSteel} />
      <Lamp p={[1.5, height, 0]} size={0.2} state={() => ({ color })} />
      {light ? <pointLight position={[1.5, height - 0.4, 0]} color={color} intensity={light} distance={46} decay={1.6} /> : null}
    </group>
  );
}
