import { describe, it, expect } from "vitest";
import { HILL_SHARE, MOON_COUNT, MOON_WATER, moonOrbitLimit, moonsOf, SATELLITE_MASS_RATIO } from "../simulation/moons";
import { generatePlanetsFor, GIANT_PLANET_MASS } from "../simulation/planet";
import type { Planet } from "../simulation/planet";
import { derivePhysics } from "../simulation/planetPhysics";
import { makeConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";

const seed = 100000;
const config = makeConfig(seed);
const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 300);
const giants = stars.flatMap((star) => generatePlanetsFor(star, seed, config).planets
  .filter((p) => p.mass > GIANT_PLANET_MASS).map((planet) => ({ planet, star })));

const sun: Star = {
  id: 1, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772, luminosity: 1,
  classification: "main-sequence", isRare: false, metallicity: 0,
};
const jupiter: Planet = {
  id: 4, key: "1-4", hostStarId: 1, orbitalRadius: 5.2, orbitalIndex: 4, type: "gas-giant", size: 11.2, mass: 317.8,
  temperature: 110, atmosphere: "crushing", formationAtmosphere: "crushing", resourceAbundance: 0.5, habitabilityScore: 0,
  isRare: false, surface: null, life: null, worldEvents: [], everLiquidWater: false, moons: [],
};

describe("regular moons of giants (MO2)", () => {
  it("give every giant its moons, and solid planets none yet", () => {
    expect(giants.length).toBeGreaterThan(50);
    for (const { planet } of giants) expect(planet.moons).toEqual(moonsOf(planet, stars.find((s) => s.id === planet.hostStarId)!, seed, config));
    for (const star of stars.slice(0, 50)) {
      for (const p of generatePlanetsFor(star, seed, config).planets) if (p.mass <= GIANT_PLANET_MASS) expect(p.moons).toEqual([]);
    }
  });

  it("share exactly the satellite system's mass when every moon fits", () => {
    const moons = moonsOf(jupiter, sun, seed, config);
    expect(moons.length).toBeGreaterThanOrEqual(MOON_COUNT.min);
    expect(moons.length).toBeLessThan(MOON_COUNT.min + MOON_COUNT.extra);
    const total = moons.reduce((sum, m) => sum + m.mass, 0);
    expect(total / (SATELLITE_MASS_RATIO * jupiter.mass)).toBeCloseTo(1, 12);
    // Jupiter's room: half its Hill radius is about 370 of its radii
    expect(moonOrbitLimit(jupiter, sun, config)).toBeGreaterThan(300);
  });

  it("orbit inside half the planet's Hill radius, innermost first, with Kepler's periods", () => {
    for (const { planet, star } of giants) {
      const limit = moonOrbitLimit(planet, star, config);
      expect(HILL_SHARE).toBe(0.5);
      planet.moons.forEach((m, i) => {
        expect(m.orbitPlanetRadii).toBeLessThanOrEqual(limit);
        expect(m.moonIndex).toBe(i);
        if (i > 0) {
          const prev = planet.moons[i - 1];
          expect(m.orbitPlanetRadii).toBeGreaterThan(prev.orbitPlanetRadii);
          expect(m.orbitalPeriodHours / prev.orbitalPeriodHours).toBeCloseTo((m.orbitPlanetRadii / prev.orbitPlanetRadii) ** 1.5, 9);
        }
      });
    }
  });

  it("gives an Io-like orbit Io's period", () => {
    // Io: 5.9 Jupiter radii, 42.5 hours. Scale the first moon's period to that distance
    const first = moonsOf(jupiter, sun, seed, config)[0];
    expect(first.orbitalPeriodHours * (5.9 / first.orbitPlanetRadii) ** 1.5).toBeCloseTo(42.5, 0);
  });

  it("makes moons beyond the snow line ice-rich, and keeps the planet's tilt", () => {
    for (const m of moonsOf(jupiter, sun, seed, config)) {
      expect(m.waterInventory).toBeGreaterThanOrEqual(MOON_WATER.unitsPerShare * MOON_WATER.minShare);
      expect(m.waterInventory).toBeLessThanOrEqual(MOON_WATER.unitsPerShare * MOON_WATER.maxShare);
      expect(m.axialTiltDeg).toBe(derivePhysics(jupiter, sun, seed, config).axialTiltDeg);
    }
    const hotJupiter = { ...jupiter, orbitalRadius: 0.05 };
    for (const m of moonsOf(hotJupiter, sun, seed, config)) expect(m.waterInventory).toBeLessThanOrEqual(1);
  });

  it("gives every moon a unique key, the same every time", () => {
    const keys = giants.flatMap(({ planet }) => planet.moons.map((m) => m.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(moonsOf(jupiter, sun, seed, config)).toEqual(moonsOf(jupiter, sun, seed, config));
  });
});
