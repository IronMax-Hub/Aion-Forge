import { describe, expect, it } from "vitest";
import { makeConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { EARTH_MASS_IN_SUNS, HILL_SHARE, moonOrbitLimit } from "../simulation/moons";
import { effectiveOrbitAU, generatePlanetsFor, solidWorldOf } from "../simulation/planet";
import { ENVELOPE_FROM_EARTH_RADII, GIANT_PLANET_MASS, orbitAUAt } from "../simulation/planetBasics";
import { runWorldHistory } from "../simulation/worldHistory";
import { derivePhysics } from "../simulation/planetPhysics";
import { generateStarsFor, massLossWidening, massTodaySolar, remnantFromGyr } from "../simulation/star";
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
  const pairMass = (star: Star) => massTodaySolar(star) + star.companion!.mass;

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

describe("moons within their planets' reach (A3.2)", () => {
  const seed = 42;
  const config = makeConfig(seed);
  const hosts = generateStarsFor(buildGalaxyConfig(seed, config), undefined, config).stars.slice(0, 250);
  const planets = hosts.flatMap((star) => generatePlanetsFor(star, seed, config).planets.map((planet) => ({ star, planet })));

  it("keeps every moon, a rocky planet's large one too, within half its planet's Hill radius", () => {
    const withMoons = planets.filter(({ planet }) => planet.moons.length > 0);
    expect(withMoons.filter(({ planet }) => planet.surface !== null).length).toBeGreaterThan(10);
    for (const { star, planet } of withMoons) {
      for (const moon of planet.moons) expect(moon.orbitPlanetRadii).toBeLessThanOrEqual(moonOrbitLimit(planet, star, config));
    }
  });

  it("leaves planets close to small stars without a large moon, as their Hill spheres cannot hold one", () => {
    const cramped = planets.filter(({ star, planet }) => planet.surface !== null && moonOrbitLimit(planet, star, config) < 30);
    expect(cramped.length).toBeGreaterThan(20);
    for (const { planet } of cramped) expect(planet.moons).toEqual([]);
  });
});

describe("planets of white dwarfs (A3.3)", () => {
  const seed = 42;
  const config = makeConfig(seed);
  const dwarfs = generateStarsFor(buildGalaxyConfig(seed, config), undefined, config).stars
    .filter((star) => star.classification === "white-dwarf").slice(0, 60);
  const systems = dwarfs.map((star) => ({ star, planets: generatePlanetsFor(star, seed, config).planets })).filter((s) => s.planets.length > 0);

  it("weighs a white dwarf by the initial–final mass relation, and widens its planets' orbits by what it lost", () => {
    expect(systems.length).toBeGreaterThan(10);
    for (const { star, planets } of systems) {
      const remnant = massTodaySolar(star);
      expect(remnant).toBeCloseTo(Math.min(1.38, 0.109 * star.mass + 0.394), 12);
      expect(massLossWidening(star)).toBeGreaterThan(1.5);
      for (const planet of planets) {
        const today = effectiveOrbitAU(planet.orbitalRadius, config);
        expect(orbitAUAt(planet.orbitalRadius, config, star, 0) * massLossWidening(star)).toBeCloseTo(today, 12);
        expect(orbitAUAt(planet.orbitalRadius, config, star, star.age)).toBe(today);
        // Kepler today: round the remnant, on the widened orbit
        if (!planet.orbitsBothStars) {
          expect(derivePhysics(planet, star, seed, config).orbitalPeriodYears).toBeCloseTo(Math.sqrt(today ** 3 / remnant), 12);
        }
      }
    }
  });

  it("gives a white dwarf's planet its closer orbit in its history until the star became a remnant", () => {
    const { star, planet } = systems.flatMap((s) => s.planets.filter((p) => p.surface !== null).map((p) => ({ star: s.star, planet: p })))[0];
    const world = solidWorldOf(planet, star, seed, config);
    const h = runWorldHistory(planet, world.physics, world.geography, star, seed, config, { keepSnapshots: true });
    const today = effectiveOrbitAU(planet.orbitalRadius, config);
    for (const s of h.snapshots!) {
      expect(s.orbitAU).toBeCloseTo(s.tGyr < remnantFromGyr(star) ? today / massLossWidening(star) : today, 12);
    }
    expect(h.snapshots!.some((s) => s.tGyr < remnantFromGyr(star))).toBe(true);
    expect(h.snapshots!.some((s) => s.tGyr >= remnantFromGyr(star))).toBe(true);
  });
});

describe("sub-Neptunes (A3.4)", () => {
  const seed = 42;
  const config = makeConfig(seed);
  const planets = generateStarsFor(buildGalaxyConfig(seed, config), undefined, config).stars
    .filter((star) => star.classification === "main-sequence").slice(0, 150)
    .flatMap((star) => generatePlanetsFor(star, seed, config).planets);

  it("wrap every planet above the radius valley in an envelope: no surface, no geography, no life", () => {
    const enveloped = planets.filter((p) => p.size >= ENVELOPE_FROM_EARTH_RADII);
    expect(enveloped.filter((p) => p.type === "sub-neptune").length).toBeGreaterThan(20);
    for (const p of enveloped) {
      expect(p.surface).toBeNull();
      expect(p.life).toBeNull();
      expect(p.type === "sub-neptune").toBe(p.mass <= GIANT_PLANET_MASS);
      expect(p.atmosphere).toBe("crushing");
    }
    for (const p of planets.filter((x) => x.surface !== null)) expect(p.size).toBeLessThan(ENVELOPE_FROM_EARTH_RADII);
  });

  it("leaves no solid planet of an Earth's mass or more lighter than rock, 3 g/cm³", () => {
    const solids = planets.filter((p) => p.surface !== null && p.mass >= 1);
    expect(solids.length).toBeGreaterThan(50);
    for (const p of solids) expect((5.51 * p.mass) / p.size ** 3).toBeGreaterThan(3);
  });
});
