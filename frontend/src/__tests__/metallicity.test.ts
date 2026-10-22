import { describe, it, expect } from "vitest";
import { ENRICHMENT, feH, gasMetallicity, METALLICITY_FLOOR } from "../simulation/metallicity";
import type { GalaxyType } from "../simulation/galaxy";
import { generateStarsFor, METALLICITY_SCATTER_DEX, UNIVERSE_AGE_GYR } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";
import { generatePlanetsFor, planetMassFor } from "../simulation/planet";
import { PLANET_MASS_DRAW, planetMassFromDraw } from "../simulation/planetBasics";

const TYPES: GalaxyType[] = ["spiral", "elliptical", "irregular"];
// The default galaxy's scale is shown as 50,000 light-years (ui/format.ts): 15.3 kpc
const SCALE_KPC = 50_000 / 3261.56;

describe("the galaxy's enrichment (MZ1)", () => {
  it("makes the gas where and when the Sun formed solar", () => {
    expect(feH(gasMetallicity("spiral", 0.52, 9.1))).toBeCloseTo(0, 2);
  });

  it("enriches a spiral's gas at the Sun's distance as the plan's checks give", () => {
    const at = (t: number) => feH(gasMetallicity("spiral", 0.52, t));
    expect(at(1)).toBeCloseTo(-0.8, 1);
    expect(at(3)).toBeCloseTo(-0.4, 1);
    expect(at(6)).toBeCloseTo(-0.1, 1);
    expect(at(UNIVERSE_AGE_GYR)).toBeCloseTo(0.1, 1);
  });

  it("gives a spiral today a gradient near the Milky Way's (about −0.05 dex per kpc)", () => {
    const gradient = (feH(gasMetallicity("spiral", 0.6, UNIVERSE_AGE_GYR)) - feH(gasMetallicity("spiral", 0.4, UNIVERSE_AGE_GYR)))
      / (0.2 * SCALE_KPC);
    expect(gradient).toBeCloseTo(-0.05, 2);
  });

  it("makes an elliptical's old stars metal-rich and an irregular level off near −0.3", () => {
    expect(feH(gasMetallicity("elliptical", 0.34, 1))).toBeGreaterThan(0);
    expect(feH(gasMetallicity("irregular", 0, 100))).toBeCloseTo(-0.3, 1);
    expect(feH(gasMetallicity("irregular", 0.52, UNIVERSE_AGE_GYR))).toBeLessThan(-0.3);
  });

  it("rises with time, falls with distance, and stays between its floor and its ceiling", () => {
    for (const type of TYPES) {
      const ceiling = METALLICITY_FLOOR + ENRICHMENT[type].yieldZ;
      expect(gasMetallicity(type, 0.5, 0)).toBe(METALLICITY_FLOOR);
      for (let r = 0; r <= 1.5; r += 0.1) {
        let previous = 0;
        for (let t = 0; t <= 20; t += 0.5) {
          const z = gasMetallicity(type, r, t);
          expect(z).toBeGreaterThanOrEqual(previous);
          expect(z).toBeGreaterThanOrEqual(METALLICITY_FLOOR);
          expect(z).toBeLessThanOrEqual(ceiling);
          expect(gasMetallicity(type, r + 0.1, t)).toBeLessThanOrEqual(z);
          previous = z;
        }
      }
    }
  });
});

describe("each star's metallicity (MZ2)", () => {
  const universe = (seed: number) => {
    const config = makeConfig(seed);
    const galaxy = buildGalaxyConfig(seed, config);
    return { galaxy, stars: generateStarsFor(galaxy, UNIVERSE_AGE_GYR, config).stars };
  };
  const gasOf = (galaxy: ReturnType<typeof buildGalaxyConfig>, star: { position: [number, number, number]; age: number }) => {
    const [x, , z] = star.position;
    return feH(gasMetallicity(galaxy.type, Math.sqrt(x * x + z * z) / galaxy.scale, UNIVERSE_AGE_GYR - star.age));
  };

  it("scatters about the gas it formed from by 0.1 dex", () => {
    const { galaxy, stars } = universe(100000);
    const residuals = stars.map((s) => s.metallicity - gasOf(galaxy, s));
    const mean = residuals.reduce((a, b) => a + b, 0) / residuals.length;
    const sd = Math.sqrt(residuals.reduce((a, b) => a + (b - mean) ** 2, 0) / residuals.length);
    expect(Math.abs(mean)).toBeLessThan(0.01);
    expect(sd).toBeCloseTo(METALLICITY_SCATTER_DEX, 2);
  });

  it("is the same every time", () => {
    expect(universe(42).stars.map((s) => s.metallicity)).toEqual(universe(42).stars.map((s) => s.metallicity));
  });

  it("makes old stars poorer in metals than young ones", () => {
    const { stars } = universe(100000);
    const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
    const old = stars.filter((s) => s.age > 10).map((s) => s.metallicity);
    const young = stars.filter((s) => s.age < 2).map((s) => s.metallicity);
    expect(old.length).toBeGreaterThan(20);
    expect(median(old)).toBeLessThan(median(young) - 0.2);
  });
});

describe("planets from the disk's solids (MZ3)", () => {
  const seed = 100000;
  const config = makeConfig(seed);
  const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars
    .filter((s) => s.classification === "main-sequence").slice(0, 120);
  const at = (star: (typeof stars)[number], metallicity: number) => generatePlanetsFor({ ...star, metallicity }, seed, config);

  it("makes a metal-poor star's planets no heavier than the same draws at solar metallicity", () => {
    for (const star of stars) {
      const solarSystem = at(star, 0);
      const solar = new Map(solarSystem.planets.map((p) => [p.orbitalIndex, p]));
      for (const planet of at(star, -1).planets) {
        const twin = solar.get(planet.orbitalIndex);
        // At solar metallicity the heavier planets may throw a neighbour out (RP1); lighter ones stay
        if (!twin) {
          expect(solarSystem.ejected).toBeGreaterThan(0);
          continue;
        }
        expect(planet.mass).toBeCloseTo(twin.mass / 10, 9);
        // Every draw stays in place whatever the masses: the same orbit and resources
        expect(planet.orbitalRadius).toBe(twin.orbitalRadius);
        expect(planet.resourceAbundance).toBe(twin.resourceAbundance);
      }
    }
  });

  it("drops bodies below the smallest planet mass and keeps masses below the heaviest", () => {
    let dropped = 0;
    for (const star of stars) {
      for (const metallicity of [-1.5, 0.5]) {
        const system = at(star, metallicity);
        dropped += system.tooSmall;
        for (const planet of system.planets) {
          expect(planet.mass).toBeGreaterThanOrEqual(PLANET_MASS_DRAW.min);
          expect(planet.mass).toBeLessThanOrEqual(PLANET_MASS_DRAW.max);
        }
      }
    }
    expect(dropped).toBeGreaterThan(0);
  });

  it("scales by 10^[Fe/H], capped", () => {
    expect(planetMassFor(0.5, 0)).toBe(planetMassFromDraw(0.5));
    expect(planetMassFor(0.5, 0.2)).toBeCloseTo(planetMassFromDraw(0.5) * Math.pow(10, 0.2), 9);
    expect(planetMassFor(0.9999, 1)).toBe(PLANET_MASS_DRAW.max);
  });

  it("is the same every time", () => {
    for (const star of stars.slice(0, 20)) {
      expect(at(star, -0.4).planets.map((p) => p.mass)).toEqual(at(star, -0.4).planets.map((p) => p.mass));
    }
  });
});
