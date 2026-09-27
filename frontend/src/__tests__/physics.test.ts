import { describe, it, expect } from "vitest";
import { createRNG } from "../simulation/rng";
import { pickGalaxyType, generateGalaxy } from "../simulation/galaxy";
import { generateStarsFor } from "../simulation/star";
import { generatePlanetsFor } from "../simulation/planet";
import { generateBiosphere } from "../simulation/biosphere";
import { generateCivilization } from "../simulation/civilization";
import { buildUniverseTimeline } from "../simulation/history";
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

describe("Stellar life phases", () => {
  it("never labels a star older than 0.5 Gyr a protostar", () => {
    for (const seed of SEEDS) {
      for (const s of generateStarsFor(makeGalaxyConfig(seed)).stars) {
        if (s.classification === "protostar") expect(s.age).toBeLessThanOrEqual(0.5);
      }
    }
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

  it("scores no habitability where the surface holds no temperate liquid water", () => {
    // Not the mean temperature: a locked world can be frozen on average and still
    // keep a temperate ring (Worlds Up Close A3). Life itself may still live in
    // dark water under ice (C2.2): habitability is a present-day summary, not a gate (C2.3b).
    for (const seed of SEEDS) {
      const { stars } = generateStarsFor(makeGalaxyConfig(seed));
      for (const star of stars.slice(0, 300)) {
        for (const p of generatePlanetsFor(star, seed).planets) {
          if (!p.surface || p.surface.habitableFraction === 0) expect(p.habitabilityScore).toBe(0);
        }
      }
    }
  });

  it("forms strongly irradiated rocky planets with at most a thin atmosphere", () => {
    for (const seed of SEEDS) {
      const { stars } = generateStarsFor(makeGalaxyConfig(seed));
      for (const star of stars.slice(0, 300)) {
        for (const p of generatePlanetsFor(star, seed).planets) {
          if (p.mass > 0.05 && p.mass <= 15 && equilibriumTemp(star.luminosity, p.orbitalRadius) > 700) {
            expect(["none", "thin"]).toContain(p.formationAtmosphere);
          }
        }
      }
    }
  });
});

describe("Timeline chronology", () => {
  it("dates no event before the universe began, and no life before its planet formed", () => {
    // One timeline across many systems: planet keys keep each planet's events apart
    const seed = 100000;
    const galaxyCfg = makeGalaxyConfig(seed);
    const galaxy = generateGalaxy(galaxyCfg);
    const population = generateStarsFor(galaxyCfg);
    const entries = population.stars.slice(0, 60).flatMap((star) =>
      generatePlanetsFor(star, seed).planets.map((planet) => {
        const bio = generateBiosphere(planet, star, seed);
        const civ = bio.hasLife ? generateCivilization(bio, planet, seed) : null;
        return { planet, star, bio, civ: civ?.civilization ?? undefined, species: civ?.species ?? undefined };
      }));
    const timeline = buildUniverseTimeline(seed, galaxy, population, entries);

    for (const e of timeline.events) expect(e.timestampGyr).toBeLessThanOrEqual(13.7);

    const formedAgo = new Map<string, number>();
    for (const e of timeline.events) {
      if (e.category === "planetary" && e.summary.includes("coalesced")) {
        expect(formedAgo.has(e.subjectId)).toBe(false);   // each planet forms exactly once
        formedAgo.set(e.subjectId, e.timestampGyr);
      }
    }
    expect(formedAgo.size).toBe(entries.length);
    for (const e of timeline.events) {
      if (e.category === "biological" || e.category === "civilizational") {
        expect(formedAgo.has(e.subjectId)).toBe(true);
        expect(e.timestampGyr).toBeLessThanOrEqual(formedAgo.get(e.subjectId)!);
      }
    }
  });
});
