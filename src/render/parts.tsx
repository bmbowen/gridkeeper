"use client";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { sfx } from "@/audio/sound";
import { useGame, type Pick } from "@/state/game";
import { useSave } from "@/state/save";
import type { Vec3 } from "@/sim/types";
import { GEO, MAT } from "./materials";
import { labelTexture } from "./util";

// ------------------------------------------------------------------ primitives

type MeshProps = {
  p?: Vec3;
  s?: Vec3 | number;
  r?: Vec3;
  m: THREE.Material;
  shadow?: boolean;
};

const scl = (s: Vec3 | number | undefined): Vec3 => (s === undefined ? [1, 1, 1] : typeof s === "number" ? [s, s, s] : s);

/** Box with size `s`, centered at `p`. */
export function Box({ p, s, r, m, shadow = true }: MeshProps) {
  return <mesh geometry={GEO.box} material={m} position={p} scale={scl(s)} rotation={r} castShadow={shadow} receiveShadow />;
}

/** Cylinder: s = [radius, height, radius]. */
export function Cyl({ p, s, r, m, shadow = true, low }: MeshProps & { low?: boolean }) {
  return <mesh geometry={low ? GEO.cyl8 : GEO.cyl} material={m} position={p} scale={scl(s)} rotation={r} castShadow={shadow} receiveShadow />;
}

export function Ball({ p, s, m, shadow = false }: MeshProps) {
  return <mesh geometry={GEO.sphere} material={m} position={p} scale={scl(s)} castShadow={shadow} />;
}

const insulatorCache = new Map<string, THREE.LatheGeometry>();

/** Porcelain insulator with sheds, built as a lathe profile. Origin at its base. */
export function Insulator({ p, r, height = 2, radius = 0.22, sheds = 7, m = MAT.porcelain }: { p?: Vec3; r?: Vec3; height?: number; radius?: number; sheds?: number; m?: THREE.Material }) {
  const geo = useMemo(() => {
    const key = `${height}|${radius}|${sheds}`;
    let g = insulatorCache.get(key);
    if (!g) {
      const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0)];
      const core = radius * 0.42;
      for (let i = 0; i < sheds; i++) {
        const y0 = (i / sheds) * height;
        const y1 = ((i + 0.55) / sheds) * height;
        pts.push(new THREE.Vector2(core, y0), new THREE.Vector2(radius, y0 + 0.02), new THREE.Vector2(core, y1));
      }
      pts.push(new THREE.Vector2(core, height), new THREE.Vector2(0, height));
      g = new THREE.LatheGeometry(pts, 12);
      insulatorCache.set(key, g);
    }
    return g;
  }, [height, radius, sheds]);
  return <mesh geometry={geo} material={m} position={p} rotation={r} castShadow />;
}

/** Tube following a curve (conductors, pipes, cables). */
export function Tube({ curve, radius = 0.05, m = MAT.wire, segments = 16, radial = 5, shadow = false }: { curve: THREE.Curve<THREE.Vector3>; radius?: number; m?: THREE.Material; segments?: number; radial?: number; shadow?: boolean }) {
  const geo = useMemo(() => new THREE.TubeGeometry(curve, segments, radius, radial, false), [curve, radius, segments, radial]);
  useEffect(() => () => geo.dispose(), [geo]);
  return <mesh geometry={geo} material={m} castShadow={shadow} />;
}

/** Straight pipe / beam between two points. */
export function Beam({ a, b, radius = 0.1, m = MAT.steel, square, shadow = true }: { a: Vec3; b: Vec3; radius?: number; m?: THREE.Material; square?: boolean; shadow?: boolean }) {
  const { pos, quat, len } = useMemo(() => {
    const va = new THREE.Vector3(...a);
    const vb = new THREE.Vector3(...b);
    const dir = vb.clone().sub(va);
    const len = dir.length();
    const quat = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return { pos: va.add(vb).multiplyScalar(0.5), quat, len };
  }, [a, b]);
  return <mesh geometry={square ? GEO.box : GEO.cyl8} material={m} position={pos} quaternion={quat} scale={square ? [radius * 2, len, radius * 2] : [radius, len, radius]} castShadow={shadow} receiveShadow />;
}

/**
 * Small status light. `state` is polled each frame and returns a colour and whether to flash.
 */
export function Lamp({ p, size = 0.14, state }: { p?: Vec3; size?: number; state: () => { color: THREE.ColorRepresentation; flash?: boolean; off?: boolean } }) {
  const mat = useMemo(() => {
    const m = new THREE.MeshBasicMaterial();
    m.toneMapped = false;
    return m;
  }, []);
  const tmp = useMemo(() => new THREE.Color(), []);
  useFrame(({ clock }) => {
    const s = state();
    tmp.set(s.color);
    const pulse = s.flash ? (Math.sin(clock.elapsedTime * 10) > 0 ? 3.2 : 0.25) : 2.2;
    mat.color.copy(tmp).multiplyScalar(s.off ? 0.06 : pulse);
  });
  return <mesh geometry={GEO.sphereLow} material={mat} position={p} scale={size} />;
}

