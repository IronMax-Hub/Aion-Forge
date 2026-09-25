import { describe, it, expect } from "vitest";
import { createRNG } from "../simulation/rng";
import { pickGalaxyType } from "../simulation/galaxy";
import { generateStarsFor } from "../simulation/star";
import { generatePlanetsFor } from "../simulation/planet";
import { generateBiosphere } from "../simulation/biosphere";
import type { GalaxyConfig } from "../simulation/galaxy";

// Physical-consistency checks: loose bounds that catch rules drifting apart,
// not exact astrophysics.

const SEEDS = [42, 100000, 271828];

function makeGalaxyConfig(seed: number): GalaxyConfig {
  return { type: pickGalaxyType(createRNG(seed)), particleCount: 500, seed, scale: 120 };
}

function equilibriumTemp(luminosity: number, orbitalAU: number): number {
  return 278 * Math.pow(Math.max(0.0001, luminosity), 0.25) / Math.sqrt(orbitalAU);
}

describe("Stellar physics", () => {
  it("gives Sun-like main-sequence stars a Sun-like temperature", () => {
    for (const seed of SEEDS) {
      const { stars } = generateStarsFor(makeGalaxyConfig(seed));
      const sunLike = stars.filter((s) => s.classification === "main-sequence" && s.mass > 0.9 && s.mass < 1.1);
      expect(sunLike.length).toBeGreaterThan(0);
      for (const s of sunLike) {
        expect(s.temperature).toBeGreaterThan(4800);
        expect(s.temperature).toBeLessThan(7000);
      }
    }
  });

  it("makes heavier main-sequence stars hotter", () => {
    const { stars } = generateStarsFor(makeGalaxyConfig(100000));
    const ms = stars.filter((s) => s.classification === "main-sequence");
    const light = ms.filter((s) => s.mass < 0.6);
    const heavy = ms.filter((s) => s.mass > 3);
    const maxLight = Math.max(...light.map((s) => s.temperature));
    const minHeavy = Math.min(...heavy.map((s) => s.temperature));
    expect(minHeavy).toBeGreaterThan(maxLight);
  });
});

describe("Planetary physics", () => {
  it("reports gas giant temperature without a surface greenhouse", () => {
    for (const seed of SEEDS) {
      const { stars } = generateStarsFor(makeGalaxyConfig(seed));
      for (const star of stars.slice(0, 300)) {
        for (const p of generatePlanetsFor(star, seed).planets) {
          if (p.type !== "gas-giant") continue;
          expect(p.temperature).toBeCloseTo(equilibriumTemp(star.luminosity, p.orbitalRadius), 6);
        }
      }
    }
  });

  it("only allows life within the liquid-water temperature window", () => {
    for (const seed of SEEDS) {
      const { stars } = generateStarsFor(makeGalaxyConfig(seed));
      for (const star of stars.slice(0, 300)) {
        for (const p of generatePlanetsFor(star, seed).planets) {
          if (p.temperature <= 150 || p.temperature >= 450) {
            expect(p.habitabilityScore).toBeLessThanOrEqual(0.02);
            expect(generateBiosphere(p, star, seed).hasLife).toBe(false);
          }
        }
      }
    }
  });
});
