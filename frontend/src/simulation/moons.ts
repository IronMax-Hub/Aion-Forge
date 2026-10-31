// Regular moons of giants (Galaxy Through Time, MO2).
//
// Why it exists: giant planets build satellite systems in the disks around
// them. Those moons can be worlds in their own right: icy, warmed from below
// and by tides (MO3), some with oceans under their ice.
//
// How:
// - Mass. A satellite system holds 2 × 10⁻⁴ of its planet's mass (Jupiter's
//   Galilean ratio; decision 30, the owner's choice over Canup & Ward's 10⁻⁴),
//   split among 2–5 moons at sorted uniform draws, innermost first.
// - Orbits. The first at 5–7.5 planet radii, each next one 1.6–2.0 times
//   farther (the Galilean ratios are 1.6–2.1). No moon lies beyond half the
//   planet's Hill radius, a_p · (M_p / 3 M★)^⅓ / 2: those are not formed.
// - Radius. typicalRadiusForMass × 0.8–1.2, as for planets.
// - Water (decision 35). Moons of a giant beyond the star's snow line are ice-
//   rich: water is 10–50% of their mass (Europa ~8%, Ganymede, Callisto and
//   Titan ~40–50%), W = 340 × that share in the planets' units (Earth's water,
//   W 0.08, is 2.3 × 10⁻⁴ of its mass), with no cap. Inside the snow line they
//   take the planets' rule.
// - Spin and tilt. Regular moons orbit in their planet's equatorial plane, so
//   they share its tilt, and are locked: a day is an orbit around the planet.
// - Air. One draw from the planets' atmosphere classes; escape (AE2) decides
//   what each keeps once moons have histories (MO4).
// - Eccentricity (MO3). Log-uniform 0.001–0.01 (the Galilean moons, held in
//   resonance: 0.001–0.009), from the moon's own stream, mixSeed(galaxySeed,
//   ...bodyKey(moon), SALT.MOON). In nature resonances with neighbouring moons
//   keep it up; none are modelled, so it is a drawn stand-in for that forcing,
//   and the tidal heat it sets (interiorHeat.ts) is in effect a heat draw
//   scaled by the formula.
// Draws come from the giant's own moon stream, mixSeed(galaxySeed,
// ...bodyKey(giant), SALT.MOON), in a fixed order, so no planet's draws move.
//
// Assumptions and limits: no irregular (captured) moons; no orbital resonances
// or migration; a moon's mass does not depend on its distance from the planet.

import { createRNG, mixSeed, SALT } from "./rng";
import { bodyKey, moonKey } from "./bodyKey";
import { pow } from "./detmath";
import type { Star } from "./star";
import { companionLuminosityAt } from "./star";
import type { AtmosphereType, Planet } from "./planet";
import type { UniverseConfig } from "./config";
import { atmosphereFromDraw, effectiveOrbitAU, typicalRadiusForMass } from "./planetBasics";
import { derivePhysics, orbitedMassSolar, planetWaterInventory } from "./planetPhysics";
import { iceShellKm, interiorHeatFlow, tidalHeatFlow } from "./interiorHeat";
import { ALBEDO, equilibriumTemperatureK } from "./climate";
import { waterDepthKm } from "./geography";

/** A satellite system's share of its planet's mass (decision 30). */
export const SATELLITE_MASS_RATIO = 2e-4;
/** How many moons: min plus 0 to extra − 1. */
export const MOON_COUNT = { min: 2, extra: 4 } as const;
/** The first moon's orbit, planet radii: base × (1 + spread × u). */
export const FIRST_MOON_ORBIT = { planetRadii: 5, spread: 0.5 } as const;
/** Each next moon lies min + range × u times farther out. */
export const MOON_SPACING = { min: 1.6, range: 0.4 } as const;
/** No moon lies beyond this share of the planet's Hill radius. */
export const HILL_SHARE = 0.5;
/** A moon's orbital eccentricity, log-uniform between these (MO3). */
export const MOON_ECCENTRICITY = { min: 0.001, max: 0.01 } as const;
/** Ice-rich moons' water, as a share of their mass, and its conversion to the planets' water units (decision 35). */
export const MOON_WATER = { minShare: 0.1, maxShare: 0.5, unitsPerShare: 340 } as const;

const EARTH_RADIUS_AU = 6371 / 1.495978707e8;
export const EARTH_MASS_IN_SUNS = 3.003e-6;
const EARTH_GM_KM3_S2 = 398600.4;
const EARTH_RADIUS_KM = 6371;
const SECONDS_PER_HOUR = 3600;

/** What a moon world's physics reads of its orbit around its planet (MO4). */
export interface MoonOrbit {
  planetMass: number;         // Earth masses
  planetSize: number;         // Earth radii
  orbitPlanetRadii: number;
  orbitalPeriodHours: number;
  axialTiltDeg: number;
  waterInventory: number;
  eccentricity: number;
}