/** Sprite label that keeps a readable on-screen size. */
export function Label({ text, p, color, size = 1, bg, border, visible = true, opacityRef }: { text: string; p?: Vec3; color?: string; size?: number; bg?: string; border?: string; visible?: boolean; opacityRef?: () => number }) {
  const ref = useRef<THREE.Sprite>(null);
  const { tex, aspect } = useMemo(() => labelTexture(text, color, { bg, border }), [text, color, bg, border]);
  const mat = useMemo(() => new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }), [tex]);
  useEffect(() => () => mat.dispose(), [mat]);
  const world = useMemo(() => new THREE.Vector3(), []);
  useFrame(({ camera }) => {
    const sp = ref.current;
    if (!sp) return;
    const o = opacityRef ? opacityRef() : 1;
    sp.visible = visible && o > 0.02;
    if (!sp.visible) return;
    mat.opacity = o;
    sp.getWorldPosition(world);
    const d = camera.position.distanceTo(world);
    const h = THREE.MathUtils.clamp(d * 0.021, 0.7, 4) * size;
    sp.scale.set(h * aspect, h, 1);
  });
  return <sprite ref={ref} material={mat} position={p} renderOrder={20} />;
}

// ------------------------------------------------------------------ selection

/** Makes its children hoverable / clickable as a game object. */
export function Selectable({ pick, children, disabled }: { pick: Pick; children: ReactNode; disabled?: boolean }) {
  const over = (e: ThreeEvent<PointerEvent>) => {
    if (disabled) return;
    e.stopPropagation();
    const st = useGame.getState();
    if (st.screen !== "game" || st.intro) return;
    st.hover(pick);
    document.body.style.cursor = "pointer";
  };
  const out = () => {
    const st = useGame.getState();
    if (st.hovered?.id === pick.id) st.hover(null);
    document.body.style.cursor = "";
  };
  const click = (e: ThreeEvent<MouseEvent>) => {
    if (disabled || e.delta > 5) return;
    const st = useGame.getState();
    if (st.screen !== "game" || st.intro) return;
    e.stopPropagation();
    st.select(pick);
    sfx.click();
  };
  return (
    <group onPointerOver={over} onPointerOut={out} onClick={click}>
      {children}
    </group>
  );
}

// ------------------------------------------------------------------ particles

const particleVert = /* glsl */ `
  attribute float aAlpha;
  attribute float aSize;
  varying float vAlpha;
  uniform float uScale;
  void main() {
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const particleFrag = /* glsl */ `
  varying float vAlpha;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d) * vAlpha * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;

export interface ParticleProps {
  p?: Vec3;
  count?: number;
  /** Particles per second; polled every frame so emission can follow simulation state. */
  rate: () => number;
  color: THREE.ColorRepresentation;
  /** Colour multiplier (>1 blooms). */
  intensity?: number;
  size?: [number, number];
  life?: [number, number];
  velocity?: Vec3;
  jitter?: number;
  radius?: number;
  gravity?: number;
  opacity?: number;
  additive?: boolean;
  /** Wind drift along X, m/s. */
  drift?: number;
}

