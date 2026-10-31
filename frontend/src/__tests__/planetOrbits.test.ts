import { describe, expect, it } from "vitest";
import { makeConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { EARTH_MASS_IN_SUNS, HILL_SHARE, moonOrbitLimit } from "../simulation/moons";
import { effectiveOrbitAU, generatePlanetsFor } from "../simulation/planet";
import { derivePhysics } from "../simulation/planetPhysics";
import { generateStarsFor } from "../simulation/star";
import type { Star } from "../simulation/star";

// Planets' and moons' orbits against Kepler and Hill (Phase 3, A3).

const EARTH_RADIUS_AU = 6371 / 1.495978707e8;

// Binaries of three galaxies; generating every planet of whole galaxies would take minutes
const SEEDS = [100000, 42, 7777];
const BINARIES_PER_SEED = 150;
const systems = SEEDS.flatMap((seed) => {
  const config = makeConfig(seed);
  return generateStarsFor(buildGalaxyConfig(seed, config), undefined, config).stars
    .filter((star) => star.companion !== null).slice(0, BINARIES_PER_SEED)
    .map((star) => ({ seed, config, star, planets: generatePlanetsFor(star, seed, config).planets }));
});

describe("planets that orbit both stars (A3.1)", () => {
  const aroundBoth = systems.flatMap(({ seed, config, star, planets }) =>
    planets.filter((p) => p.orbitsBothStars).map((planet) => ({ seed, config, star, planet })));
  const pairMass = (star: Star) => star.mass + star.companion!.mass;

  it("go round the pair's whole mass, by Kepler's law, in equal and unequal pairs", () => {
    expect(aroundBoth.length).toBeGreaterThan(20);
    const ratios = aroundBoth.map(({ star }) => star.companion!.mass / star.mass);
    expect(Math.min(...ratios)).toBeLessThan(0.5);
    expect(Math.max(...ratios)).toBeGreaterThan(0.8);
    for (const { seed, config, star, planet } of aroundBoth) {
      const a = effectiveOrbitAU(planet.orbitalRadius, config);
      const { orbitalPeriodYears } = derivePhysics(planet, star, seed, config);
      expect(orbitalPeriodYears).toBeCloseTo(Math.sqrt(a ** 3 / pairMass(star)), 12);
    }
  });

  it("hold their moons within the Hill sphere the pair's mass allows", () => {
    const giants = aroundBoth.filter(({ planet }) => planet.surface === null);
    expect(giants.length).toBeGreaterThan(3);
    for (const { config, star, planet } of giants) {
      const hillAU = effectiveOrbitAU(planet.orbitalRadius, config) * ((planet.mass * EARTH_MASS_IN_SUNS) / (3 * pairMass(star))) ** (1 / 3);
      expect(moonOrbitLimit(planet, star, config)).toBeCloseTo((HILL_SHARE * hillAU) / (planet.size * EARTH_RADIUS_AU), 9);
      for (const moon of planet.moons) expect(moon.orbitPlanetRadii).toBeLessThanOrEqual(moonOrbitLimit(planet, star, config));
    }
  });
});
