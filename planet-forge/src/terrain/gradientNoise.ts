// 3D gradient noise (Perlin's improved noise) for the terrain's detail.
//
// Gradient rather than value noise (src/forge/noise.ts): its features have no
// lattice-aligned plateaus, which would show at ground level. Each lattice
// point takes one of the 12 directions to a cube's edges, chosen by a seeded
// hash; the quintic fade blends them with no creases. Floor, +, −, × and
// integer hashing only, so the same field in every browser.

import { mix } from "../forge/random";

/** 6t⁵ − 15t⁴ + 10t³. */
function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Perlin's 12 edge directions (4 repeated), indexed by a hash's low 4 bits, as tables: no branches on random bits, which cost twice the noise's time. */
const GRADIENTS: Vec3Table = (() => {
  const x = new Float64Array(16), y = new Float64Array(16), z = new Float64Array(16);
  for (let h = 0; h < 16; h++) {
    const u = h < 8 ? 0 : 1;                                   // the first axis: x, or y
    const v = h < 4 ? 1 : h === 12 || h === 14 ? 0 : 2;        // the second: y, x or z
    const axis = [x, y, z];
    axis[u][h] += (h & 1) === 0 ? 1 : -1;
    axis[v][h] += (h & 2) === 0 ? 1 : -1;
  }
  return { x, y, z };
})();

interface Vec3Table { x: Float64Array; y: Float64Array; z: Float64Array }

/** The dot product of a hashed edge direction with (x, y, z). */
function grad(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  return GRADIENTS.x[h] * x + GRADIENTS.y[h] * y + GRADIENTS.z[h] * z;
}

/**
 * Noise at a point, about within [−1, 1]; 0 at every lattice point. `seedBits`
 * is seedHash(seed). The corners' hashes are latticeHash(seed, x, y, z), built
 * here from shared parts (x, then y, then z), which is the same hash with
 * 14 scrambles instead of 32.
 */
export function gradientNoise(seedBits: number, x: number, y: number, z: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fade(fx), v = fade(fy), w = fade(fz);

  const hx0 = mix((seedBits + ix) | 0), hx1 = mix((seedBits + ix + 1) | 0);
  const h00 = mix((hx0 + iy) | 0), h01 = mix((hx0 + iy + 1) | 0);
  const h10 = mix((hx1 + iy) | 0), h11 = mix((hx1 + iy + 1) | 0);
  const z0 = iz, z1 = iz + 1;
  const g000 = grad(mix((h00 + z0) | 0), fx, fy, fz);
  const g100 = grad(mix((h10 + z0) | 0), fx - 1, fy, fz);
  const g010 = grad(mix((h01 + z0) | 0), fx, fy - 1, fz);
  const g110 = grad(mix((h11 + z0) | 0), fx - 1, fy - 1, fz);
  const g001 = grad(mix((h00 + z1) | 0), fx, fy, fz - 1);
  const g101 = grad(mix((h10 + z1) | 0), fx - 1, fy, fz - 1);
  const g011 = grad(mix((h01 + z1) | 0), fx, fy - 1, fz - 1);
  const g111 = grad(mix((h11 + z1) | 0), fx - 1, fy - 1, fz - 1);
  return lerp(
    lerp(lerp(g000, g100, u), lerp(g010, g110, u), v),
    lerp(lerp(g001, g101, u), lerp(g011, g111, u), v),
    w,
  );
}