/** A regular moon of a giant. */
export interface Moon {
  hostStarId: number;
  /** Its planet's index in its system. */
  id: number;
  /** Its place among its planet's moons, innermost first. */
  moonIndex: number;
  /** Unique in the galaxy: "<starId>-<planetIndex>-m<moonIndex>". */
  key: string;
  mass: number;               // Earth masses
  size: number;               // Earth radii
  orbitPlanetRadii: number;   // distance from its planet, in its planet's radii
  /** Its orbit around its planet, and its day (it is locked), hours. */
  orbitalPeriodHours: number;
  axialTiltDeg: number;
  waterInventory: number;     // the planets' units
  formationAtmosphere: AtmosphereType;
  /** Its orbit's eccentricity, which sets its tidal heat (MO3). */
  eccentricity: number;
  resourceAbundance: number;  // 0–1
  /** Today's heat from inside and from tides, W/m² (MO4). */
  heatFlowWm2: number;
  /** Its water's depth and the ice shell over it today, km, at its airless equilibrium temperature (decision 11). */
  waterKm: number;
  shellKm: number;
  /** Its world (physics, history, life) if it is at least the smallest planet's mass (decision 11); null otherwise. */
  world: Planet | null;
}

/** Half the planet's Hill radius, in planet radii: no moon forms farther out. */
export function moonOrbitLimit(giant: Planet, star: Star, config: UniverseConfig): number {
  const hillAU = effectiveOrbitAU(giant.orbitalRadius, config) * pow((giant.mass * EARTH_MASS_IN_SUNS) / (3 * orbitedMassSolar(giant, star)), 1 / 3);
  return (HILL_SHARE * hillAU) / (giant.size * EARTH_RADIUS_AU);
}

/** A moon's own draws, from its own stream: its eccentricity (MO3), then its resources (MO4). */
function ownDraws(galaxySeed: number, hostStarId: number, planetIndex: number, moonIndex: number) {
  const rng = createRNG(mixSeed(galaxySeed, ...bodyKey({ hostStarId, id: planetIndex, moonIndex }), SALT.MOON));
  const eccentricity = MOON_ECCENTRICITY.min * pow(MOON_ECCENTRICITY.max / MOON_ECCENTRICITY.min, rng());
  return { eccentricity, resourceAbundance: rng() };
}

/** The orbit a moon world's physics reads (MO4). */
export function moonOrbitOf(moon: Moon, giant: Planet): MoonOrbit {
  return {
    planetMass: giant.mass, planetSize: giant.size, orbitPlanetRadii: moon.orbitPlanetRadii,
    orbitalPeriodHours: moon.orbitalPeriodHours, axialTiltDeg: moon.axialTiltDeg,
    waterInventory: moon.waterInventory, eccentricity: moon.eccentricity,
  };
}

/**
 * What a moon is like today without a history (decision 11): its heat from inside and from tides,
 * its water's depth, and the ice shell that heat holds up at its airless equilibrium temperature.
 */
function listedToday(
  star: Star, orbitAU: number, giant: Planet,
  moon: { mass: number; size: number; orbitPlanetRadii: number; eccentricity: number; waterInventory: number },
): { heatFlowWm2: number; waterKm: number; shellKm: number } {
  const heatFlowWm2 = interiorHeatFlow({ mass: moon.mass }, star.age) + tidalHeatFlow(moon, giant);
  const gravity = moon.mass / (moon.size * moon.size);
  const waterKm = waterDepthKm(moon.waterInventory, gravity);
  const icy = moon.waterInventory > 0;
  // Both stars' light in a binary (BS3)
  const light = star.luminosity + companionLuminosityAt(star, orbitAU, giant.orbitsBothStars === true, star.age);
  const surfaceK = equilibriumTemperatureK(light, orbitAU, icy ? ALBEDO.ice : ALBEDO.land);
  return { heatFlowWm2, waterKm, shellKm: Math.min(waterKm, iceShellKm(heatFlowWm2, surfaceK)) };
}

/** One moon of a planet, from its mass, orbit and draws: what every moon shares. */
function makeMoon(
  planet: Planet, star: Star, galaxySeed: number, orbitAU: number, axialTiltDeg: number,
  moonIndex: number, mass: number, orbit: number, sizeDraw: number, waterInventory: number, airDraw: number,
): Moon {
  const orbitKm = orbit * planet.size * EARTH_RADIUS_KM;
  const periodSeconds = 2 * Math.PI * Math.sqrt((orbitKm * orbitKm * orbitKm) / (EARTH_GM_KM3_S2 * planet.mass));
  const own = ownDraws(galaxySeed, planet.hostStarId, planet.id, moonIndex);
  const size = typicalRadiusForMass(mass) * (0.8 + sizeDraw * 0.4);
  return {
    hostStarId: planet.hostStarId,
    id: planet.id,
    moonIndex,
    key: moonKey(planet.hostStarId, planet.id, moonIndex),
    mass,
    size,
    orbitPlanetRadii: orbit,
    orbitalPeriodHours: periodSeconds / SECONDS_PER_HOUR,
    axialTiltDeg,
    waterInventory,
    formationAtmosphere: atmosphereFromDraw(airDraw),
    eccentricity: own.eccentricity,
    resourceAbundance: own.resourceAbundance,
    ...listedToday(star, orbitAU, planet, { mass, size, orbitPlanetRadii: orbit, eccentricity: own.eccentricity, waterInventory }),
    world: null,
  };
}

