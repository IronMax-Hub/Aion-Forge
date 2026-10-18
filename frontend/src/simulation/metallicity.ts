// The galaxy's enrichment (Galaxy Through Time, MZ1).
//
// Why it exists: every generation of stars returns heavier elements to the gas
// the next generation forms from, so the gas grows richer in metals over
// cosmic time, fastest where stars form fastest. Planets are built from those
// metals (MZ2–MZ3 read this).
//
// How: the simplest form of a galaxy that turns its gas into stars while fresh
// gas falls in. The metallicity approaches the yield, faster near the centre
// ("inside-out" formation):
//   Z(R, t) = Z_floor + y · (1 − e^(−t / τ(R)))    relative to the Sun's (Z☉ = 1)
//   τ(R)    = τ_core · e^(R / R_τ)
//   [Fe/H]  = log10 Z
// R is the distance from the centre in the disc plane, √(x² + z²), as a share
// of the galaxy's scale; t is cosmic time, Gyr after the universe began.
//
// Constants per galaxy type (decision 7, decided 18 Oct 2026):
// - Spiral: y 1.6 (the centre levels off near +0.2), τ_core 1 Gyr, R_τ 0.233,
//   so the gas where and when the Sun formed (R = 0.52, t = 9.1 Gyr) is solar.
// - Elliptical: y 1.6, τ_core 0.3 Gyr, R_τ 0.5. One early, fast burst: even
//   its old stars are metal-rich, with a shallow gradient.
// - Irregular: y 0.5, τ_core 3 Gyr, R_τ 0.233. Slow star formation, and
//   outflows that carry metals away: it levels off near −0.3, like the
//   Magellanic Clouds.
//
// Assumptions and limits: one zone per radius (no radial migration of stars or
// gas); metals as one number (no alpha-element enhancement); the floor is the
// oldest halo stars' [Fe/H] = −3. Deterministic: it draws nothing.

import { exp, log } from "./detmath";
import type { GalaxyType } from "./galaxy";

/** Metals in the first gas, relative to the Sun's: [Fe/H] = −3, like the oldest halo stars. */
export const METALLICITY_FLOOR = 1e-3;

/** Each galaxy type's enrichment: the yield y, the centre's timescale τ_core (Gyr), and R_τ (share of the scale). */
export const ENRICHMENT: Record<GalaxyType, { yieldZ: number; coreGyr: number; scaleR: number }> = {
  spiral: { yieldZ: 1.6, coreGyr: 1, scaleR: 0.233 },
  elliptical: { yieldZ: 1.6, coreGyr: 0.3, scaleR: 0.5 },
  irregular: { yieldZ: 0.5, coreGyr: 3, scaleR: 0.233 },
};

const LN10 = log(10);

/** The gas's metallicity Z (Z☉ = 1) at a distance `rFraction` of the scale from the centre, `tGyr` after the universe began. */
export function gasMetallicity(type: GalaxyType, rFraction: number, tGyr: number): number {
  const { yieldZ, coreGyr, scaleR } = ENRICHMENT[type];
  const tau = coreGyr * exp(rFraction / scaleR);
  return METALLICITY_FLOOR + yieldZ * (1 - exp(-Math.max(0, tGyr) / tau));
}

/** [Fe/H], dex: log10 Z. */
export function feH(z: number): number {
  return log(z) / LN10;
}
