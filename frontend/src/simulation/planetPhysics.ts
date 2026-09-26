// Physical properties of a planet (Worlds Up Close, phase A1).
//
// Why it exists: a surface, a climate and a history need facts a planet did
// not have: how strong its gravity is, whether one face is locked towards its
// star, how fast it spins, how tilted it is, how much water it began with and
// how active its interior is. This derives them from what the planet and its
// star already are, plus a few seeded draws.
//
// How: gravity, escape velocity, the tidal-locking distance, the orbital period
// and the snow line follow from masses, radii and distances. Rotation (when not
// locked), axial tilt and the water inventory are drawn from the planet's own
// PHYSICS stream, so they never disturb any other stream. Tectonic activity is a
// function of time, because the climate history (A2b) needs it at every step.
//
// Assumptions and limits:
// - Surface pressure is the background gas pressure set by the atmosphere
//   class (Worlds-Up-Close-Revision-1.md, R6); gases a later phase adds sit on top.
// - Tidal locking follows the despinning-time scaling (time ∝ a⁶ / M★²),
//   calibrated so Earth is free and Mercury sits near the threshold. Planet
//   mass, rigidity and resonances such as Mercury's 3:2 are ignored on purpose.
// - Water is set when the planet formed: the snow line uses the star's
//   luminosity at formation, and nothing here removes water later.
// - Giant planets get the same fields, but have no surface; later phases read
//   only gravity, escape velocity and rotation for them.
// Nothing in the simulation reads these values yet; A2 and A3 will.

import { createRNG, mixSeed, SALT } from "./rng";
import { exp, pow } from "./detmath";
import type { Planet, AtmosphereType } from "./planet";
import { effectiveOrbitAU } from "./planet";
import type { Star } from "./star";
import { luminosityAt } from "./star";
import { makeConfig } from "./config";
import type { UniverseConfig } from "./config";

export interface PlanetPhysics {
  surfaceGravity: number;       // g; Earth = 1
  escapeVelocityKms: number;    // km/s
  surfacePressureBar: number;   // background gas pressure, bar
  tidallyLocked: boolean;
  orbitalPeriodYears: number;
  rotationPeriodHours: number;  // equals the orbital period when tidally locked
  axialTiltDeg: number;         // 0–90°
  snowLineAU: number;           // where water ice could condense while the planet formed
  waterInventory: number;       // 0–1: water delivered at formation
}

const EARTH_ESCAPE_VELOCITY_KMS = 11.2;
const HOURS_PER_YEAR = 8766;

/** Background gas pressure for each atmosphere class, in bar. */
export const SURFACE_PRESSURE_BAR: Record<AtmosphereType, number> = {
  none: 0.006, thin: 0.3, moderate: 1, thick: 5, crushing: 90,
};

// a_lock = C · (t★ · M★²)^(1/6): with C = 0.31 AU, the Sun today locks inside ~0.40 AU
const TIDAL_LOCK_CONSTANT_AU = 0.31;

const ROTATION_HOURS = { min: 8, max: 60 };        // log-uniform when free to spin
const TILT = { lowShare: 0.8, lowMaxDeg: 35, maxDeg: 90 };

// Snow line: water ice condenses beyond ~2.7 AU around a Sun-like young star
const SNOW_LINE_AU_PER_SQRT_L = 2.7;
// Water inventory: median and spread (a factor, log-uniform either side), set at formation
const WATER_INSIDE_SNOW_LINE = { median: 0.08, spread: 4 };
const WATER_BEYOND_SNOW_LINE = { median: 0.5, spread: 2 };
// Below this mass a planet holds on to less of its water
const WATER_RETENTION_MASS = 0.1;

// Tectonic activity decays as the interior cools, on this timescale
const INTERIOR_COOLING_GYR = 8;

/** Orbits closer than this are tidally locked, in AU. */
export function tidalLockingDistanceAU(star: Star): number {
  return TIDAL_LOCK_CONSTANT_AU * pow(star.age * star.mass * star.mass, 1 / 6);
}

/**
 * How geologically active the planet is t Gyr after its star formed, from 0 to 1.
 * Larger planets hold their heat longer; every planet cools with time.
 */
export function tectonicActivity(planet: Planet, tGyr: number): number {
  return Math.min(1, Math.max(0, Math.sqrt(planet.mass) * exp(-tGyr / INTERIOR_COOLING_GYR)));
}

/** A value spread log-uniformly by `spread` either side of `median`, from a uniform draw u. */
function aroundMedian(median: number, spread: number, u: number): number {
  return median * pow(spread, 2 * u - 1);
}

/** The physical properties of a planet around its star. */
export function derivePhysics(planet: Planet, star: Star, galaxySeed: number, cfg?: UniverseConfig): PlanetPhysics {
  const config = cfg ?? makeConfig(galaxySeed);
  const rng = createRNG(mixSeed(galaxySeed, planet.hostStarId, planet.id, SALT.PHYSICS));
  // Every draw is taken in a fixed order, whatever the planet turns out to be
  const rotationDraw = rng();
  const tiltBandDraw = rng();
  const tiltDraw = rng();
  const waterDraw = rng();

  const orbitAU = effectiveOrbitAU(planet.orbitalRadius, config);
  const orbitalPeriodYears = Math.sqrt((orbitAU * orbitAU * orbitAU) / star.mass);
  const tidallyLocked = orbitAU < tidalLockingDistanceAU(star);
  const rotationPeriodHours = tidallyLocked
    ? orbitalPeriodYears * HOURS_PER_YEAR
    : ROTATION_HOURS.min * pow(ROTATION_HOURS.max / ROTATION_HOURS.min, rotationDraw);

  const axialTiltDeg = tiltBandDraw < TILT.lowShare
    ? tiltDraw * TILT.lowMaxDeg
    : TILT.lowMaxDeg + tiltDraw * (TILT.maxDeg - TILT.lowMaxDeg);

  const snowLineAU = SNOW_LINE_AU_PER_SQRT_L * Math.sqrt(luminosityAt(star, 0));
  const water = orbitAU < snowLineAU ? WATER_INSIDE_SNOW_LINE : WATER_BEYOND_SNOW_LINE;
  const retention = Math.min(1, planet.mass / WATER_RETENTION_MASS);
  const waterInventory = Math.min(1, aroundMedian(water.median, water.spread, waterDraw)) * retention;

  return {
    surfaceGravity: planet.mass / (planet.size * planet.size),
    escapeVelocityKms: EARTH_ESCAPE_VELOCITY_KMS * Math.sqrt(planet.mass / planet.size),
    surfacePressureBar: SURFACE_PRESSURE_BAR[planet.atmosphere],
    tidallyLocked,
    orbitalPeriodYears,
    rotationPeriodHours,
    axialTiltDeg,
    snowLineAU,
    waterInventory,
  };
}