/** Lightweight GPU point-sprite emitter used for smoke, steam, dust, sparks and embers. */
export function Particles({ p, count = 40, rate, color, intensity = 1, size = [1, 3], life = [1.5, 3], velocity = [0, 1.5, 0], jitter = 0.4, radius = 0.3, gravity = 0, opacity = 0.6, additive, drift = 0 }: ParticleProps) {
  const quality = useSave((s) => s.settings.quality);
  const n = quality === "low" ? Math.max(4, Math.floor(count / 2)) : count;
  const { geo, mat, data } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute("aAlpha", new THREE.BufferAttribute(new Float32Array(n), 1));
    geo.setAttribute("aSize", new THREE.BufferAttribute(new Float32Array(n), 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: particleVert,
      fragmentShader: particleFrag,
      uniforms: { uColor: { value: new THREE.Color(color).multiplyScalar(intensity) }, uOpacity: { value: opacity }, uScale: { value: 600 } },
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    const data = { vel: new Float32Array(n * 3), age: new Float32Array(n).fill(1e9), life: new Float32Array(n).fill(1), acc: 0 };
    return { geo, mat, data };
  }, [n, color, intensity, opacity, additive]);
  useEffect(
    () => () => {
      geo.dispose();
      mat.dispose();
    },
    [geo, mat],
  );
  const size3 = useThree((s) => s.size);
  useFrame(({ camera, gl }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const pos = geo.attributes.position.array as Float32Array;
    const alpha = geo.attributes.aAlpha.array as Float32Array;
    const sz = geo.attributes.aSize.array as Float32Array;
    const cam = camera as THREE.PerspectiveCamera;
    mat.uniforms.uScale.value = (size3.height * gl.getPixelRatio()) / (2 * Math.tan((cam.fov * Math.PI) / 360));
    data.acc += Math.max(0, rate()) * dt;
    for (let i = 0; i < n; i++) {
      if (data.age[i] >= data.life[i]) {
        if (data.acc >= 1) {
          data.acc -= 1;
          const a = Math.random() * Math.PI * 2;
          const rr = Math.sqrt(Math.random()) * radius;
          pos[i * 3] = Math.cos(a) * rr;
          pos[i * 3 + 1] = 0;
          pos[i * 3 + 2] = Math.sin(a) * rr;
          data.vel[i * 3] = velocity[0] + (Math.random() - 0.5) * jitter;
          data.vel[i * 3 + 1] = velocity[1] + (Math.random() - 0.5) * jitter;
          data.vel[i * 3 + 2] = velocity[2] + (Math.random() - 0.5) * jitter;
          data.age[i] = 0;
          data.life[i] = life[0] + Math.random() * (life[1] - life[0]);
        } else {
          alpha[i] = 0;
          continue;
        }
      }
      data.age[i] += dt;
      const t = data.age[i] / data.life[i];
      data.vel[i * 3 + 1] -= gravity * dt;
      pos[i * 3] += (data.vel[i * 3] + drift * t) * dt;
      pos[i * 3 + 1] += data.vel[i * 3 + 1] * dt;
      pos[i * 3 + 2] += data.vel[i * 3 + 2] * dt;
      alpha[i] = t >= 1 ? 0 : Math.sin(Math.min(1, t * 4) * Math.PI * 0.5) * (1 - t);
      sz[i] = size[0] + (size[1] - size[0]) * t;
    }
    if (data.acc > 2) data.acc = 2;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.aAlpha.needsUpdate = true;
    geo.attributes.aSize.needsUpdate = true;
  });
  return <points geometry={geo} material={mat} position={p} frustumCulled={false} renderOrder={5} />;
}

/** Smoke + ember plume driven by an equipment's heat and fire state. */
export function HeatPlume({ p, heat, fire }: { p?: Vec3; heat: () => number; fire: () => number }) {
  return (
    <group position={p}>
      <Particles count={36} rate={() => (fire() > 0 ? 16 : heat() > 0.55 ? (heat() - 0.5) * 16 : 0)} color="#20252b" size={[1.4, 6]} life={[2.5, 4.5]} velocity={[0.5, 2.6, 0]} radius={0.8} opacity={0.75} drift={1.6} />
      <Particles count={28} rate={() => (fire() > 0 ? 26 : 0)} color="#ff7a1a" intensity={3} size={[1.6, 0.3]} life={[0.4, 0.9]} velocity={[0, 3.2, 0]} jitter={1.6} radius={0.9} additive opacity={0.9} />
    </group>
  );
}

/** Flickering electrical arc between two points, shown while `active()` is true. */
export function Arc({ a, b, active }: { a: Vec3; b: Vec3; active: () => boolean }) {
  const ref = useRef<THREE.Line>(null);
  const line = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(9 * 3), 3));
    const mat = new THREE.LineBasicMaterial({ color: new THREE.Color("#bfe9ff").multiplyScalar(4), toneMapped: false });
    return new THREE.Line(geo, mat);
  }, []);
  useFrame(() => {
    const on = active();
    line.visible = on && Math.random() > 0.3;
    if (!line.visible) return;
    const pos = line.geometry.attributes.position.array as Float32Array;
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const j = i === 0 || i === 8 ? 0 : 0.35;
      pos[i * 3] = a[0] + (b[0] - a[0]) * t + (Math.random() - 0.5) * j;
      pos[i * 3 + 1] = a[1] + (b[1] - a[1]) * t + (Math.random() - 0.5) * j;
      pos[i * 3 + 2] = a[2] + (b[2] - a[2]) * t + (Math.random() - 0.5) * j;
    }
    line.geometry.attributes.position.needsUpdate = true;
  });
  return <primitive ref={ref} object={line} />;
}

/** Rotates its children around an axis at a polled speed (rad/s), with inertia. */
export function Spinner({ p, r, axis = "y", speed, children }: { p?: Vec3; r?: Vec3; axis?: "x" | "y" | "z"; speed: () => number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const cur = useRef(0);
  useFrame((_, dt) => {
    cur.current = THREE.MathUtils.damp(cur.current, speed(), 1.6, dt);
    if (ref.current) ref.current.rotation[axis] += cur.current * dt;
  });
  return (
    <group position={p} rotation={r}>
      <group ref={ref}>{children}</group>
    </group>
  );
}

/** Concrete equipment pad. */
export function Pad({ s, p = [0, 0.1, 0] }: { s: [number, number]; p?: Vec3 }) {
  return <Box p={p} s={[s[0], 0.2, s[1]]} m={MAT.concrete} shadow={false} />;
}
