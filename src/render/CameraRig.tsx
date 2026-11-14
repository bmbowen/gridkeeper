"use client";
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { OrbitControls as OrbitImpl } from "three-stdlib";
import type { MissionDef } from "@/sim/types";
import { viewFx } from "@/state/fx";
import { useGame } from "@/state/game";
import { useSave } from "@/state/save";

const INTRO_SECONDS = 9;

/**
 * Orbit / pan / zoom camera with a cinematic fly-in, WASD panning and smooth focus moves.
 * In attract mode (menu backdrop) it slowly circles the site.
 */
export function CameraRig({ mission, attract }: { mission: MissionDef; attract?: boolean }) {
  const controls = useRef<OrbitImpl>(null);
  const { camera } = useThree();
  const intro = useGame((s) => s.intro);
  const reduced = useSave((s) => s.settings.reducedMotion);
  const t = useRef(0);
  const keys = useRef<Record<string, boolean>>({});
  const focusTarget = useRef<THREE.Vector3 | null>(null);
  const path = useMemo(() => new THREE.CatmullRomCurve3(mission.camera.intro.map((p) => new THREE.Vector3(...p)), false, "centripetal"), [mission]);
  const home = useMemo(() => new THREE.Vector3(...mission.camera.home), [mission]);
  const target = useMemo(() => new THREE.Vector3(...mission.camera.target), [mission]);
  const tmp = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    t.current = 0;
    camera.position.copy(intro && !reduced ? path.getPoint(0) : home);
    camera.lookAt(target);
    controls.current?.target.copy(target);
    controls.current?.update();
  }, [mission, camera, home, target, path]); // eslint-disable-line react-hooks/exhaustive-deps

  // Skipping (or finishing) the fly-in always lands on the home framing.
  useEffect(() => {
    if (intro || attract) return;
    camera.position.copy(home);
    camera.lookAt(target);
    controls.current?.target.copy(target);
    controls.current?.update();
  }, [intro, attract, camera, home, target]);

  useEffect(() => {
    if (attract) return;
    const down = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      keys.current[e.code] = true;
    };
    const up = (e: KeyboardEvent) => (keys.current[e.code] = false);
    const blur = () => (keys.current = {});
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, [attract]);

  useFrame(({ clock }, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    const c = controls.current;
    if (attract) {
      const a = clock.elapsedTime * (reduced ? 0 : 0.035) + 0.9;
      const r = home.distanceTo(target) * 0.92;
      camera.position.set(target.x + Math.cos(a) * r * 0.82, home.y * 0.62, target.z + Math.sin(a) * r * 0.82);
      camera.lookAt(target.x, target.y + 2, target.z);
      return;
    }
    if (intro) {
      if (reduced) {
        useGame.getState().endIntro();
        return;
      }
      t.current += dt / INTRO_SECONDS;
      const k = Math.min(1, t.current);
      const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
      camera.position.copy(path.getPoint(e));
      camera.lookAt(target);
      if (k >= 1) {
        c?.target.copy(target);
        c?.update();
        useGame.getState().endIntro();
      }
      return;
    }
    if (!c) return;
    // Keyboard pan, relative to the camera heading.
    const k = keys.current;
    const fx = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const fz = (k.KeyS || k.ArrowDown ? 1 : 0) - (k.KeyW || k.ArrowUp ? 1 : 0);
    if (fx || fz) {
      const speed = camera.position.distanceTo(c.target) * 0.7 * dt;
      camera.getWorldDirection(tmp);
      tmp.y = 0;
      tmp.normalize();
      const rx = -tmp.z;
      const rz = tmp.x;
      const mx = (rx * fx - tmp.x * fz) * speed;
      const mz = (rz * fx - tmp.z * fz) * speed;
      camera.position.x += mx;
      camera.position.z += mz;
      c.target.x += mx;
      c.target.z += mz;
      focusTarget.current = null;
      viewFx.cameraMoved = true;
    }
    const rot = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0);
    if (rot) {
      tmp.copy(camera.position).sub(c.target).applyAxisAngle(THREE.Object3D.DEFAULT_UP, rot * dt * 1.2);
      camera.position.copy(c.target).add(tmp);
      viewFx.cameraMoved = true;
    }
    if (viewFx.focus) {
      focusTarget.current = new THREE.Vector3(...viewFx.focus);
      viewFx.focus = null;
    }
    if (focusTarget.current) {
      tmp.copy(focusTarget.current).sub(c.target);
      if (tmp.length() < 0.15) focusTarget.current = null;
      else {
        tmp.multiplyScalar(reduced ? 1 : Math.min(1, dt * 4.5));
        c.target.add(tmp);
        camera.position.add(tmp);
      }
    }
    // Keep the orbit target inside the site.
    c.target.x = THREE.MathUtils.clamp(c.target.x, target.x - 60, target.x + 60);
    c.target.z = THREE.MathUtils.clamp(c.target.z, target.z - 60, target.z + 60);
    c.target.y = THREE.MathUtils.clamp(c.target.y, 0, 12);
    c.update();
  });

  if (attract) return null;
  return (
    <OrbitControls
      ref={controls}
      enabled={!intro}
      enableDamping
      dampingFactor={0.09}
      minDistance={14}
      maxDistance={150}
      maxPolarAngle={1.45}
      minPolarAngle={0.15}
      screenSpacePanning={false}
      zoomSpeed={0.9}
      rotateSpeed={0.55}
      panSpeed={0.9}
      onStart={() => {
        viewFx.cameraMoved = true;
        focusTarget.current = null;
      }}
      makeDefault
    />
  );
}
