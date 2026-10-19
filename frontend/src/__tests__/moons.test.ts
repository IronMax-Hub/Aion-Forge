import { describe, it, expect } from "vitest";
import { HILL_SHARE, LARGE_MOON, MOON_COUNT, MOON_ECCENTRICITY, MOON_WATER, TILT_HOLDING_RATIO, moonOrbitLimit, moonsOf, SATELLITE_MASS_RATIO } from "../simulation/moons";
import { generatePlanetsFor, GIANT_PLANET_MASS, solidWorldOf } from "../simulation/planet";
import { PLANET_MASS_DRAW } from "../simulation/planetBasics";
import { buildGeography } from "../simulation/geography";
import { surveyLife } from "../simulation/lifeSurvey";
import { generateBiosphere } from "../simulation/biosphere";
import { WORLD_KIND } from "../simulation/universeIndex";
import type { Planet } from "../simulation/planet";
import { derivePhysics } from "../simulation/planetPhysics";
import { tidalHeatFlow } from "../simulation/interiorHeat";
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
  it("give every giant its moons, and solid planets at most one large moon (MO5)", () => {
    expect(giants.length).toBeGreaterThan(50);
    // A system's moons are moonsOf's, with the worlds of the large ones added (MO4)
    const withoutWorlds = (moons: Planet["moons"]) => moons.map((m) => ({ ...m, world: null }));
    for (const { planet } of giants) expect(withoutWorlds(planet.moons)).toEqual(moonsOf(planet, stars.find((s) => s.id === planet.hostStarId)!, seed, config));
    for (const star of stars.slice(0, 50)) {
      for (const p of generatePlanetsFor(star, seed, config).planets) if (p.mass <= GIANT_PLANET_MASS) expect(p.moons.length).toBeLessThanOrEqual(1);
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

describe("tidal heat (MO3)", () => {
  const JUPITER = { mass: 317.8, size: 11.21 };
  // Io and Europa, in Earth units: radius 0.2859 and 0.2450 R⊕, at 5.90 and 9.39 Jupiter radii
  const io = { size: 0.2859, orbitPlanetRadii: 5.90, eccentricity: 0.0041 };
  const europa = { size: 0.2450, orbitPlanetRadii: 9.39, eccentricity: 0.009 };

  it("gives Io and Europa the plan's references", () => {
    expect(tidalHeatFlow(io, JUPITER)).toBeCloseTo(2.2, 1);     // measured about 2.5
    expect(tidalHeatFlow(europa, JUPITER)).toBeCloseTo(0.2, 1); // four times its likely 0.05 (decision 34)
  });

  it("rises with planet mass (as M^2.5), moon radius and eccentricity, and falls with distance (as a^-7.5)", () => {
    const q = tidalHeatFlow(io, JUPITER);
    expect(tidalHeatFlow(io, { ...JUPITER, mass: JUPITER.mass * 2 }) / q).toBeCloseTo(2 ** 2.5, 9);
    expect(tidalHeatFlow({ ...io, eccentricity: io.eccentricity * 2 }, JUPITER) / q).toBeCloseTo(4, 9);
    expect(tidalHeatFlow({ ...io, size: io.size * 2 }, JUPITER) / q).toBeCloseTo(8, 9);
    expect(tidalHeatFlow({ ...io, orbitPlanetRadii: io.orbitPlanetRadii * 2 }, JUPITER) / q).toBeCloseTo(2 ** -7.5, 9);
  });

  it("draws each moon's eccentricity from its own stream, within the Galilean range", () => {
    for (const { planet } of giants) {
      for (const m of planet.moons) {
        expect(m.eccentricity).toBeGreaterThanOrEqual(MOON_ECCENTRICITY.min);
        expect(m.eccentricity).toBeLessThanOrEqual(MOON_ECCENTRICITY.max);
      }
    }
  });
});

describe("moons as worlds (MO4)", () => {
  // An icy Ganymede-mass moon of a Jupiter at 5.2 AU, with 20 km of water
  const ganymede = (orbitPlanetRadii: number, eccentricity: number): Planet => ({
    ...jupiter, key: "1-4-m2", type: "rocky", size: 0.41, mass: 0.025, atmosphere: "none", formationAtmosphere: "none",
    moons: [], moonIndex: 2,
    moonOrbit: {
      planetMass: jupiter.mass, planetSize: jupiter.size, orbitPlanetRadii, orbitalPeriodHours: 170, axialTiltDeg: 3,
      waterInventory: 20 / (33.75 * (0.025 / (0.41 * 0.41))), eccentricity,
    },
  });

  it("keeps liquid under its ice only with enough tidal heat", () => {
    const warm = solidWorldOf(ganymede(10, 0.01), sun, seed, config);
    const cold = solidWorldOf(ganymede(10, 1e-5), sun, seed, config);
    expect(warm.history.present.liquidUnderIceFraction).toBeGreaterThan(0);
    expect(cold.history.present.liquidUnderIceFraction).toBe(0);
  });

  it("is locked to its planet, shares its tilt and keeps its moon water", () => {
    const moon = ganymede(10, 0.01);
    const physics = derivePhysics(moon, sun, seed, config);
    expect(physics.tidallyLocked).toBe(false);
    expect(physics.rotationPeriodHours).toBe(170);
    expect(physics.axialTiltDeg).toBe(3);
    expect(physics.waterInventory).toBe(moon.moonOrbit!.waterInventory);
  });

  it("draws from its own streams, not its planet's, the same every time", () => {
    const moon = ganymede(10, 0.01);
    expect(solidWorldOf(moon, sun, seed, config).history).toEqual(solidWorldOf(moon, sun, seed, config).history);
    // The same body keyed as its planet would draw a different surface
    const asPlanet = { ...moon, moonIndex: undefined };
    expect(buildGeography(moon, derivePhysics(moon, sun, seed, config), seed).elevationKm)
      .not.toEqual(buildGeography(asPlanet, derivePhysics(moon, sun, seed, config), seed).elevationKm);
  });

  it("gives moons of at least the smallest planet's mass a world, and lists the rest with heat, water and shell", () => {
    let worlds = 0;
    for (const { planet } of giants) {
      for (const m of planet.moons) {
        expect(m.world !== null).toBe(m.mass >= PLANET_MASS_DRAW.min);
        expect(m.heatFlowWm2).toBeGreaterThan(0);
        expect(m.shellKm).toBeLessThanOrEqual(m.waterKm);
        if (m.world) {
          worlds++;
          expect(m.world.key).toBe(m.key);
          expect(m.world.surface).not.toBeNull();
        }
      }
    }
    expect(worlds).toBeGreaterThan(10);
  });

  it("counts living moons apart from planets, and their civilizations with the planets' (decision 13)", () => {
    const survey = surveyLife(stars, seed, config);
    let living = 0;
    for (const star of stars) {
      for (const p of generatePlanetsFor(star, seed, config).planets) {
        for (const m of p.moons) if (m.world?.life && generateBiosphere(m.world, star).hasLife) living++;
      }
    }
    expect(survey.lifeBearingMoons).toBe(living);
  });
});

describe("large moons of rocky planets (MO5)", () => {
  const rocky = stars.flatMap((star) => generatePlanetsFor(star, seed, config).planets
    .filter((p) => p.mass <= GIANT_PLANET_MASS).map((planet) => ({ planet, star })));

  it("come to about one rocky planet in four, within the drawn ranges", () => {
    const withMoon = rocky.filter(({ planet }) => planet.moons.length > 0);
    expect(withMoon.length / rocky.length).toBeGreaterThan(0.18);
    expect(withMoon.length / rocky.length).toBeLessThan(0.32);
    for (const { planet } of withMoon) {
      const [moon] = planet.moons;
      expect(planet.moons).toHaveLength(1);
      expect(moon.mass / planet.mass).toBeGreaterThanOrEqual(LARGE_MOON.massRatio.min * (1 - 1e-12));
      expect(moon.mass / planet.mass).toBeLessThanOrEqual(LARGE_MOON.massRatio.max * (1 + 1e-12));
      expect(moon.orbitPlanetRadii).toBeGreaterThanOrEqual(LARGE_MOON.orbitPlanetRadii.min);
      expect(moon.orbitPlanetRadii).toBeLessThanOrEqual(LARGE_MOON.orbitPlanetRadii.max);
      expect(moon.world !== null).toBe(moon.mass >= PLANET_MASS_DRAW.min);
    }
  });

  it("free a planet's tilt only without a holding moon, and only among siblings", () => {
    for (const { planet, star } of rocky) {
      const siblings = generatePlanetsFor(star, seed, config).planets.length > 1;
      const holds = planet.moons.some((m) => m.mass / planet.mass >= TILT_HOLDING_RATIO);
      expect(planet.tiltFree).toBe(siblings && !holds);
    }
  });
});

describe("moons in the survey's index (MO7)", () => {
  it("gives every moon world a row of its own kind, pointing at its planet, apart from the planets' index", () => {
    const survey = surveyLife(stars.slice(0, 150), seed, config);
    const expected = stars.slice(0, 150).flatMap((star) => generatePlanetsFor(star, seed, config).planets.flatMap((p) =>
      p.moons.flatMap((m) => (m.world ? [{ starId: star.id, parent: p.id, moon: m.moonIndex, mass: m.world.mass }] : []))));
    expect(expected.length).toBeGreaterThan(0);
    const ix = survey.moonIndex;
    expect(ix.count).toBe(expected.length);
    expected.forEach((e, i) => {
      expect(ix.kind[i]).toBe(WORLD_KIND.MOON);
      expect(ix.starId[i]).toBe(e.starId);
      expect(ix.parentIndex[i]).toBe(e.parent);
      expect(ix.planetIndex[i]).toBe(e.moon);
      expect(ix.massEarths[i]).toBeCloseTo(e.mass, 6);
    });
    for (let i = 0; i < survey.index.count; i++) expect(survey.index.kind[i]).toBe(WORLD_KIND.PLANET);
  });
});
