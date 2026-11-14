import * as THREE from "three";
import { useGame } from "@/state/game";
import type { EquipState, GameState, NodeState, Vec3 } from "@/sim/types";

export const PALETTE = {
  navy: "#0a1522",
  cyan: "#38d6ff",
  amber: "#ffb020",
  red: "#ff3d4a",
  green: "#3dff9e",
  white: "#e8f4ff",
  violet: "#a78bfa",
  grey: "#6b7a8c",
};

/** The live simulation, or the idle backdrop simulation shown behind menus. */
export const game = (): GameState | null => {
  const s = useGame.getState();
  return s.game ?? s.backdrop;
};
export const equipState = (id: string): EquipState | undefined => game()?.equipment[id];
export const nodeState = (id: string): NodeState | undefined => game()?.nodes[id];

/** Height above the ground at which a node's cyber marker floats. */
export const NODE_H = 5.2;
export const nodeAnchor = (pos: Vec3): THREE.Vector3 => new THREE.Vector3(pos[0], pos[1] + NODE_H, pos[2]);

/** Deterministic decor randomness so scenery is identical every load. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), s | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const labelCache = new Map<string, { tex: THREE.CanvasTexture; aspect: number }>();

export function labelTexture(text: string, color = "#e8f4ff", opts: { bg?: string; weight?: number; border?: string } = {}) {
  const key = `${text}|${color}|${opts.bg}|${opts.border}`;
  const hit = labelCache.get(key);
  if (hit) return hit;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `${opts.weight ?? 600} 44px Rajdhani, "Segoe UI", system-ui, sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 44;
  canvas.width = w;
  canvas.height = 72;
  ctx.font = font;
  if (opts.bg) {
    ctx.fillStyle = opts.bg;
    ctx.beginPath();
    ctx.roundRect(2, 2, w - 4, 68, 10);
    ctx.fill();
    if (opts.border) {
      ctx.strokeStyle = opts.border;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(0,0,0,0.9)";
  ctx.shadowBlur = 8;
  ctx.fillText(text, w / 2, 38);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const out = { tex, aspect: w / 72 };
  labelCache.set(key, out);
  return out;
}

/** Arc between two anchors, lifted in the middle. */
export function arcCurve(a: THREE.Vector3, b: THREE.Vector3, lift = 0.18): THREE.QuadraticBezierCurve3 {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  mid.y += a.distanceTo(b) * lift + 0.6;
  return new THREE.QuadraticBezierCurve3(a, mid, b);
}

/** Sagging conductor between two points. */
export function catenary(a: THREE.Vector3, b: THREE.Vector3, sag = 0.06, segments = 14): THREE.CatmullRomCurve3 {
  const pts: THREE.Vector3[] = [];
  const d = a.distanceTo(b) * sag;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = a.clone().lerp(b, t);
    p.y -= Math.sin(Math.PI * t) * d;
    pts.push(p);
  }
  return new THREE.CatmullRomCurve3(pts);
}

export function rotY(v: Vec3, rot: number): Vec3 {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

export const damp = THREE.MathUtils.damp;
export const lerp = THREE.MathUtils.lerp;
export const clamp = THREE.MathUtils.clamp;
