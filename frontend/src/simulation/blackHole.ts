// Central black hole: the massive black hole at the centre of a galaxy, if it has one.
//
// Why it exists: nearly every large galaxy holds a supermassive black hole at its
// centre (the Milky Way's Sagittarius A* is about 4 million M☉), so a universe
// without one is missing a defining object.
//
// How it works: one seeded draw per galaxy, from its own stream (SALT.BLACK_HOLE),
// so stars, planets and life draw exactly as before. Its mass is log-normal about
// a typical value for the galaxy's type: ellipticals hold the heaviest, spirals
// Milky-Way-like ones, and dwarf irregulars often none at all or only an
// intermediate-mass one, as observed.
//
// How fast it feeds is drawn next, as a share of its Eddington limit (the rate at
// which its own light would push infalling gas away). Most black holes today feed
// slowly; a few blaze as quasars. The rate decides what surrounds it: from a
// hundredth of the limit up, a thin disc of gas glowing like a stack of blackbodies,
// hottest at its inner edge (Shakura–Sunyaev); below that, a faint, hot, puffed-up
// flow that radiates poorly, as around the Milky Way's Sagittarius A*.
//
// Assumptions and limitations: the galaxy has no mass of its own yet, so the black
// hole's mass follows its type alone, not the galaxy's size (the expansion rate) or
// a bulge–mass relation. It does not spin (Schwarzschild), so its disc's inner edge
// is at three horizon radii. It does not act on anything: no orbits, no quasar
// phase, no effect on life. It is a fact about the galaxy, not a force within it.

import type { GalaxyConfig, GalaxyType } from "./galaxy";
import { createRNG, gaussian, mixSeed, SALT } from "./rng";
import { pow } from "./detmath";

/** Above this mass, M☉, a black hole counts as supermassive; below it, intermediate-mass. */
export const SUPERMASSIVE_FROM_SOLAR = 1e5;

/** Sagittarius A*, the Milky Way's central black hole, M☉ (GRAVITY Collaboration 2019), for comparison. */
export const SAGITTARIUS_A_STAR_SOLAR = 4.3e6;

/** A black hole's event-horizon (Schwarzschild) radius per solar mass, km: 2GM☉/c². */
const SCHWARZSCHILD_KM_PER_SOLAR = 2.953;

/**
 * Each galaxy type's central black hole: the chance it has one, and its mass's
 * log-normal (log10 M☉ mean and spread in dex). Typical observed values:
 * spirals 10⁶–10⁸ (Milky Way 10⁶·⁶, Andromeda 10⁸·²), giant ellipticals
 * 10⁸–10¹⁰ (M87 10⁹·⁸), dwarf irregulars often none found, else 10⁴–10⁶.
 */
export const CENTRAL_BLACK_HOLE: Record<GalaxyType, { chance: number; log10MeanSolar: number; spreadDex: number }> = {
  spiral:     { chance: 1,   log10MeanSolar: 6.9, spreadDex: 0.5 },
  elliptical: { chance: 1,   log10MeanSolar: 8.5, spreadDex: 0.5 },
  irregular:  { chance: 0.5, log10MeanSolar: 5.0, spreadDex: 0.6 },
};

/**
 * How fast a black hole feeds, as a share of its Eddington limit: log-normal, capped at
 * the limit. Observed ratios run from about 10⁻⁹ (Sagittarius A*) to about 1 (quasars),
 * most of them far below a hundredth.
 */
export const ACCRETION = { log10MeanEddington: -4, spreadDex: 1.5, maxEddington: 1 } as const;

/** From this share of the Eddington limit up, gas cools into a thin disc; below it, it stays a hot, faint flow. */
export const THIN_DISC_FROM_EDDINGTON = 0.01;

/**
 * A thin disc's hottest temperature, K, at the Eddington limit around a black hole of
 * `atSolar` M☉. It scales as (rate / mass)^¼, so lighter and hungrier black holes have hotter discs.
 *
 * From Shakura–Sunyaev: σT⁴ = (3GMṀ / 8πr³)(1 − √(r_in/r)), hottest at r = 49/36 r_in, where
 * the bracket times (r_in/r)³ is 0.05665. The inner edge r_in is the innermost stable orbit of
 * a non-spinning hole, 6GM/c², which also sets the efficiency η = 1 − √(8/9) ≈ 0.057. At the
 * limit, Ṁ = L_Edd / ηc² with L_Edd = 1.26×10³¹ W per M☉, and at 10⁸ M☉ that gives 1.54×10⁵ K.
 */
export const DISC_PEAK_TEMPERATURE = { kelvin: 1.54e5, atSolar: 1e8 } as const;

export type BlackHoleKind = "supermassive" | "intermediate-mass";

/** What surrounds a black hole: a glowing thin disc, or a faint hot flow. */
export type AccretionMode = "thin-disc" | "hot-flow";

export interface CentralBlackHole {
  massSolar: number;
  kind: BlackHoleKind;
  eddingtonRatio: number;        // how fast it feeds, as a share of its Eddington limit
  accretionMode: AccretionMode;
  discPeakTemperatureK: number;  // its gas's hottest temperature, just outside the disc's inner edge
}

/** The galaxy's central black hole, or null for a galaxy that has none; the same galaxy always gives the same one. */
export function centralBlackHoleFor(galaxy: GalaxyConfig): CentralBlackHole | null {
  const rule = CENTRAL_BLACK_HOLE[galaxy.type];
  const rng = createRNG(mixSeed(galaxy.seed, SALT.BLACK_HOLE));
  if (rng() >= rule.chance) return null;
  const massSolar = pow(10, rule.log10MeanSolar + rule.spreadDex * gaussian(rng));
  // Drawn after the mass, so the mass stays as it was before the rate was added
  const eddingtonRatio = Math.min(ACCRETION.maxEddington, pow(10, ACCRETION.log10MeanEddington + ACCRETION.spreadDex * gaussian(rng)));
  return {
    massSolar,
    kind: massSolar >= SUPERMASSIVE_FROM_SOLAR ? "supermassive" : "intermediate-mass",
    eddingtonRatio,
    accretionMode: eddingtonRatio >= THIN_DISC_FROM_EDDINGTON ? "thin-disc" : "hot-flow",
    discPeakTemperatureK: DISC_PEAK_TEMPERATURE.kelvin * pow(eddingtonRatio / (massSolar / DISC_PEAK_TEMPERATURE.atSolar), 0.25),
  };
}

/** The black hole's event-horizon radius, km. */
export function eventHorizonRadiusKm(blackHole: Pick<CentralBlackHole, "massSolar">): number {
  return SCHWARZSCHILD_KM_PER_SOLAR * blackHole.massSolar;
}
