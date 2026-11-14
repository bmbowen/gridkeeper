/** Mulberry32 — small deterministic PRNG. State is a single uint32 kept on the game state. */
export function rngNext(state: { rng: number }): number {
  let t = (state.rng += 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rngPick<T>(state: { rng: number }, items: readonly T[]): T {
  return items[Math.floor(rngNext(state) * items.length) % items.length];
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
