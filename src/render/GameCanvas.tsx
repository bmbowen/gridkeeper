"use client";
import { PerformanceMonitor } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bloom, EffectComposer, N8AO, Vignette } from "@react-three/postprocessing";
import { useEffect, useRef } from "react";
import * as THREE from "three";
import type { MissionDef } from "@/sim/types";
import { viewFx } from "@/state/fx";
import { useGame } from "@/state/game";
import { useSave, type Quality } from "@/state/save";
import { Atmosphere } from "./Atmosphere";
import { CameraRig } from "./CameraRig";
import { CyberOverlay } from "./CyberOverlay";
import { ENVIRONMENTS } from "./environments";
import { EquipmentLayer } from "./equipment";
import { Flows } from "./Flows";
import { EquipBadges, EventBursts, SelectionMarkers } from "./Fx";
import { NodesLayer } from "./nodes";

/** Steps the simulation from the render loop and eases shared view values. */
function Driver({ attract }: { attract?: boolean }) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const frames = useRef({ n: 0, t: 0 });
  useEffect(() => {
    const v = new THREE.Vector3();
    viewFx.project = (p) => {
      v.set(p[0], p[1], p[2]).project(camera);
      return [((v.x + 1) / 2) * size.width, ((1 - v.y) / 2) * size.height];
    };
    return () => {
      viewFx.project = null;
    };
  }, [camera, size]);
  useFrame((_, dt) => {
    const st = useGame.getState();
    if (!attract) st.advance(dt);
    const reduced = useSave.getState().settings.reducedMotion;
    const target = !attract && st.view === "cyber" ? 1 : 0;
    viewFx.mix = reduced ? target : THREE.MathUtils.damp(viewFx.mix, target, 5, dt);
    const f = frames.current;
    f.n++;
    f.t += dt;
    if (f.t >= 0.5) {
      viewFx.fps = f.n / f.t;
      viewFx.drawCalls = gl.info.render.calls;
      viewFx.triangles = gl.info.render.triangles;
      f.n = 0;
      f.t = 0;
    }
  });
  return null;
}

const DPR: Record<Quality, [number, number]> = { low: [0.75, 1], medium: [1, 1.5], high: [1, 2] };

function World({ mission, attract }: { mission: MissionDef; attract?: boolean }) {
  const Env = ENVIRONMENTS[mission.environment];
  return (
    <>
      <Driver attract={attract} />
      <Atmosphere env={mission.environment} target={mission.camera.target} />
      <CameraRig mission={mission} attract={attract} />
      {Env && <Env mission={mission} />}
      <EquipmentLayer equipment={mission.equipment} environment={mission.environment} />
      <NodesLayer nodes={mission.nodes} />
      <Flows mission={mission} />
      {!attract && (
        <>
          <CyberOverlay mission={mission} />
          <EventBursts mission={mission} />
          <EquipBadges mission={mission} />
          <SelectionMarkers />
        </>
      )}
    </>
  );
}

export default function GameCanvas({ mission, attract }: { mission: MissionDef; attract?: boolean }) {
  const quality = useSave((s) => s.settings.quality);
  const auto = useSave((s) => s.settings.autoQuality);
  const setSettings = useSave((s) => s.setSettings);
  useEffect(() => () => void (document.body.style.cursor = ""), []);
  return (
    <Canvas
      key={mission.id}
      shadows={quality !== "low"}
      dpr={DPR[quality]}
      camera={{ fov: 36, near: 1, far: 1200, position: mission.camera.home }}
      gl={{ antialias: quality !== "low", powerPreference: "high-performance" }}
      onPointerMissed={() => {
        if (!attract) useGame.getState().select(null);
      }}
      aria-label={`3D view of ${mission.location}`}
    >
      {auto && (
        <PerformanceMonitor
          flipflops={2}
          onDecline={() => {
            const q = useSave.getState().settings.quality;
            if (q !== "low") setSettings({ quality: q === "high" ? "medium" : "low" });
          }}
        />
      )}
      <World mission={mission} attract={attract} />
      {quality === "medium" && (
        <EffectComposer multisampling={0}>
          <Bloom mipmapBlur intensity={0.75} luminanceThreshold={1} luminanceSmoothing={0.2} radius={0.72} />
          <Vignette eskil={false} offset={0.22} darkness={0.72} />
        </EffectComposer>
      )}
      {quality === "high" && (
        <EffectComposer multisampling={0}>
          {/* Ambient occlusion grounds equipment on its pads and adds depth between machines. */}
          <N8AO aoRadius={2.6} distanceFalloff={1.2} intensity={2.4} quality="medium" halfRes color="#020611" />
          <Bloom mipmapBlur intensity={0.9} luminanceThreshold={1} luminanceSmoothing={0.2} radius={0.72} />
          <Vignette eskil={false} offset={0.22} darkness={0.72} />
        </EffectComposer>
      )}
    </Canvas>
  );
}
