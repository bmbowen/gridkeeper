"use client";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { EnvironmentId, Vec3 } from "@/sim/types";
import { viewFx } from "@/state/fx";
import { useSave } from "@/state/save";
import { seeded } from "./util";

export interface EnvConfig {
  skyTop: string;
  skyMid: string;
  skyHorizon: string;
  sunDir: Vec3;
  sunColor: string;
  sunIntensity: number;
  sunDisc: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fog: string;
  fogDensity: number;
  stars: number;
  exposure: number;
}

export const ENV: Record<EnvironmentId, EnvConfig> = {
  desert: { skyTop: "#070b24", skyMid: "#4a2466", skyHorizon: "#ff8648", sunDir: [-0.86, 0.17, -0.42], sunColor: "#ffae6e", sunIntensity: 3.4, sunDisc: 1, hemiSky: "#6f78ff", hemiGround: "#4a2f22", hemiIntensity: 1.0, fog: "#3a2244", fogDensity: 0.005, stars: 0.7, exposure: 1.25 },
  water: { skyTop: "#0c2233", skyMid: "#2f6b7a", skyHorizon: "#bfe6d8", sunDir: [0.6, 0.38, 0.5], sunColor: "#d8f1ea", sunIntensity: 2.4, sunDisc: 0.5, hemiSky: "#8fd0e0", hemiGround: "#22352c", hemiIntensity: 0.9, fog: "#4b7f88", fogDensity: 0.006, stars: 0, exposure: 1 },
  plant: { skyTop: "#03060f", skyMid: "#0c1630", skyHorizon: "#27325e", sunDir: [0.4, 0.55, 0.6], sunColor: "#9db8ff", sunIntensity: 1.5, sunDisc: 0.35, hemiSky: "#4d64a8", hemiGround: "#1a1410", hemiIntensity: 0.75, fog: "#0e1830", fogDensity: 0.006, stars: 1, exposure: 1.1 },
  factory: { skyTop: "#05080e", skyMid: "#0a1220", skyHorizon: "#162338", sunDir: [0.3, 0.9, 0.35], sunColor: "#dfe9ff", sunIntensity: 1.9, sunDisc: 0, hemiSky: "#8aa0c8", hemiGround: "#1c2028", hemiIntensity: 0.95, fog: "#0b121c", fogDensity: 0.004, stars: 0, exposure: 1.05 },
  grid: { skyTop: "#020409", skyMid: "#0a1230", skyHorizon: "#2a2a66", sunDir: [-0.4, 0.5, 0.7], sunColor: "#9db4ff", sunIntensity: 2.4, sunDisc: 0.3, hemiSky: "#5f78c8", hemiGround: "#1a1c26", hemiIntensity: 1.5, fog: "#0a1028", fogDensity: 0.0032, stars: 1, exposure: 1.3 },
};

const skyVert = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = p.xyww;
  }
`;
const skyFrag = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunColor;
  uniform float uSunDisc; uniform float uDim;
  void main() {
    float h = clamp(vDir.y, -0.1, 1.0);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, h));
    col = mix(col, uTop, smoothstep(0.16, 0.7, h));
    float s = max(0.0, dot(normalize(vDir), normalize(uSunDir)));
    col += uSunColor * (pow(s, 6.0) * 0.35 + pow(s, 60.0) * 0.6) * uSunDisc;
    col += uSunColor * smoothstep(0.9993, 0.9997, s) * 6.0 * uSunDisc;
    col = mix(col, uHorizon * 0.35, smoothstep(0.0, -0.08, vDir.y));
    col = mix(col, vec3(0.012, 0.03, 0.06), uDim * 0.86);
    gl_FragColor = vec4(col, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

/** Sky, sun, fog and ambient light for an environment; dims everything as the cyber view fades in. */
export function Atmosphere({ env, target }: { env: EnvironmentId; target: Vec3 }) {
  const cfg = ENV[env];
  const quality = useSave((s) => s.settings.quality);
  const { scene, gl } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const fogBase = useMemo(() => new THREE.Color(cfg.fog), [cfg.fog]);
  const fogCyber = useMemo(() => new THREE.Color("#04101c"), []);

  const skyMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: skyVert,
        fragmentShader: skyFrag,
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          uTop: { value: new THREE.Color(cfg.skyTop) },
          uMid: { value: new THREE.Color(cfg.skyMid) },
          uHorizon: { value: new THREE.Color(cfg.skyHorizon) },
          uSunDir: { value: new THREE.Vector3(...cfg.sunDir) },
          uSunColor: { value: new THREE.Color(cfg.sunColor) },
          uSunDisc: { value: cfg.sunDisc },
          uDim: { value: 0 },
        },
      }),
    [cfg],
  );

  const stars = useMemo(() => {
    if (cfg.stars <= 0) return null;
    const rnd = seeded(7);
    const n = 700;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2;
      const y = 0.12 + rnd() * 0.88;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 420, y * 420, Math.sin(a) * r * 420], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: new THREE.Color("#dfe8ff").multiplyScalar(1.6), size: 1.6, sizeAttenuation: false, transparent: true, opacity: cfg.stars, depthWrite: false, toneMapped: false, fog: false });
    return new THREE.Points(geo, mat);
  }, [cfg.stars]);

  useEffect(() => {
    scene.fog = new THREE.FogExp2(cfg.fog, cfg.fogDensity);
    gl.toneMappingExposure = cfg.exposure;
    return () => {
      scene.fog = null;
    };
  }, [scene, gl, cfg]);

  useEffect(() => {
    const l = sun.current;
    if (!l) return;
    l.target.position.set(...target);
    l.target.updateMatrixWorld();
  }, [target]);

  useFrame(() => {
    const mix = viewFx.mix;
    skyMat.uniforms.uDim.value = mix;
    if (sun.current) sun.current.intensity = cfg.sunIntensity * (1 - mix * 0.82);
    if (hemi.current) hemi.current.intensity = cfg.hemiIntensity * (1 - mix * 0.55);
    if (scene.fog) (scene.fog as THREE.FogExp2).color.copy(fogBase).lerp(fogCyber, mix);
    if (stars) (stars.material as THREE.PointsMaterial).opacity = cfg.stars * (1 - mix * 0.7);
  });

  const shadowSize = quality === "high" ? 2048 : 1024;
  const d = 62;
  return (
    <>
      <mesh material={skyMat} scale={450} frustumCulled={false} renderOrder={-10}>
        <sphereGeometry args={[1, 32, 16]} />
      </mesh>
      {stars && <primitive object={stars} />}
      <hemisphereLight ref={hemi} args={[cfg.hemiSky, cfg.hemiGround, cfg.hemiIntensity]} />
      <directionalLight
        ref={sun}
        color={cfg.sunColor}
        intensity={cfg.sunIntensity}
        position={[target[0] + cfg.sunDir[0] * 120, target[1] + cfg.sunDir[1] * 120, target[2] + cfg.sunDir[2] * 120]}
        castShadow={quality !== "low"}
        shadow-mapSize={[shadowSize, shadowSize]}
        shadow-camera-left={-d}
        shadow-camera-right={d}
        shadow-camera-top={d}
        shadow-camera-bottom={-d}
        shadow-camera-near={10}
        shadow-camera-far={320}
        shadow-bias={-0.0006}
        shadow-normalBias={0.06}
      />
    </>
  );
}
