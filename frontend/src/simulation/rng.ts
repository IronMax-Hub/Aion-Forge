// Mulberry32 — fast, deterministic, seed-driven PRNG
export function createRNG(seed: number) {
  let s = seed >>> 0;

  return function next(): number {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

export type RNG = ReturnType<typeof createRNG>;