/** The regular moons a giant's disk builds. */
export function moonsOf(giant: Planet, star: Star, galaxySeed: number, config: UniverseConfig): Moon[] {
  const rng = createRNG(mixSeed(galaxySeed, ...bodyKey(giant), SALT.MOON));
  const count = MOON_COUNT.min + Math.floor(rng() * MOON_COUNT.extra);
  const cuts = Array.from({ length: count - 1 }, () => rng()).sort((a, b) => a - b);
  const bounds = [0, ...cuts, 1];
  const systemMass = SATELLITE_MASS_RATIO * giant.mass;

  const limit = moonOrbitLimit(giant, star, config);
  const physics = derivePhysics(giant, star, galaxySeed, config);
  const orbitAU = effectiveOrbitAU(giant.orbitalRadius, config);
  const beyondSnowLine = orbitAU >= physics.snowLineAU;

  const moons: Moon[] = [];
  let orbit = 0;
  for (let i = 0; i < count; i++) {
    // Four draws per moon, in a fixed order, whatever the moon turns out to be
    const orbitDraw = rng();
    const sizeDraw = rng();
    const waterDraw = rng();
    const airDraw = rng();
    orbit = i === 0
      ? FIRST_MOON_ORBIT.planetRadii * (1 + FIRST_MOON_ORBIT.spread * orbitDraw)
      : orbit * (MOON_SPACING.min + MOON_SPACING.range * orbitDraw);
    if (orbit > limit) continue;

    const mass = systemMass * (bounds[i + 1] - bounds[i]);
    const waterInventory = beyondSnowLine
      ? MOON_WATER.unitsPerShare * (MOON_WATER.minShare + (MOON_WATER.maxShare - MOON_WATER.minShare) * waterDraw)
      : planetWaterInventory(orbitAU, physics.snowLineAU, mass, waterDraw);
    moons.push(makeMoon(giant, star, galaxySeed, orbitAU, physics.axialTiltDeg, i, mass, orbit, sizeDraw, waterInventory, airDraw));
  }
  return moons;
}

// ── Large moons of rocky planets (MO5) ────────────────────────────────────────
//
// A rocky planet may gain one large moon from a giant impact, which is not
// simulated, so it is a roll, as the origin of life is: one chance in four
// (one of the Sun's four rocky planets has one). Its mass is a log-uniform
// share of the planet's (the Moon: 0.0123), its orbit 30–60 planet radii. It
// takes the planets' water rule (impact debris is not ice-rich). A moon of 1%
// of its planet's mass or more holds the planet's tilt steady (decision 12).
// Draws come from the planet's own moon stream, mixSeed(galaxySeed,
// ...bodyKey(planet), SALT.MOON).

/** A rocky planet's large moon: its chance, its share of the planet's mass (log-uniform) and its orbit (planet radii). */
export const LARGE_MOON = {
  chance: 0.25,
  massRatio: { min: 0.002, max: 0.03 },
  orbitPlanetRadii: { min: 30, max: 60 },
} as const;
/** A moon of at least this share of its planet's mass holds the planet's tilt steady (decision 12). */
export const TILT_HOLDING_RATIO = 0.01;

/** A rocky planet's large moon, or null: one roll, then its mass, orbit, size, water and air, in a fixed order. */
export function largeMoonOf(planet: Planet, star: Star, galaxySeed: number, config: UniverseConfig): Moon | null {
  const rng = createRNG(mixSeed(galaxySeed, ...bodyKey(planet), SALT.MOON));
  const roll = rng();
  const ratioDraw = rng();
  const orbitDraw = rng();
  const sizeDraw = rng();
  const waterDraw = rng();
  const airDraw = rng();
  if (roll >= LARGE_MOON.chance) return null;

  const { massRatio, orbitPlanetRadii } = LARGE_MOON;
  const mass = planet.mass * massRatio.min * pow(massRatio.max / massRatio.min, ratioDraw);
  const orbit = orbitPlanetRadii.min + (orbitPlanetRadii.max - orbitPlanetRadii.min) * orbitDraw;
  const physics = derivePhysics(planet, star, galaxySeed, config);
  const orbitAU = effectiveOrbitAU(planet.orbitalRadius, config);
  const waterInventory = planetWaterInventory(orbitAU, physics.snowLineAU, mass, waterDraw);
  return makeMoon(planet, star, galaxySeed, orbitAU, physics.axialTiltDeg, 0, mass, orbit, sizeDraw, waterInventory, airDraw);
}
