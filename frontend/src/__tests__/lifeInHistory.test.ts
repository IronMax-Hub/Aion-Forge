import { describe, it, expect } from "vitest";
import { runWorldHistory, FORMATION_DELAY_GYR, OCEANS_LOST_WATER } from "../simulation/worldHistory";
import type { WorldHistory } from "../simulation/worldHistory";
import { buildGeography } from "../simulation/geography";
import { derivePhysics } from "../simulation/planetPhysics";
import type { PlanetPhysics } from "../simulation/planetPhysics";
import { generatePlanetsFor, planetKey } from "../simulation/planet";
import type { Planet } from "../simulation/planet";
import { generateBiosphere } from "../simulation/biosphere";
import { generateCivilization } from "../simulation/civilization";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";
import type { UniverseConfig } from "../simulation/config";

// Worlds Up Close C2.3b: life lives inside each planet's history.

const sun: Star = {
  id: 1, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772, luminosity: 1,
  classification: "main-sequence", isRare: false,
};
const earthPhysics: PlanetPhysics = {
  surfaceGravity: 1, escapeVelocityKms: 11.2, surfacePressureBar: 1, tidallyLocked: false, orbitalPeriodYears: 1,
  rotationPeriodHours: 24, axialTiltDeg: 23, snowLineAU: 2.3, waterInventory: 0.08,
};

/** An Earth around the Sun; `copy` changes only its identity, and so its draws. */
function earth(copy: number, config?: UniverseConfig): WorldHistory {
  const planet: Planet = {
    id: 2, key: planetKey(copy, 2), hostStarId: copy, orbitalRadius: 1, orbitalIndex: 2, type: "rocky", size: 1, mass: 1,
    temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5,
    habitabilityScore: 0.8, isRare: false, surface: null, life: null, worldEvents: [], everLiquidWater: false,
  };
  return runWorldHistory(planet, earthPhysics, buildGeography(planet, earthPhysics, 42), sun, 42, config, { keepSnapshots: true });
}

const earths = Array.from({ length: 40 }, (_, copy) => earth(copy));

const seed = 100000;
const config = makeConfig(seed);
const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 60);
const worlds = stars.flatMap((star) => generatePlanetsFor(star, seed, config).planets
  .filter((planet) => planet.surface !== null)
  .map((planet) => {
    const physics = derivePhysics(planet, star, seed, config);
    const history = runWorldHistory(planet, physics, buildGeography(planet, physics, seed), star, seed, config, { keepSnapshots: true });
    return { star, planet, physics, history };
  }));

describe("the origin of life", () => {
  it("usually comes within half a billion years on an Earth-like world (owner decision: anchored on Earth)", () => {
    const early = earths.filter((h) => h.life !== null && h.life.startedGyr <= FORMATION_DELAY_GYR + 0.5).length;
    expect(early / earths.length).toBeGreaterThan(0.6);
    expect(early / earths.length).toBeLessThan(0.95);
  });

  it("happens only where there is liquid water", () => {
    for (const { history } of worlds) {
      if (history.life === null) continue;
      const step = history.snapshots!.find((s) => s.tGyr === history.life!.startedGyr)!;
      expect(step.steam).toBe(false);
      expect(step.water).toBeGreaterThanOrEqual(OCEANS_LOST_WATER);
      expect(Math.max(...step.bandOcean)).toBeGreaterThan(0);
    }
  });

  it("never happens when emergence sensitivity is zero, and comes sooner when it is higher", () => {
    const lifeless = Array.from({ length: 10 }, (_, copy) => earth(copy, { ...makeConfig(42), emergenceSensitivity: 0 }));
    for (const h of lifeless) expect(h.life).toBeNull();
    const eager = Array.from({ length: 40 }, (_, copy) => earth(copy, { ...makeConfig(42), emergenceSensitivity: 4 }));
    const start = (hs: WorldHistory[]) => hs.reduce((sum, h) => sum + (h.life?.startedGyr ?? sun.age), 0) / hs.length;
    expect(start(eager)).toBeLessThan(start(earths));
  });

  it("happens at most once, and the planet keeps the record of life that has ended", () => {
    const ended = worlds.filter(({ history }) => history.life?.endedGyr != null);
    expect(ended.length).toBeGreaterThan(0);
    for (const { star, planet, history } of ended) {
      expect(planet.life).toEqual({
        startedGyr: history.life!.startedGyr, endedGyr: history.life!.endedGyr, phylogeny: history.phylogeny,
        oxygenGyr: history.lifeOxygenGyr,
      });
      expect(history.phylogeny!.livingLineages).toBe(0);
      expect(history.life!.endedGyr!).toBeGreaterThanOrEqual(history.life!.startedGyr);
      expect(generateBiosphere(planet, star).hasLife).toBe(false);
    }
  });
});

