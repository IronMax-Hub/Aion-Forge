// Smooth seeded noise in 3D, for the sketcher's continents.
//
// Value noise: a seeded number at each point of an integer lattice, blended
// smoothly (quintic fade) between them, then layered as fBm: each octave twice
// as fine and half as strong. Floor, +, −, × only, so the same seed gives the
// same field in every browser.

import { latticeValue } from "./random";
import type { Vec3 } from "./icosphere";

/** 6t⁵ − 15t⁴ + 10t³: zero slope and curvature at both ends, so no creases between lattice cells. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Noise in [−1, 1] at a point. */
export function valueNoise(seed: number, [x, y, z]: Vec3): number {
  const [ix, iy, iz] = [Math.floor(x), Math.floor(y), Math.floor(z)];
  const [u, v, w] = [fade(x - ix), fade(y - iy), fade(z - iz)];
  const at = (dx: number, dy: number, dz: number) => latticeValue(seed, ix + dx, iy + dy, iz + dz);
  const value = lerp(
    lerp(lerp(at(0, 0, 0), at(1, 0, 0), u), lerp(at(0, 1, 0), at(1, 1, 0), u), v),
    lerp(lerp(at(0, 0, 1), at(1, 0, 1), u), lerp(at(0, 1, 1), at(1, 1, 1), u), v),
    w,
  );
  return value * 2 - 1;
}

/** fBm: `octaves` layers of noise from `frequency`, scaled so the result stays within [−1, 1]. */
export function fbm(seed: number, p: Vec3, frequency: number, octaves: number): number {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let f = frequency;
  for (let o = 0; o < octaves; o++, f *= 2) {
    // Each octave from its own seed, so octaves do not line up
    sum += amplitude * valueNoise((seed + Math.imul(o, 0x632be5ab)) | 0, [p[0] * f, p[1] * f, p[2] * f]);
    total += amplitude;
    amplitude /= 2;
  }
  return sum / total;
}
