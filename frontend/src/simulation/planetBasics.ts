// Facts about planets that both planet generation and the planet's physics
// need. They live here so planet.ts can run the physics modules without the
// modules importing planet.ts back.

import type { UniverseConfig } from "./config";
import type { AtmosphereType } from "./planet";
import { pow } from "./detmath";
import type { Star } from "./star";
import { massLossWidening, remnantFromGyr } from "./star";

/** The atmosphere draw: none, thin, moderate and thick below these bounds of one draw, else crushing (planets and moons). */
export const ATMOSPHERE_DRAW = { noneBelow: 0.15, thinBelow: 0.35, moderateBelow: 0.70, thickBelow: 0.90 } as const;

/** The atmosphere class a world forms with, from one uniform draw. */
export function atmosphereFromDraw(r: number): AtmosphereType {
  const d = ATMOSPHERE_DRAW;
  if (r < d.noneBelow) return "none";
  if (r < d.thinBelow) return "thin";
  if (r < d.moderateBelow) return "moderate";
  if (r < d.thickBelow) return "thick";
  return "crushing";
}

/** Above this mass (Earth masses) a planet is a gas or ice giant; below it, an envelope world is a sub-Neptune. */
export const GIANT_PLANET_MASS = 15;

/**
 * From this radius (Earth radii) up, a planet keeps a hydrogen–helium envelope and
 * has no solid surface (A3.4): the middle of the radius valley that splits rocky
 * super-Earths from gas-wrapped sub-Neptunes (Fulton et al. 2017). With Chen &
 * Kipping's radii and their ±20% spread, planets of about 3.5–5.5 M⊕ fall either side.
 */
export const ENVELOPE_FROM_EARTH_RADII = 1.75;

/**
 * The physical distance of an orbit from its star, in AU. gravityStrength > 1
 * compresses orbits slightly; temperature and physics both use this distance.
 */
export function effectiveOrbitAU(orbitalRadius: number, config: UniverseConfig): number {
  return orbitalRadius / Math.sqrt(config.gravityStrength);
}

/**
 * The orbit t Gyr after the star formed, AU (A3.3): today's (`orbitalRadius`, effective) once
 * the star is a white dwarf, and narrower by the mass it lost before that; for any other star, today's.
 */
export function orbitAUAt(orbitalRadius: number, config: UniverseConfig, star: Pick<Star, "mass" | "classification" | "lifespan">, tGyr: number): number {
  const today = effectiveOrbitAU(orbitalRadius, config);
  const widening = massLossWidening(star);
  return widening > 1 && tGyr < remnantFromGyr(star) ? today / widening : today;
}

// Planet masses (Earth masses). A draw u in 0–1 maps log-uniformly onto
// PLANET_MASS_DRAW.min–PLANET_MASS_DRAW.knee.mass for u below PLANET_MASS_DRAW.knee.u, which keeps
// every mass the original single log-uniform law gave up to 25 M⊕ (all solid
// planets and the lighter giants). The top tenth of draws is spread
// log-uniformly from there up to 13 Jupiter masses, where planets end and brown
// dwarfs begin (owner decision), so about one planet in twenty is heavier than
// Saturn.
export const PLANET_MASS_DRAW = {
  min: pow(10, -1.75),                          // ≈ 0.018 M⊕
  knee: { u: 0.9, mass: pow(10, 1.4) },         // ≈ 25 M⊕
  max: 4000,                                    // ≈ 13 Jupiter masses
};

/** A planet's mass in Earth masses, from a uniform draw in 0–1. */
export function planetMassFromDraw(u: number): number {
  const { min, knee, max } = PLANET_MASS_DRAW;
  if (u < knee.u) return min * pow(knee.mass / min, u / knee.u);
  return knee.mass * pow(max / knee.mass, (u - knee.u) / (1 - knee.u));
}

// Mass–radius relation of Chen & Kipping (2017, ApJ 834, 17), fitted to planets
// with measured masses and radii: rocky worlds up to about 2 M⊕, volatile-rich
// "Neptunian" worlds from there to about 0.41 Jupiter masses, and above that
// Jovian worlds whose radius barely changes with mass (owner decision). The
// three power laws meet at the breakpoints. The fit includes many hot,
// inflated exoplanets, so it puts a Saturn-mass planet about a quarter larger
// than Saturn. Radii in Earth radii.
export const MASS_RADIUS = [
  { upToMass: 2.04, coefficient: 1.008, exponent: 0.279 },    // Terran
  { upToMass: 131.6, coefficient: 0.808, exponent: 0.589 },   // Neptunian
  { upToMass: Infinity, coefficient: 17.74, exponent: -0.044 }, // Jovian
];

/** A planet's typical radius (Earth radii) for its mass (Earth masses). */
export function typicalRadiusForMass(mass: number): number {
  const law = MASS_RADIUS.find((l) => mass <= l.upToMass)!;
  return law.coefficient * pow(mass, law.exponent);
}
