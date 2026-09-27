import { describe, it, expect } from "vitest";
import { generatePlanetsFor, dustSublimationAU, effectiveOrbitAU } from "../simulation/planet";
import { planetMassFromDraw, typicalRadiusForMass } from "../simulation/planetBasics";
import type { Planet } from "../simulation/planet";
import { generateStarsFor, UNIVERSE_AGE_GYR, stellarRadiusAU, luminosityAt } from "../simulation/star";
import type { Star } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";
import { boilingPointK } from "../simulation/climate";
import { FORMATION_DELAY_GYR } from "../simulation/worldHistory";

// Where planets form, which survive their star, and young oceans.

const seed = 100000;
const config = makeConfig(seed);
const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 700);
const systems = stars.map((star) => ({ star, planets: generatePlanetsFor(star, seed, config).planets }));
const all: { star: Star; planet: Planet }[] = systems.flatMap(({ star, planets }) => planets.map((planet) => ({ star, planet })));

describe("where planets form", () => {
  it("puts the Sun's dust-sublimation line at ~0.03 AU, well inside its planets", () => {
    const sun: Star = {
      id: 1, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772, luminosity: 1,
      classification: "main-sequence", isRare: false,
    };
    expect(dustSublimationAU(sun)).toBeCloseTo(0.0343 * Math.sqrt(luminosityAt(sun, 0)), 4);
    expect(dustSublimationAU(sun)).toBeLessThan(0.1);
  });

  it("forms every system beyond its young star's dust-sublimation line", () => {
    for (const { star, planets } of systems) {
      if (planets.length === 0) continue;
      const innermost = Math.min(...planets.map((p) => effectiveOrbitAU(p.orbitalRadius, config)));
      expect(innermost).toBeGreaterThanOrEqual(dustSublimationAU(star) * (1 - 1e-12));
    }
  });

  it("leaves dim stars' systems where they were drawn: innermost orbits at 0.1–0.4 AU", () => {
    const dim = systems.filter(({ star, planets }) => planets.length > 0 && dustSublimationAU(star) < 0.1 && planets[0].orbitalIndex === 0);
    expect(dim.length).toBeGreaterThan(100);
    for (const { planets } of dim) {
      expect(planets[0].orbitalRadius).toBeGreaterThanOrEqual(0.1);
      expect(planets[0].orbitalRadius).toBeLessThan(0.4);
    }
  });

  it("keeps planets out of the most extreme heat: no giant above ~4,500 K", () => {
    for (const { planet } of all) if (!planet.surface) expect(planet.temperature).toBeLessThan(4500);
  });
});

describe("engulfment", () => {
  it("leaves no planet inside its star", () => {
    for (const { star, planet } of all) expect(effectiveOrbitAU(planet.orbitalRadius, config)).toBeGreaterThan(stellarRadiusAU(star));
  });

  it("gives the Sun a radius of one solar radius, and swollen red giants an AU or so", () => {
    const sun = { ...stars[0], luminosity: 1, temperature: 5772 };
    expect(stellarRadiusAU(sun)).toBeCloseTo(0.00465, 5);
    const giants = stars.filter((s) => s.classification === "red-giant");
    expect(Math.max(...giants.map(stellarRadiusAU))).toBeGreaterThan(0.5);
  });

  it("removes engulfed planets but lets survivors keep their index, id and key", () => {
    const withGaps = systems.filter(({ planets }) => planets.some((p, i) => p.orbitalIndex !== i));
    expect(withGaps.length).toBeGreaterThan(0);
    for (const { star, planets } of systems) {
      const ids = planets.map((p) => p.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const p of planets) {
        expect(p.id).toBe(p.orbitalIndex);
        expect(p.key).toBe(`${star.id}-${p.orbitalIndex}`);
      }
      // Survivors stay in order, innermost first
      for (let i = 1; i < planets.length; i++) expect(planets[i].orbitalRadius).toBeGreaterThan(planets[i - 1].orbitalRadius);
    }
  });
});

describe("young planets", () => {
  it("have no liquid oceans above their boiling point, even before their history's first step", () => {
    const young = all.filter(({ star, planet }) => planet.surface && star.age < FORMATION_DELAY_GYR);
    expect(young.length).toBeGreaterThan(50);
    for (const { planet } of young) {
      const s = planet.surface!;
      if (s.oceanFraction > 0) expect(planet.temperature).toBeLessThan(boilingPointK(s.pressureBar));
    }
  });
});

describe("planet masses and sizes", () => {
  it("keeps the original log-uniform masses up to 25 M⊕ and stretches the top tenth to 13 Jupiter masses", () => {
    for (const u of [0, 0.1, 0.5, 0.8, 0.899]) expect(planetMassFromDraw(u)).toBeCloseTo(10 ** ((u - 0.5) * 3.5), 6);
    expect(planetMassFromDraw(0.9)).toBeCloseTo(10 ** 1.4, 6);
    expect(planetMassFromDraw(0.9999999)).toBeCloseTo(4000, 0);
    let previous = 0;
    for (let u = 0; u < 1; u += 0.001) {
      expect(planetMassFromDraw(u)).toBeGreaterThan(previous);
      previous = planetMassFromDraw(u);
    }
  });

  it("gives some planets Saturn and Jupiter masses, about one in twenty above Saturn", () => {
    const masses = all.map(({ planet }) => planet.mass);
    const aboveSaturn = masses.filter((m) => m > 95).length / masses.length;
    expect(aboveSaturn).toBeGreaterThan(0.03);
    expect(aboveSaturn).toBeLessThan(0.08);
    expect(masses.some((m) => m > 318)).toBe(true);
    for (const m of masses) expect(m).toBeLessThanOrEqual(4000);
  });

  it("sizes planets by the Chen & Kipping mass–radius relation: Earth, Neptune and Jupiter come out close to themselves", () => {
    expect(typicalRadiusForMass(1)).toBeCloseTo(1, 1);
    expect(typicalRadiusForMass(17.1)).toBeGreaterThan(3.5);   // Neptune: 3.9 R⊕
    expect(typicalRadiusForMass(17.1)).toBeLessThan(4.5);
    expect(typicalRadiusForMass(318)).toBeGreaterThan(11);     // Jupiter: 11.2 R⊕
    expect(typicalRadiusForMass(318)).toBeLessThan(15);
    // The three laws meet at their breakpoints
    for (const m of [2.04, 131.6]) expect(typicalRadiusForMass(m * 1.0001) / typicalRadiusForMass(m)).toBeCloseTo(1, 3);
  });

  it("keeps each planet within ±20% of its typical radius, so giants are several Earth radii with near-Earth gravity", () => {
    for (const { planet } of all) {
      const ratio = planet.size / typicalRadiusForMass(planet.mass);
      expect(ratio).toBeGreaterThanOrEqual(0.8);
      expect(ratio).toBeLessThanOrEqual(1.2);
    }
    for (const { planet } of all.filter(({ planet }) => planet.mass > 15)) {
      expect(planet.size).toBeGreaterThan(3);
      expect(planet.mass / planet.size ** 2).toBeLessThan(40);   // a 13-Jupiter-mass planet, the extreme
    }
  });
});
