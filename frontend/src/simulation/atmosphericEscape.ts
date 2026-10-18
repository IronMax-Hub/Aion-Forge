// Atmospheric escape (Galaxy Through Time, AE2).
//
// Why it exists: a world's air is not permanent. A young star's extreme
// ultraviolet (XUV) heats the upper atmosphere, and a world whose gravity is
// weak for the energy it receives loses its air to space. In the Solar System
// a single line, the cosmic shoreline (Zahnle & Catling 2017), separates the
// bodies with air from those without: cumulative XUV dose against the fourth
// power of escape velocity. This lets each world's history decide which side
// of that line it ends on.
//
// How:
// - Dose. X(t) = ∫ L_XUV / a² dt (star.ts, xuvFluence), counted in units of
//   Earth's own fluence to date (the model's Sun at 1 AU over 4.6 Gyr), so
//   X⊕ = 1. A world's dose before its history begins (the first 0.5 Gyr,
//   mostly the star's saturated phase) is the loop's starting value.
// - Air kept. X_crit = K · (v_esc / 11.2 km/s)⁴, K = 10 (placed between Titan
//   and Mars); r = max(0, 1 − (X / X_crit)²), the share of its air the world
//   keeps. The background gas is its formation pressure × r, and CO₂, O₂ and
//   CH₄ each lose the share the background lost in each step: escape takes the
//   whole air. A world past its shoreline (r = 0) keeps nothing, so whatever
//   its volcanoes add in a step is lost in that step.
// - Water (decision 40). Water escapes by the same drivers, as energy-limited
//   escape removing an amount, not a share: while the upper air is moist,
//   ΔW = min(W, c · ΔX · (R / R⊕) · (11.2 km/s / v_esc)⁴ · ramp), ramp =
//   min(1, (T − T_moist) / 20 K). T_moist falls with the background gas, which
//   cold-traps vapour: 340 K at 1 bar, 295 K at 0.1 bar, 255 K at 0.01 bar
//   (Wordsworth & Pierrehumbert 2014), log-linear between and held outside.
//   c is set so a fully moist Earth loses 0.29 Earth oceans per Gyr to today's
//   Sun (the energy limit at heating efficiency 0.15).
//
// What comes from the literature and what is chosen here: the shoreline's
// slope (dose ∝ v_esc⁴) is Zahnle & Catling's; the retention curve, K = 10 and
// stripping every gas alike are this plan's choices, to be measured in AE4.
//
// Assumptions and limits:
// - r is a share (decision 38): the same dose strips 90 bar as completely as
//   0.1 bar, where energy-limited escape would let thick air last longer.
// - The laboratory's gravity is not read (decision 45): escape uses the
//   planet's own escape velocity; gravity reaches it only through the orbit.
// - No absorbing radius above the surface (taken as R), and no
//   diffusion-limited regime; the ramp stands in for it.
// - Deterministic: escape draws nothing.

import { log, pow } from "./detmath";
import type { Star } from "./star";
import { SOLAR_AGE_GYR, SOLAR_TEMPERATURE_K, xuvFluence, xuvLuminosityAt } from "./star";
import { EARTH_ESCAPE_VELOCITY_KMS, WATER_INSIDE_SNOW_LINE } from "./planetPhysics";

/** The dose a world's gravity can hold out against, in Earth doses, at Earth's escape velocity. */
export const ESCAPE_K = 10;

/** The model's Sun: Earth's XUV dose is counted from it. */
export const REFERENCE_SUN: Star = {
  id: -1, position: [0, 0, 0], mass: 1, age: SOLAR_AGE_GYR, lifespan: 10, temperature: SOLAR_TEMPERATURE_K, luminosity: 1,
  classification: "main-sequence", isRare: false, metallicity: 0,
};

/** Earth's XUV fluence to date: the model's Sun at 1 AU over its age, L☉ · Gyr. One Earth dose. */
export const EARTH_XUV_FLUENCE = xuvFluence(REFERENCE_SUN, 0, SOLAR_AGE_GYR);

/** The XUV dose a world at `orbitAU` receives between t0 and t1 Gyr after its star formed, in Earth doses. */
export function xuvDose(star: Star, orbitAU: number, t0: number, t1: number): number {
  return xuvFluence(star, t0, t1) / (orbitAU * orbitAU * EARTH_XUV_FLUENCE);
}

/** The dose a world with this escape velocity can hold out against: X_crit = K · (v_esc / 11.2 km/s)⁴. */
export function criticalDose(escapeVelocityKms: number): number {
  return ESCAPE_K * pow(escapeVelocityKms / EARTH_ESCAPE_VELOCITY_KMS, 4);
}

/** The share of its air a world keeps after a dose: r = max(0, 1 − (X / X_crit)²). */
export function airRetained(dose: number, escapeVelocityKms: number): number {
  const x = dose / criticalDose(escapeVelocityKms);
  return Math.max(0, 1 - x * x);
}

// ── Water (decision 40) ──────────────────────────────────────────────────────

/** The moist-upper-air threshold against background pressure: 340 K at 1 bar, falling 42.5 K per tenfold drop. */
export const MOIST_THRESHOLD = { atOneBarK: 340, perDecadeK: 42.5, lowestBar: 0.01, lowestK: 255 } as const;
const LN10 = log(10);
/** Kelvin above the threshold at which the upper air is fully moist. */
export const MOIST_RAMP_K = 20;
/** A fully moist Earth loses this many Earth oceans per Gyr to today's Sun (energy-limited, ε = 0.15). */
export const EARTH_OCEANS_LOST_PER_GYR = 0.29;

/** The temperature above which water reaches the upper air, K, from the background pressure. */
export function moistThresholdK(backgroundBar: number): number {
  const { atOneBarK, perDecadeK, lowestBar, lowestK } = MOIST_THRESHOLD;
  if (backgroundBar <= lowestBar) return lowestK;
  if (backgroundBar >= 1) return atOneBarK;
  return atOneBarK + (perDecadeK * log(backgroundBar)) / LN10;
}

// Earth's dose rate today (Earth doses per Gyr), and c: a fully moist Earth loses EARTH_OCEANS_LOST_PER_GYR
const EARTH_DOSE_PER_GYR_TODAY = xuvLuminosityAt(REFERENCE_SUN, SOLAR_AGE_GYR) / EARTH_XUV_FLUENCE;
/** Water lost per Earth dose at Earth's radius and escape velocity, fully moist (water inventory units). */
export const WATER_LOST_PER_DOSE = (EARTH_OCEANS_LOST_PER_GYR * WATER_INSIDE_SNOW_LINE.median) / EARTH_DOSE_PER_GYR_TODAY;

/** Water a world loses in a step, in inventory units: an amount, never more than it has. */
export function waterLost(
  water: number, stepDose: number, radiusEarths: number, escapeVelocityKms: number, meanK: number, backgroundBar: number,
): number {
  const ramp = Math.min(1, Math.max(0, (meanK - moistThresholdK(backgroundBar)) / MOIST_RAMP_K));
  if (ramp === 0) return 0;
  const gravity = pow(EARTH_ESCAPE_VELOCITY_KMS / escapeVelocityKms, 4);
  return Math.min(water, WATER_LOST_PER_DOSE * stepDose * radiusEarths * gravity * ramp);
}
