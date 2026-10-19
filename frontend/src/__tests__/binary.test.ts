import { describe, it, expect } from "vitest";
import {
  binaryOrbitOf, CIRCULAR_BELOW_DAYS, COMPANION_CHANCE, companionChance, LOG_PERIOD_DAYS, MASS_RATIO, MAX_ECCENTRICITY,
  pTypeLimitAU, separationFromPeriod, sTypeLimitAU,
} from "../simulation/binary";
import type { Companion } from "../simulation/binary";
import { effectiveOrbitAU, generatePlanetsFor } from "../simulation/planet";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";

const starsOf = (seed: number) => {
  const config = makeConfig(seed);
  return generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars;
};
const stars = [100000, 42, 7777].flatMap(starsOf);
const binaries = stars.filter((s) => s.companion !== null);

describe("companions (BS1)", () => {
  it("puts Earth around the Sun at 1 AU by Kepler's law", () => {
    expect(separationFromPeriod(1, 365.25)).toBeCloseTo(1, 12);
  });

  it("gives each mass bin its share of companions, within sampling error", () => {
    let from = 0;
    for (const bin of COMPANION_CHANCE) {
      const inBin = stars.filter((s) => s.mass >= from && s.mass < bin.massBelow);
      from = bin.massBelow;
      expect(companionChance(inBin[0].mass)).toBe(bin.chance);
      const share = inBin.filter((s) => s.companion).length / inBin.length;
      const sigma = Math.sqrt(bin.chance * (1 - bin.chance) / inBin.length);
      expect(Math.abs(share - bin.chance)).toBeLessThan(4 * sigma);
    }
  });

  it("never makes a companion heavier than its primary", () => {
    for (const s of binaries) {
      const q = s.companion!.mass / s.mass;
      expect(q).toBeGreaterThanOrEqual(MASS_RATIO.min);
      expect(q).toBeLessThanOrEqual(MASS_RATIO.max);
    }
  });

  it("draws periods log-normally about 10^5.03 days, with separations from Kepler", () => {
    const logPeriods = binaries.map((s) => Math.log10(s.companion!.periodDays)).sort((a, b) => a - b);
    const median = logPeriods[Math.floor(logPeriods.length / 2)];
    // The median's standard error is about 1.25 σ / √n ≈ 0.04 dex here
    expect(Math.abs(median - LOG_PERIOD_DAYS.median)).toBeLessThan(0.2);
    for (const s of binaries) {
      const c = s.companion!;
      expect(c.separationAU).toBeCloseTo(separationFromPeriod(s.mass + c.mass, c.periodDays), 10);
    }
  });

  it("circularises close pairs and keeps wider ones below e = 0.8", () => {
    for (const s of binaries) {
      const c = s.companion!;
      if (c.periodDays < CIRCULAR_BELOW_DAYS) expect(c.eccentricity).toBe(0);
      expect(c.eccentricity).toBeGreaterThanOrEqual(0);
      expect(c.eccentricity).toBeLessThan(MAX_ECCENTRICITY);
    }
  });

  it("ages the companion with its primary, by the rules for any star", () => {
    for (const s of binaries) {
      const c = s.companion!;
      // Lighter or equal, so it lives at least as long and is never further along
      expect(c.lifespan).toBeGreaterThanOrEqual(s.lifespan);
      if (s.classification === "main-sequence") expect(["main-sequence", "protostar"]).toContain(c.classification);
      expect(c.luminosity).toBeGreaterThanOrEqual(0);
    }
  });

  it("is the same every time", () => {
    expect(starsOf(42).map((s) => s.companion)).toEqual(starsOf(42).map((s) => s.companion));
  });
});

describe("where planets can orbit (BS2)", () => {
  // μ = 0.3 and e = 0.5, at a separation of 10 AU; the values worked by hand from Holman & Wiegert's fits
  const companion: Companion = {
    mass: 0.3, periodDays: 10000, separationAU: 10, eccentricity: 0.5,
    lifespan: 200, temperature: 3400, luminosity: 0.01, classification: "main-sequence",
  };

  it("gives Holman & Wiegert's limits at reference values", () => {
    expect(sTypeLimitAU(0.7, companion)).toBeCloseTo(1.4505, 10);
    expect(pTypeLimitAU(0.7, companion)).toBeCloseTo(38.36125, 10);
    const circularTwin = { ...companion, mass: 1, eccentricity: 0 };
    expect(sTypeLimitAU(1, circularTwin)).toBeCloseTo(10 * (0.464 - 0.19), 10);
    expect(pTypeLimitAU(1, circularTwin)).toBeCloseTo(10 * (1.6 + 2.06 - 1.2725), 10);
  });

  it("allows orbits close to the star and far around both, never between", () => {
    expect(binaryOrbitOf(1, 0.7, companion)).toBe("around-primary");
    expect(binaryOrbitOf(10, 0.7, companion)).toBe("unstable");
    expect(binaryOrbitOf(40, 0.7, companion)).toBe("around-both");
  });

  const seed = 100000;
  const config = makeConfig(seed);
  const all = starsOf(seed);
  const systems = all.filter((s) => s.companion).slice(0, 250).map((star) => ({ star, system: generatePlanetsFor(star, seed, config) }));

  it("leaves no planet between the limits, and marks those around both stars", () => {
    let removed = 0;
    let aroundBoth = 0;
    for (const { star, system } of systems) {
      removed += system.unstable;
      for (const p of system.planets) {
        const where = binaryOrbitOf(effectiveOrbitAU(p.orbitalRadius, config), star.mass, star.companion!);
        expect(where).not.toBe("unstable");
        expect(p.orbitsBothStars === true).toBe(where === "around-both");
        if (p.orbitsBothStars) aroundBoth++;
      }
    }
    // The sample must exercise both outcomes
    expect(removed).toBeGreaterThan(0);
    expect(aroundBoth).toBeGreaterThan(0);
  });

  it("takes a removed planet's draws, so the others keep their orbits, masses and indices", () => {
    for (const { star, system } of systems) {
      const alone = generatePlanetsFor({ ...star, companion: null }, seed, config);
      expect(alone.unstable).toBe(0);
      expect(system.planets.length + system.unstable).toBe(alone.planets.length);
      const byIndex = new Map(alone.planets.map((p) => [p.orbitalIndex, p]));
      for (const p of system.planets) {
        const twin = byIndex.get(p.orbitalIndex)!;
        expect([p.key, p.orbitalRadius, p.mass, p.size, p.resourceAbundance]).toEqual([twin.key, twin.orbitalRadius, twin.mass, twin.size, twin.resourceAbundance]);
      }
    }
  });

  it("leaves single stars' systems untouched", () => {
    for (const star of all.filter((s) => !s.companion).slice(0, 200)) {
      const system = generatePlanetsFor(star, seed, config);
      expect(system.unstable).toBe(0);
      expect(system.planets.some((p) => p.orbitsBothStars)).toBe(false);
    }
  });
});
