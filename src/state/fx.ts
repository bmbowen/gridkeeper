import type { SimEvent } from "@/sim/types";

/** Tiny pub/sub that carries simulation events to presentation layers (3D effects, audio, UI). */
type Listener = (e: SimEvent) => void;
const listeners = new Set<Listener>();

export function onFx(fn: Listener): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export function emitFx(e: SimEvent): void {
  for (const fn of listeners) fn(e);
}

/** Mutable per-frame view values shared by render components without React re-renders. */
export const viewFx = {
  /** 0 = physical view, 1 = cyber view (eased). */
  mix: 0,
  /** Camera focus request consumed by the camera rig. */
  focus: null as null | [number, number, number],
  cameraMoved: false,
  fps: 60,
  drawCalls: 0,
  triangles: 0,
};