describe("life's air", () => {
  it("makes no biological oxygen before the first light user", () => {
    for (const { physics, history } of worlds) {
      if (history.final.water < physics.waterInventory) continue;   // photolysis also makes O₂
      const firstLight = history.life?.firsts.find((f) => f.kind === "light")?.tGyr ?? Infinity;
      for (const s of history.snapshots!) if (s.tGyr <= firstLight) expect(s.o2Bar).toBe(0);
    }
  });

  it("settles near Earth's 0.21 bar on an Earth-like world whose light users thrive", () => {
    // A world can also oxidise and lose its oxygen again when its light users decline
    const oxidised = earths.filter((h) => h.events.some((e) => e.kind === "oxidation"));
    expect(oxidised.length).toBeGreaterThan(earths.length / 4);
    const thriving = oxidised.filter((h) => h.final.lightBiomass > 0.1);
    expect(thriving.length).toBeGreaterThan(0);
    for (const h of thriving) {
      expect(h.final.o2Bar).toBeGreaterThan(0.05);
      expect(h.final.o2Bar).toBeLessThan(0.3);
    }
  });

  it("gets methane from chemical-energy life while the air is anoxic", () => {
    // The chemistry reads last step's biomass, so methane follows a step after the methanogens
    let checked = 0;
    for (const h of earths) {
      h.snapshots!.forEach((s, i) => {
        if (i === 0 || h.snapshots![i - 1].chemicalBiomass <= 0 || h.snapshots![i - 1].o2Bar > 0) return;
        expect(s.ch4Bar).toBeGreaterThan(0);
        checked++;
      });
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("keeps far less methane once the air is oxidised", () => {
    // Anoxic vent life keeps ~10⁻³ bar; in oxidised air methanogens are confined and methane is
    // destroyed faster: typically ~10⁻⁹ bar. A world that oxidised only lately can still hold more,
    // but never as much as anoxic vent life keeps
    const oxidised = earths.map((h) => h.snapshots!.at(-1)!).filter((today) => today.o2Bar > 0.1).map((today) => today.ch4Bar);
    expect(oxidised.length).toBeGreaterThan(0);
    for (const ch4 of oxidised) expect(ch4).toBeLessThan(1e-3);
    expect([...oxidised].sort((a, b) => a - b)[Math.floor(oxidised.length / 2)]).toBeLessThan(1e-6);
  });

  it("dates life's own oxygen after the first light user, never from escaping water (EN0)", () => {
    let dated = 0;
    for (const { history } of [...worlds, ...earths.map((h) => ({ history: h }))]) {
      const firstLight = history.life?.firsts.find((f) => f.kind === "light")?.tGyr;
      if (firstLight === undefined) {
        expect(history.lifeOxygenGyr).toBeNull();
        continue;
      }
      if (history.lifeOxygenGyr === null) continue;
      dated++;
      expect(history.lifeOxygenGyr).toBeGreaterThan(firstLight);
      expect(history.snapshots!.some((s) => s.tGyr === history.lifeOxygenGyr)).toBe(true);
    }
    expect(dated).toBeGreaterThan(0);
    // With no water lost, life's oxygen is all the air's: both oxidise it at the same step
    let same = 0;
    for (const { physics, history } of worlds) {
      if (history.final.water < physics.waterInventory) continue;
      expect(history.lifeOxygenGyr).toBe(history.events.find((e) => e.kind === "oxidation")?.tGyr ?? null);
      if (history.lifeOxygenGyr !== null) same++;
    }
    expect(same).toBeGreaterThan(0);
    // An Earth whose light users thrive holds its air oxidised by its own oxygen
    for (const h of earths.filter((e) => e.final.lightBiomass > 0.1)) expect(h.lifeOxygenGyr).not.toBeNull();
    // A lifeless world oxidised by escaping water has no life's oxygen
    const dry = { ...makeConfig(42), emergenceSensitivity: 0 };
    const planet: Planet = {
      id: 2, key: planetKey(1, 2), hostStarId: 1, orbitalRadius: 0.3, orbitalIndex: 2, type: "rocky", size: 1, mass: 1,
      temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5,
      habitabilityScore: 0.8, isRare: false, surface: null, life: null, worldEvents: [], everLiquidWater: false,
    };
    const scorched = runWorldHistory(planet, earthPhysics, buildGeography(planet, earthPhysics, 42), sun, 42, dry);
    expect(scorched.events.some((e) => e.kind === "oxidation")).toBe(true);
    expect(scorched.lifeOxygenGyr).toBeNull();
  });

  it("keeps a lifeless planet's air exactly as it was without life", () => {
    const lifeless = { ...makeConfig(42), emergenceSensitivity: 0 };
    for (let copy = 0; copy < 4; copy++) {
      const h = earth(copy, lifeless);
      for (const s of h.snapshots!) {
        expect(s.totalBiomass).toBe(0);
        expect(s.ch4Bar).toBe(0);
      }
    }
  });
});

describe("what life becomes", () => {
  it("does not follow one fixed order: different worlds reach their firsts in different orders", () => {
    const orders = new Set(worlds.filter(({ history }) => history.life && history.life.firsts.length >= 3)
      .map(({ history }) => history.life!.firsts.map((f) => f.kind).join(" → ")));
    expect(orders.size).toBeGreaterThan(1);
  });

  it("tells the biosphere whether life lives today and since when", () => {
    for (const { star, planet } of worlds) {
      const bio = generateBiosphere(planet, star);
      const alive = planet.life !== null && planet.life.endedGyr === null;
      expect(bio.hasLife).toBe(alive);
      if (planet.life && planet.life.endedGyr !== null) {
        // Life that has ended (R8, C2.5): how long ago, and how long it lasted
        expect(bio.stage).toBe("none");
        expect(bio.extinctAt).toBeCloseTo(star.age - planet.life.endedGyr, 12);
        expect(bio.ageGyr).toBeCloseTo(planet.life.endedGyr - planet.life.startedGyr, 12);
      }
      if (!alive) continue;
      expect(bio.extinctAt).toBeNull();
      expect(bio.ageGyr).toBeCloseTo(star.age - planet.life!.startedGyr, 12);
      // Life from the loop is cells from the start, even a world whose life is brand new
      expect(["microbial", "multicellular", "complex", "dominant"]).toContain(bio.stage);
    }
  });

  it("gives a civilization only to a world where a mind appeared, between life's start and today, no older than life (C2.6)", () => {
    let minds = 0;
    for (const { star, planet } of worlds) {
      const mind = planet.life?.phylogeny.mind ?? null;
      const civ = generateCivilization(generateBiosphere(planet, star), planet, seed).civilization;
      if (!mind) { expect(civ).toBeNull(); continue; }
      minds++;
      expect(mind.tGyr).toBeGreaterThanOrEqual(planet.life!.startedGyr);
      expect(mind.tGyr).toBeLessThanOrEqual(star.age);
      expect(mind.log10BodyMassKg).toBeGreaterThan(-3);
      if (civ) expect(civ.ageGyr).toBeLessThanOrEqual(star.age - planet.life!.startedGyr + 1e-12);
    }
    expect(minds).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const again = earth(3);
    expect(again.life).toEqual(earths[3].life);
    expect(again.final).toEqual(earths[3].final);
  });
});
