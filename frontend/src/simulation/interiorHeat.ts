// Interior heat (Galaxy Through Time, IH1).
//
// Why it exists: a world is warmed from below as well as by its star. Moons
// kept liquid by tides (step 5b) and rogue planets with no star (step 5c)
// need that heat, and liquid water under ice depends on it (IH3).
//
// How: the heat flowing out through each square metre of surface follows the
// world's tectonic activity τ(t) = √M · e^(−t / 8 Gyr) (planetPhysics.ts), the
// rule that already sets its volcanism, scaled so Earth today gives its
// measured mean:
//   q(t)  = q⊕ · τ(t) / τ⊕          q⊕ = 0.087 W/m², τ⊕ = e^(−4.6 / 8) ≈ 0.563
//   T_int = (q / σ)^(1/4)           Earth: 35 K
// Full activity (τ = 1) gives about 0.155 W/m². Heat per unit area ∝ τ, and so
// is the gas the interior vents (decision 41).
//
// Ice shells (IH3): heat from below keeps water liquid under ice only below a
// shell thick enough to carry that heat to the cold surface. Ice conducts
// k = 651 / T W/(m·K) (Petrenko & Whitworth 1999), so a steady shell is
//   d = (651 W/m / q) · ln(271 K / T_surface)
// thick: 0.9 km under a 240 K surface with Earth's heat flow, 7.5 km at 100 K;
// Europa (q ≈ 0.05 W/m², 100 K) gets 13 km, within the 10–30 km estimated.
//
// Tidal heat (MO3): a moon on an eccentric orbit is flexed by its planet's tide,
//   Ė = (21/2) · (k₂/Q) · G · M_p² · R_m⁵ · n · e² / a⁶,  n = √(G M_p / a³)
// (Peale, Cassen & Reynolds 1979; Segatz et al. 1988), spread over its surface:
// q_tidal = Ė / 4π R_m². k₂/Q = 0.015, Io's (Lainey et al. 2009), for every moon
// (decision 34): Io gets 2.2 W/m² (measured about 2.5); Europa 0.2 W/m², four
// times its likely value, as Io's k₂/Q describes a hot, partly molten body.
// The heat is constant over a moon's life: orbits do not evolve. No ceiling
// where a moon would melt (decision 29, counted in MO7).
//
// Assumptions and limits: one cooling law for every world, whatever its make-up;
// no tidal heat yet (MO3 adds it); τ is capped at 1, so the heaviest young
// worlds give no more than 0.155 W/m². Shells conduct only (no convection),
// with Petrenko & Whitworth's conductivity; Klinger (1980) gives 567 / T, which
// makes every shell 13% thinner. Deterministic: it draws nothing.

import { log, pow } from "./detmath";
import type { Planet } from "./planet";
import { tectonicActivity } from "./planetPhysics";
import { SOLAR_AGE_GYR } from "./star";

/** Earth's mean surface heat flow, W/m². */
export const EARTH_HEAT_FLOW_W_M2 = 0.087;
/** The Stefan–Boltzmann constant, W/m²/K⁴. */
export const STEFAN_BOLTZMANN = 5.670374419e-8;

// Earth's tectonic activity today in the model: one Earth mass, 4.6 Gyr after its star formed
const EARTH_ACTIVITY_TODAY = tectonicActivity({ mass: 1 }, SOLAR_AGE_GYR);

/** The heat flowing out of a world's interior t Gyr after its star formed, W/m²; for a moon world, its tides' heat too (MO4). */
export function interiorHeatFlow(planet: Pick<Planet, "mass"> & Partial<Pick<Planet, "size" | "moonOrbit">>, tGyr: number): number {
  return (EARTH_HEAT_FLOW_W_M2 * tectonicActivity(planet, tGyr)) / EARTH_ACTIVITY_TODAY + tidalHeatOf(planet);
}

