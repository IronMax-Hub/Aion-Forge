import { describe, expect, it } from "vitest";
import { makeConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { generateStarsFor, KROUPA_IMF, kroupaMass, LIFESPAN, REMNANT_FRACTION, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";

// The stellar population against measured astronomy (Phase 3, A2).

const SEEDS = [42, 7777, 100000, 1, 2, 3];

function starsOf(seed: number, overrides: Parameters<typeof makeConfig>[1] = {}): Star[] {
  const config = makeConfig(seed, overrides);
  return generateStarsFor(buildGalaxyConfig(seed, config), undefined, config).stars;
}

/** Kroupa's share of stars between two masses, from the IMF itself: dN/dm ∝ m^−1.3 below 0.5 M☉, m^−2.3 above, continuous. */
function kroupaShare(lo: number, hi: number): number {
  const integral = (a: number, b: number, slope: number) => (b ** (1 - slope) - a ** (1 - slope)) / (1 - slope);
  const count = (a: number, b: number) =>
    integral(Math.min(a, 0.5), Math.min(b, 0.5), 1.3) + 0.5 * integral(Math.max(a, 0.5), Math.max(b, 0.5), 2.3);
  return count(lo, hi) / count(0.08, 100);
}

describe("star masses (A2.1, A2.3)", () => {
  it("inverts the Kroupa IMF: the draw is the share of stars lighter", () => {
    expect(kroupaMass(0)).toBeCloseTo(KROUPA_IMF.pieces[0].fromSolar, 12);
    expect(kroupaMass(1)).toBeCloseTo(KROUPA_IMF.maxSolar, 9);
    for (const m of [0.1, 0.3, 0.5, 1, 8, 40]) expect(kroupaMass(kroupaShare(0.08, m))).toBeCloseTo(m, 9);
  });

  it("gives the Kroupa mass bins, to within sampling error, over six galaxies", () => {
    const stars = SEEDS.flatMap((seed) => starsOf(seed));
    for (const [lo, hi] of [[0.08, 0.5], [0.5, 1], [1, 8], [8, 100]]) {
      const expected = kroupaShare(lo, hi);
      const observed = stars.filter((s) => s.mass >= lo && s.mass < hi).length / stars.length;
      const sigma = Math.sqrt((expected * (1 - expected)) / stars.length);
      expect(Math.abs(observed - expected)).toBeLessThan(4 * sigma);
    }
  });

  it("reshapes the masses smoothly with the ignition threshold, with no pile-up at any mass", () => {
    let heavyBefore = Infinity;
    for (const stellarIgnitionThreshold of [0.01, 0.3, 0.7, 1, 1.5, 2]) {
      const stars = starsOf(42, { stellarIgnitionThreshold });
      const heavy = stars.filter((s) => s.mass > 8).length / stars.length;
      expect(heavy).toBeLessThanOrEqual(heavyBefore);
      heavyBefore = heavy;
      // The old clamp put every draw above the threshold at one mass (rules v18)
      const counts = new Map<number, number>();
      for (const s of stars) counts.set(s.mass, (counts.get(s.mass) ?? 0) + 1);
      expect(Math.max(...counts.values())).toBeLessThan(0.01 * stars.length);
    }
  });
});

describe("star formation through time (A2.2)", () => {
  const stars = SEEDS.flatMap((seed) => starsOf(seed));
  const remnant = (s: Star) => ["white-dwarf", "neutron-star", "black-hole"].includes(s.classification);

  it("forms stars at a constant rate: ages spread evenly over the universe's age, whatever the lifespan", () => {
    const meanAge = stars.reduce((sum, s) => sum + s.age, 0) / stars.length;
    expect(meanAge / UNIVERSE_AGE_GYR).toBeCloseTo(0.5, 1);
    expect(Math.max(...stars.map((s) => s.age))).toBeLessThanOrEqual(UNIVERSE_AGE_GYR);
  });

  it("has the remnants a constant rate makes: a star of lifespan L has ended with chance 1 − 0.95·L / T", () => {
    // Expected share, averaged over the IMF on a fine grid of draws
    const n = 20000;
    let expected = 0;
    for (let i = 0; i < n; i++) {
      const lifespan = Math.max(LIFESPAN.minGyr, LIFESPAN.solarGyr / kroupaMass((i + 0.5) / n) ** LIFESPAN.massExponent);
      expected += Math.max(0, 1 - (REMNANT_FRACTION * lifespan) / UNIVERSE_AGE_GYR) / n;
    }
    const observed = stars.filter(remnant).length / stars.length;
    const sigma = Math.sqrt((expected * (1 - expected)) / stars.length);
    expect(Math.abs(observed - expected)).toBeLessThan(4 * sigma);
    // Near the Sun, white dwarfs are several per cent of stars
    expect(observed).toBeGreaterThan(0.04);
    expect(observed).toBeLessThan(0.12);
  });

  it("leaves heavy stars mostly dead, as only the young ones still shine", () => {
    const heavy = stars.filter((s) => s.mass > 8);
    expect(heavy.length).toBeGreaterThan(20);
    expect(heavy.filter(remnant).length / heavy.length).toBeGreaterThan(0.9);
  });
});
