import { describe, it, expect } from "vitest";
import {
  CIRCULAR_BELOW_DAYS, COMPANION_CHANCE, companionChance, LOG_PERIOD_DAYS, MASS_RATIO, MAX_ECCENTRICITY, separationFromPeriod,
} from "../simulation/binary";
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
