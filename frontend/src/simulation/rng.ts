// Seeded randomness. Every random draw in the simulation comes from a stream
// created here, so a universe seed always reproduces the same universe.

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

// ── Stream seeds ──────────────────────────────────────────────────────────────
//
// Why: combining ids with XOR is symmetric, so star 2 / planet 5 and star 5 /
// planet 2 received identical draws. mixSeed hashes its parts in order, so
// every (galaxy, star, planet, subsystem) combination gets its own stream.
//
// How: the MurmurHash3 32-bit finaliser (fmix32) applied after each part.
// It uses only Math.imul, XOR, shifts and 32-bit wrap-around, which are exact
// in every JavaScript engine, so the result never depends on the browser.
//
// Assumptions: parts are non-negative integers. Only their low 32 bits are
// used, as with the XOR seeding it replaces.

const GOLDEN_RATIO_32 = 0x9E3779B9;

function fmix32(x: number): number {
  x ^= x >>> 16;
  x = Math.imul(x, 0x85EBCA6B);
  x ^= x >>> 13;
  x = Math.imul(x, 0xC2B2AE35);
  x ^= x >>> 16;
  return x >>> 0;
}

/** An order-sensitive 32-bit seed from a galaxy seed and the ids that name one stream. */
export function mixSeed(seed: number, ...parts: number[]): number {
  let h = seed >>> 0;
  for (const part of parts) h = fmix32(h ^ fmix32((part + GOLDEN_RATIO_32) >>> 0));
  return h;
}

/**
 * One salt per subsystem, so streams that share the same ids stay independent.
 * STAR, PLANET and COSMIC_HISTORY keep their original values and XOR seeding,
 * so galaxies, stars and planetary systems are unchanged. The others are
 * reserved for the Worlds Up Close subsystems, which draw through mixSeed.
 */
export const SALT = {
  STAR:           0x5E3D57A2,
  PLANET:         0x914E7A3C,
  BIO:            0xB105F33D,
  CIV:            0xC1A35A2E,
  COSMIC_HISTORY: 0xC051C000,
  PHYSICS:        0x9A51C5E7,
  SURFACE:        0x5DFACE11,
  WORLD:          0x3A1D7E55,
  EVOLUTION:      0xE70C0DE5,
  SPECTRUM:       0x5BEC7A01,
  VISUAL:         0x71516A1F,
} as const;
