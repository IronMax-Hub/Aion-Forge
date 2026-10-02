// Planet Forge's randomness: every draw comes from a spec's or a sketch's seed.
// Integer arithmetic only (Math.imul and shifts), so the same seed gives the
// same draws in every browser.

/** A stream of numbers in [0, 1) from a seed (mulberry32, as Aion Forge uses). */
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

/** Scrambles 32 bits (murmur3's finaliser): every input bit moves about half the output bits. */
function mix(h: number): number {
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h;
}

/** A number in [0, 1) for a point of an integer lattice and a seed: the same point always gives the same number. */
export function latticeValue(seed: number, x: number, y: number, z: number): number {
  // Each coordinate is mixed in on its own, so (x, y, z) and its permutations differ
  let h = mix(seed ^ 0x9e3779b9);
  h = mix((h + x) | 0);
  h = mix((h + y) | 0);
  h = mix((h + z) | 0);
  return (h >>> 0) / 0x100000000;
}
