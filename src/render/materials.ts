import * as THREE from "three";

/**
 * Shared physically based materials. Reusing a small palette keeps shader programs and
 * state changes low, and gives every facility the same visual language.
 */
const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(p);

export const MAT = {
  steel: std({ color: "#8d99a6", metalness: 0.85, roughness: 0.42 }),
  galvanized: std({ color: "#b4bec8", metalness: 0.7, roughness: 0.5 }),
  darkSteel: std({ color: "#2c3643", metalness: 0.8, roughness: 0.5 }),
  blackMetal: std({ color: "#14191f", metalness: 0.7, roughness: 0.55 }),
  paintGrey: std({ color: "#7f8f9b", metalness: 0.35, roughness: 0.55 }),
  paintLight: std({ color: "#c9d2d9", metalness: 0.2, roughness: 0.6 }),
  paintBlue: std({ color: "#24588f", metalness: 0.35, roughness: 0.5 }),
  paintTeal: std({ color: "#1f7f86", metalness: 0.35, roughness: 0.5 }),
  paintGreen: std({ color: "#2f7d4f", metalness: 0.3, roughness: 0.55 }),
  paintYellow: std({ color: "#e8a81c", metalness: 0.25, roughness: 0.5 }),
  paintOrange: std({ color: "#e0641c", metalness: 0.3, roughness: 0.5 }),
  paintRed: std({ color: "#b3262b", metalness: 0.3, roughness: 0.5 }),
  concrete: std({ color: "#74777a", metalness: 0, roughness: 0.95 }),
  concreteDark: std({ color: "#4a4e53", metalness: 0, roughness: 0.95 }),
  asphalt: std({ color: "#23272c", metalness: 0, roughness: 0.9 }),
  porcelain: std({ color: "#7a3b26", metalness: 0.1, roughness: 0.25 }),
  porcelainGrey: std({ color: "#aeb9c2", metalness: 0.1, roughness: 0.3 }),
  copper: std({ color: "#c67b4a", metalness: 0.95, roughness: 0.3 }),
  aluminium: std({ color: "#cfd6dc", metalness: 0.9, roughness: 0.3 }),
  rubber: std({ color: "#111418", metalness: 0, roughness: 0.9 }),
  wood: std({ color: "#5a4634", metalness: 0, roughness: 0.9 }),
  wall: std({ color: "#aab0b3", metalness: 0.05, roughness: 0.85 }),
  wallDark: std({ color: "#3b4651", metalness: 0.2, roughness: 0.7 }),
  floor: std({ color: "#2a323c", metalness: 0.2, roughness: 0.6 }),
  glass: std({ color: "#7fd4ff", metalness: 0.2, roughness: 0.08, transparent: true, opacity: 0.28 }),
  water: std({ color: "#1c6f8f", metalness: 0.3, roughness: 0.12, transparent: true, opacity: 0.86 }),
  wire: std({ color: "#1a1f25", metalness: 0.6, roughness: 0.5 }),
  hazard: std({ color: "#f2c230", metalness: 0.1, roughness: 0.6 }),
};

/** Unlit glowing material; values above 1 feed the bloom pass. */
export function glow(color: string, intensity = 2): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity) });
  m.toneMapped = false;
  return m;
}

export const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
  cyl8: new THREE.CylinderGeometry(1, 1, 1, 8),
  sphere: new THREE.SphereGeometry(1, 20, 14),
  sphereLow: new THREE.SphereGeometry(1, 8, 6),
  cone: new THREE.ConeGeometry(1, 1, 16),
  plane: new THREE.PlaneGeometry(1, 1),
};