/** A moon world's tidal heat, W/m²; 0 for a planet. */
function tidalHeatOf(planet: Partial<Pick<Planet, "size" | "moonOrbit">>): number {
  const moon = planet.moonOrbit;
  if (!moon || planet.size === undefined) return 0;
  return tidalHeatFlow({ size: planet.size, orbitPlanetRadii: moon.orbitPlanetRadii, eccentricity: moon.eccentricity },
    { mass: moon.planetMass, size: moon.planetSize });
}

/**
 * How active a world's interior is, 0–1: its tectonic activity, and for a moon world the share of
 * full activity its tides add (τ_eff = min(1, (q_int + q_tidal) / q_full), MO3): tidal heat drives
 * volcanism and vent energy too. A planet's is its tectonic activity exactly.
 */
export function interiorActivity(planet: Pick<Planet, "mass"> & Partial<Pick<Planet, "size" | "moonOrbit">>, tGyr: number): number {
  const tau = tectonicActivity(planet, tGyr);
  if (!planet.moonOrbit) return tau;
  return Math.min(1, tau + tidalHeatOf(planet) * EARTH_ACTIVITY_TODAY / EARTH_HEAT_FLOW_W_M2);
}

/** Tidal dissipation k₂/Q, Io's (Lainey et al. 2009), for every moon (decision 34). */
export const TIDAL_K2_OVER_Q = 0.015;
/** The gravitational constant, m³/(kg·s²). */
export const GRAVITATIONAL_CONSTANT = 6.674e-11;
const EARTH_MASS_KG = 5.972e24;
const EARTH_RADIUS_M = 6.371e6;

/** What a moon's tidal heat reads of the moon: its radius and its orbit. */
export interface TidalBody {
  size: number;               // Earth radii
  orbitPlanetRadii: number;
  eccentricity: number;
}

/** The heat a planet's tides raise in a moon, per square metre of its surface, W/m² (MO3). */
export function tidalHeatFlow(moon: TidalBody, planet: { mass: number; size: number }): number {
  const planetKg = planet.mass * EARTH_MASS_KG;
  const moonRadius = moon.size * EARTH_RADIUS_M;
  const a = moon.orbitPlanetRadii * planet.size * EARTH_RADIUS_M;
  const n = Math.sqrt((GRAVITATIONAL_CONSTANT * planetKg) / (a * a * a));
  const a6 = a * a * a * a * a * a;
  const watts = 10.5 * TIDAL_K2_OVER_Q * GRAVITATIONAL_CONSTANT * planetKg * planetKg * pow(moonRadius, 5)
    * n * moon.eccentricity * moon.eccentricity / a6;
  return watts / (4 * Math.PI * moonRadius * moonRadius);
}

/** Ice's conductivity is this over its temperature, W/(m·K) (Petrenko & Whitworth 1999). */
export const ICE_CONDUCTIVITY_W_PER_M = 651;
/** The base of an ice shell: seawater's freezing point, K. */
export const ICE_SHELL_BASE_K = 271;

/** The thickness of ice that carries a heat flow from liquid water below to a frozen surface, km; 0 at or above 271 K. */
export function iceShellKm(heatFlowWm2: number, surfaceK: number): number {
  if (surfaceK >= ICE_SHELL_BASE_K) return 0;
  return (ICE_CONDUCTIVITY_W_PER_M / heatFlowWm2) * log(ICE_SHELL_BASE_K / surfaceK) / 1000;
}

/** The heat flow a surface radiating at this temperature carries, W/m²: σ T⁴. */
export function heatFlowAt(interiorK: number): number {
  return STEFAN_BOLTZMANN * interiorK * interiorK * interiorK * interiorK;
}

/** The temperature a surface radiating only this heat flow would have, K: (q / σ)^(1/4). */
export function interiorTemperatureK(heatFlowWm2: number): number {
  return pow(heatFlowWm2 / STEFAN_BOLTZMANN, 0.25);
}
