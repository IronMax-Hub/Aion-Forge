import { describe, it, expect } from "vitest";
import { createRNG } from "../simulation/rng";
import { generateGalaxy, pickGalaxyType } from "../simulation/galaxy";
import { generateStarsFor } from "../simulation/star";
import { generatePlanetsFor } from "../simulation/planet";
import { generateBiosphere } from "../simulation/biosphere";
import { generateCivilization, describeCivilization } from "../simulation/civilization";
import { makeConfig } from "../simulation/config";
import { buildUniverseTimeline, summarizeTimeline } from "../simulation/history";
import { makeUniverseId, serializeUniverse, deserializeUniverse, generateUniverseSummary } from "../simulation/persistence";
import type { GalaxyConfig } from "../simulation/galaxy";
import type { UniverseMeta } from "../simulation/persistence";

const SEEDS = [42, 123456789, 999999999, 1];

function makeGalaxyConfig(seed: number): GalaxyConfig {
  const rng = createRNG(seed);
  return { type: pickGalaxyType(rng), particleCount: 500, seed, scale: 120 };
}

// ── RNG ───────────────────────────────────────────────────────────────────────

describe("RNG determinism", () => {
  it("produces identical sequences for the same seed", () => {
    for (const seed of SEEDS) {
      const rng1 = createRNG(seed);
      const rng2 = createRNG(seed);
      for (let i = 0; i < 100; i++) {
        expect(rng1()).toBe(rng2());
      }
    }
  });

  it("produces different sequences for different seeds", () => {
    const a = createRNG(1);
    const b = createRNG(2);
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it("always returns values in [0, 1)", () => {
    const rng = createRNG(777);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

// ── Galaxy ────────────────────────────────────────────────────────────────────

describe("Galaxy determinism", () => {
  it("generates identical particles for the same seed", () => {
    for (const seed of SEEDS) {
      const cfg = makeGalaxyConfig(seed);
      const g1 = generateGalaxy(cfg);
      const g2 = generateGalaxy(cfg);
      expect(g1.positions).toEqual(g2.positions);
      expect(g1.colors).toEqual(g2.colors);
      expect(g1.config.type).toBe(g2.config.type);
    }
  });

  it("produces different galaxies for different seeds", () => {
    const g1 = generateGalaxy(makeGalaxyConfig(1));
    const g2 = generateGalaxy(makeGalaxyConfig(2));
    expect(g1.positions[0]).not.toBe(g2.positions[0]);
  });
});

// ── Stars ─────────────────────────────────────────────────────────────────────

describe("Stellar population determinism", () => {
  it("generates identical star populations for the same seed", () => {
    for (const seed of SEEDS) {
      const cfg = makeGalaxyConfig(seed);
      const p1 = generateStarsFor(cfg);
      const p2 = generateStarsFor(cfg);
      expect(p1.stars.length).toBe(p2.stars.length);
      for (let i = 0; i < p1.stars.length; i++) {
        const s1 = p1.stars[i];
        const s2 = p2.stars[i];
        expect(s1.mass).toBe(s2.mass);
        expect(s1.age).toBe(s2.age);
        expect(s1.lifespan).toBe(s2.lifespan);
        expect(s1.classification).toBe(s2.classification);
        expect(s1.temperature).toBe(s2.temperature);
      }
    }
  });

  it("respects universe config modifiers", () => {
    const seed = 42;
    const cfg = makeGalaxyConfig(seed);
    const defaultPop  = generateStarsFor(cfg, 13.7, makeConfig(seed));
    const highEntropy = generateStarsFor(cfg, 13.7, makeConfig(seed, { entropyRate: 2.0 }));
    // High entropy = shorter lifespans, so more stars should be dead (neutron/black hole/white dwarf)
    const deadDefault = defaultPop.stars.filter(
      (s) => s.classification === "white-dwarf" || s.classification === "neutron-star" || s.classification === "black-hole"
    ).length;
    const deadHighEntropy = highEntropy.stars.filter(
      (s) => s.classification === "white-dwarf" || s.classification === "neutron-star" || s.classification === "black-hole"
    ).length;
    expect(deadHighEntropy).toBeGreaterThanOrEqual(deadDefault);
  });
});

// ── Planets ───────────────────────────────────────────────────────────────────

describe("Planet generation determinism", () => {
  it("generates identical planetary systems for the same star + seed", () => {
    const seed = 42;
    const cfg = makeGalaxyConfig(seed);
    const pop = generateStarsFor(cfg);
    const star = pop.stars[0];

    const sys1 = generatePlanetsFor(star, seed);
    const sys2 = generatePlanetsFor(star, seed);

    expect(sys1.planets.length).toBe(sys2.planets.length);
    for (let i = 0; i < sys1.planets.length; i++) {
      expect(sys1.planets[i].type).toBe(sys2.planets[i].type);
      expect(sys1.planets[i].mass).toBe(sys2.planets[i].mass);
      expect(sys1.planets[i].temperature).toBe(sys2.planets[i].temperature);
      expect(sys1.planets[i].habitabilityScore).toBe(sys2.planets[i].habitabilityScore);
    }
  });
});

// ── Biosphere ─────────────────────────────────────────────────────────────────

describe("Biosphere determinism", () => {
  it("generates identical biospheres for the same planet + seed", () => {
    const seed = 12345;
    const cfg = makeGalaxyConfig(seed);
    const pop = generateStarsFor(cfg);

    for (const star of pop.stars.slice(0, 10)) {
      const sys = generatePlanetsFor(star, seed);
      for (const planet of sys.planets) {
        const b1 = generateBiosphere(planet, star, seed);
        const b2 = generateBiosphere(planet, star, seed);
        expect(b1.hasLife).toBe(b2.hasLife);
        expect(b1.stage).toBe(b2.stage);
        expect(b1.complexity).toBe(b2.complexity);
        expect(b1.extinctions.length).toBe(b2.extinctions.length);
      }
    }
  });
});

// ── Civilization ──────────────────────────────────────────────────────────────

describe("Civilization determinism", () => {
  it("generates identical civilizations for the same inputs", () => {
    const seed = 777;
    const cfg = makeGalaxyConfig(seed);
    const pop = generateStarsFor(cfg);

    let checked = 0;
    for (const star of pop.stars) {
      const sys = generatePlanetsFor(star, seed);
      for (const planet of sys.planets) {
        const bio = generateBiosphere(planet, star, seed);
        const r1 = generateCivilization(bio, planet, seed);
        const r2 = generateCivilization(bio, planet, seed);
        expect(r1.civilization?.techStage).toBe(r2.civilization?.techStage);
        expect(r1.civilization?.techLevel).toBe(r2.civilization?.techLevel);
        expect(r1.civilization?.collapsesCount).toBe(r2.civilization?.collapsesCount);
        checked++;
        if (checked >= 20) break;
      }
      if (checked >= 20) break;
    }
  });
});

// ── History ───────────────────────────────────────────────────────────────────

describe("Timeline determinism", () => {
  it("builds identical timelines for the same seed", () => {
    const seed = 99;
    const cfg = makeGalaxyConfig(seed);
    const galaxy = generateGalaxy(cfg);
    const pop = generateStarsFor(cfg);

    const entries = pop.stars.slice(0, 3).flatMap((star) => {
      const sys = generatePlanetsFor(star, seed);
      return sys.planets.map((planet) => {
        const bio = generateBiosphere(planet, star, seed);
        const { civilization, species } = generateCivilization(bio, planet, seed);
        return { planet, star, bio, civ: civilization ?? undefined, species: species ?? undefined };
      });
    });

    const t1 = buildUniverseTimeline(seed, galaxy, pop, entries);
    const t2 = buildUniverseTimeline(seed, galaxy, pop, entries);

    expect(t1.events.length).toBe(t2.events.length);
    for (let i = 0; i < t1.events.length; i++) {
      expect(t1.events[i].summary).toBe(t2.events[i].summary);
      expect(t1.events[i].importance).toBe(t2.events[i].importance);
      expect(t1.events[i].timestampGyr).toBe(t2.events[i].timestampGyr);
    }
  });
});

// ── Universe ID ───────────────────────────────────────────────────────────────

describe("Universe ID", () => {
  it("is deterministic from seed", () => {
    expect(makeUniverseId(42)).toBe(makeUniverseId(42));
    expect(makeUniverseId(1)).toBe(makeUniverseId(1));
  });

  it("follows AF-U-XXXX-XXXX format", () => {
    const id = makeUniverseId(123456789);
    expect(id).toMatch(/^AF-U-[0-9A-F]{4}-[0-9A-F]{4}$/);
  });

  it("differs for different seeds", () => {
    expect(makeUniverseId(1)).not.toBe(makeUniverseId(2));
  });
});

// ── Serialization round-trip ──────────────────────────────────────────────────

describe("Serialization", () => {
  it("round-trips a universe without data loss", () => {
    const seed = 54321;
    const cfg = makeGalaxyConfig(seed);
    const meta: UniverseMeta = {
      snapshotId: makeUniverseId(seed),
      seed,
      config: makeConfig(seed),
      name: "Test Universe",
      createdAt: 1000000,
      galaxyType: cfg.type,
      summary: "A test universe.",
      starCount: 2000,
      lifeBearingPlanets: 5,
      civilizationCount: 2,
      legendaryEvents: 3,
      notes: "test",
      isFavorite: false,
    };
    const json = serializeUniverse(meta);
    const restored = deserializeUniverse(json);
    expect(restored).not.toBeNull();
    expect(restored!.seed).toBe(meta.seed);
    expect(restored!.config.gravityStrength).toBe(meta.config.gravityStrength);
    expect(restored!.lifeBearingPlanets).toBe(meta.lifeBearingPlanets);
    expect(restored!.summary).toBe(meta.summary);
  });

  it("returns null for malformed JSON", () => {
    expect(deserializeUniverse("not json")).toBeNull();
    expect(deserializeUniverse('{"version":1}')).toBeNull();
  });
});

// ── Config modifiers ──────────────────────────────────────────────────────────

describe("Config modifiers affect emergence", () => {
  it("higher emergenceSensitivity produces more life-bearing planets", () => {
    const seed = 42;
    const cfg = makeGalaxyConfig(seed);
    const pop = generateStarsFor(cfg);

    function countLife(sensitivity: number): number {
      const config = makeConfig(seed, { emergenceSensitivity: sensitivity });
      let count = 0;
      for (const star of pop.stars.slice(0, 50)) {
        const sys = generatePlanetsFor(star, seed, config);
        for (const planet of sys.planets) {
          if (generateBiosphere(planet, star, seed, config).hasLife) count++;
        }
      }
      return count;
    }

    const lowLife  = countLife(0.1);
    const highLife = countLife(2.0);
    expect(highLife).toBeGreaterThan(lowLife);
  });

  it("intelligenceModifier=0.01 produces fewer civilizations than modifier=2.0", () => {
    const seed = 42;
    const cfg = makeGalaxyConfig(seed);
    const pop = generateStarsFor(cfg);

    function countCivs(modifier: number): number {
      const config = makeConfig(seed, { intelligenceModifier: modifier, emergenceSensitivity: 2.0 });
      let count = 0;
      for (const star of pop.stars.slice(0, 50)) {
        const sys = generatePlanetsFor(star, seed, config);
        for (const planet of sys.planets) {
          const bio = generateBiosphere(planet, star, seed, config);
          if (generateCivilization(bio, planet, seed, config).civilization) count++;
        }
      }
      return count;
    }

    const rareCivs  = countCivs(0.01);
    const commonCivs = countCivs(2.0);
    expect(commonCivs).toBeGreaterThanOrEqual(rareCivs);
  });
});

// ── Narrative functions ───────────────────────────────────────────────────────

describe("describeCivilization", () => {
  it("produces identical narrative for identical inputs", () => {
    const seed = 42;
    const cfg = makeGalaxyConfig(seed);
    const pop = generateStarsFor(cfg);

    let checked = 0;
    for (const star of pop.stars) {
      const sys = generatePlanetsFor(star, seed);
      for (const planet of sys.planets) {
        const bio = generateBiosphere(planet, star, seed);
        const { civilization, species } = generateCivilization(bio, planet, seed);
        if (civilization && species) {
          const n1 = describeCivilization(civilization, species);
          const n2 = describeCivilization(civilization, species);
          expect(n1).toBe(n2);
          expect(n1.length).toBeGreaterThan(20);
          checked++;
        }
        if (checked >= 5) break;
      }
      if (checked >= 5) break;
    }
  });
});

describe("summarizeTimeline", () => {
  it("produces non-empty summary", () => {
    const seed = 42;
    const cfg = makeGalaxyConfig(seed);
    const galaxy = generateGalaxy(cfg);
    const pop = generateStarsFor(cfg);

    const entries = pop.stars.slice(0, 5).flatMap((star) => {
      const sys = generatePlanetsFor(star, seed);
      return sys.planets.map((planet) => {
        const bio = generateBiosphere(planet, star, seed);
        const { civilization, species } = generateCivilization(bio, planet, seed);
        return { planet, star, bio, civ: civilization ?? undefined, species: species ?? undefined };
      });
    });

    const tl = buildUniverseTimeline(seed, galaxy, pop, entries);
    const summary = summarizeTimeline(tl);
    expect(summary.length).toBeGreaterThan(10);
    expect(summary).toMatch(/\./);
  });
});

describe("generateUniverseSummary", () => {
  it("handles silent universe", () => {
    const summary = generateUniverseSummary({
      seed: 1, config: makeConfig(1), galaxyType: "spiral",
      starCount: 2000, lifeBearingPlanets: 0, civilizationCount: 0,
      legendaryEvents: 0, totalPlanets: 5000,
    });
    expect(summary).toContain("silence");
  });

  it("handles universe with civilizations", () => {
    const summary = generateUniverseSummary({
      seed: 1, config: makeConfig(1), galaxyType: "elliptical",
      starCount: 2000, lifeBearingPlanets: 10, civilizationCount: 3,
      legendaryEvents: 2, totalPlanets: 4000,
    });
    expect(summary).toContain("3 civilizations");
  });
});
