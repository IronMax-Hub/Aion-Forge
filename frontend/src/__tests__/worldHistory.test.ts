import { describe, it, expect } from "vitest";
import { runWorldHistory, FORMATION_DELAY_GYR, OCEANS_LOST_WATER, FROZEN_ICE_SHARE } from "../simulation/worldHistory";
import type { WorldHistory } from "../simulation/worldHistory";
import { buildGeography, hasSolidSurface } from "../simulation/geography";
import { derivePhysics } from "../simulation/planetPhysics";
import type { PlanetPhysics } from "../simulation/planetPhysics";
import { generatePlanetsFor, planetKey } from "../simulation/planet";
import type { Planet } from "../simulation/planet";
import { generateStarsFor, mainSequenceEndGyr, UNIVERSE_AGE_GYR } from "../simulation/star";
import type { Star } from "../simulation/star";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { makeConfig } from "../simulation/config";

const sun: Star = {
  id: 1, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772, luminosity: 1,
  classification: "main-sequence", isRare: false,
};

function planet(overrides: Partial<Planet> = {}): Planet {
  const hostStarId = overrides.hostStarId ?? 1;
  return {
    id: 2, key: planetKey(hostStarId, 2), hostStarId, orbitalRadius: 1, orbitalIndex: 2, type: "rocky", size: 1, mass: 1,
    temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5, habitabilityScore: 0.8, isRare: false, surface: null, ...overrides,
  };
}

const earthPhysics: PlanetPhysics = {
  surfaceGravity: 1, escapeVelocityKms: 11.2, surfacePressureBar: 1, tidallyLocked: false, orbitalPeriodYears: 1,
  rotationPeriodHours: 24, axialTiltDeg: 23, snowLineAU: 2.3, waterInventory: 0.08,
};

/** An Earth-like planet's history, with any part of the planet, its physics or its star changed. */
function history(
  { planet: p = {}, physics: ph = {}, star: s = {} }: { planet?: Partial<Planet>; physics?: Partial<PlanetPhysics>; star?: Partial<Star> } = {},
): WorldHistory {
  const world = planet(p);
  const physics = { ...earthPhysics, ...ph };
  return runWorldHistory(world, physics, buildGeography(world, physics, 42), { ...sun, ...s }, 42, undefined, { keepSnapshots: true });
}

const has = (h: WorldHistory, kind: string) => h.events.some((e) => e.kind === kind);

describe("Earth around the Sun", () => {
  const earths = [0, 1, 2, 3].map((hostStarId) => history({ planet: { hostStarId } }));

  it("ends with a temperate, wet present and today's sunlight", () => {
    for (const h of earths) {
      expect(h.present.meanK).toBeGreaterThan(280);
      expect(h.present.meanK).toBeLessThan(300);
      expect(h.present.oceanFraction).toBeGreaterThan(0.4);
      expect(h.final.luminosity).toBe(sun.luminosity);
      expect(h.final.tGyr).toBe(sun.age);
      expect(h.events.filter((e) => e.kind !== "freezes-over" && e.kind !== "thaws")).toEqual([]);
    }
  });

  it("starts cooler under the faint young Sun and keeps CO₂ falling as the Sun brightens", () => {
    for (const h of earths) {
      const [first, last] = [h.snapshots![0], h.snapshots![h.snapshots!.length - 1]];
      expect(first.luminosity).toBeLessThan(0.75);
      expect(last.co2Bar).toBeLessThan(first.co2Bar * 10);
      const middle = h.snapshots![10];
      expect(last.co2Bar).toBeLessThan(middle.co2Bar);
    }
  });

  it("steps every 100 Myr from formation, ending exactly at the star's age", () => {
    const h = earths[0];
    expect(h.steps).toBe(41);
    expect(h.snapshots).toHaveLength(41);
    expect(h.snapshots![0].tGyr).toBeCloseTo(FORMATION_DELAY_GYR + 0.1, 12);
    for (const e of h.events) { expect(e.tGyr).toBeGreaterThan(FORMATION_DELAY_GYR); expect(e.tGyr).toBeLessThanOrEqual(sun.age); }
  });

  it("is deterministic", () => {
    expect(history({ planet: { hostStarId: 0 } })).toEqual(earths[0]);
  });
});

describe("the carbon thermostat", () => {
  it("draws CO₂ down on a brighter star (a world with land and volcanism)", () => {
    for (let hostStarId = 0; hostStarId < 4; hostStarId++) {
      const dim = history({ planet: { hostStarId }, star: { luminosity: 0.9 } });
      const bright = history({ planet: { hostStarId }, star: { luminosity: 1.1 } });
      expect(bright.final.co2Bar).toBeLessThan(dim.final.co2Bar);
      expect(bright.final.meanK - dim.final.meanK).toBeLessThan(15);   // without the thermostat: ~15 K
    }
  });

  it("is missing on a world with no land, until losing water exposes land", () => {
    // All ocean: CO₂ builds up and the planet warms into a moist greenhouse. The
    // escaping water lowers the sea until land emerges; weathering then pulls CO₂ back down.
    const world = planet();
    const physics = { ...earthPhysics, waterInventory: 1 };
    expect(buildGeography(world, physics, 42).oceanFraction).toBe(1);
    const s = history({ physics }).snapshots!;
    const peak = s.findIndex((x, k) => k > 0 && x.co2Bar < s[k - 1].co2Bar) - 1;
    expect(peak).toBeGreaterThan(3);
    for (let k = 1; k <= peak; k++) expect(s[k].co2Bar).toBeGreaterThan(s[k - 1].co2Bar);
    expect(s[peak].water).toBeLessThan(physics.waterInventory / 2);
    expect(s[s.length - 1].co2Bar).toBeLessThan(s[peak].co2Bar / 10);
    expect(s[s.length - 1].openLandFraction).toBeGreaterThan(0);
  });

  it("is missing on a dry world: no water, no weathering", () => {
    const h = history({ physics: { waterInventory: 0 } });
    for (let k = 1; k < h.snapshots!.length; k++) expect(h.snapshots![k].co2Bar).toBeGreaterThanOrEqual(h.snapshots![k - 1].co2Bar);
  });

  it("thaws a frozen world with volcanism, as CO₂ builds up under the ice", () => {
    const thawed = [1.2, 1.25, 1.3, 1.35, 1.4].some((orbitalRadius) => {
      const h = history({ planet: { orbitalRadius } });
      const s = h.snapshots!;
      const thaw = h.events.find((e) => e.kind === "thaws");
      if (s[0].iceFraction < FROZEN_ICE_SHARE || !thaw) return false;
      const atThaw = s.find((x) => x.tGyr === thaw.tGyr)!;
      return atThaw.co2Bar > s[0].co2Bar * 10;
    });
    expect(thawed).toBe(true);
  });

  it("scales outgassing with gravity: a small dry world gains far less CO₂", () => {
    const small = history({ planet: { mass: 0.1, size: 0.54 }, physics: { waterInventory: 0, surfaceGravity: 0.1 / (0.54 * 0.54) } });
    const earthSized = history({ physics: { waterInventory: 0 } });
    expect(small.final.co2Bar).toBeLessThan(earthSized.final.co2Bar * 0.1);
  });
});

describe("water", () => {
  it("boils the oceans of a hot world as its star brightens, then loses them to space", () => {
    const h = history({ planet: { orbitalRadius: 0.42 } });
    const runaway = h.events.find((e) => e.kind === "runaway-greenhouse");
    const lost = h.events.find((e) => e.kind === "oceans-lost");
    expect(runaway).toBeDefined();
    expect(lost!.tGyr).toBeGreaterThan(runaway!.tGyr);
    expect(h.final.water).toBeLessThan(OCEANS_LOST_WATER);
    expect(h.present.oceanFraction).toBe(0);
  });

  it("stops weathering once the oceans are steam, so CO₂ builds up towards a Venus", () => {
    const h = history({ planet: { orbitalRadius: 0.46 } });
    const runaway = h.events.find((e) => e.kind === "runaway-greenhouse")!;
    const before = h.snapshots!.find((s) => s.tGyr === runaway.tGyr)!;
    expect(h.final.co2Bar).toBeGreaterThan(before.co2Bar * 1000);
  });

  it("leaves oxygen from the escaping water: an oxidised atmosphere with no life", () => {
    expect(has(history({ planet: { orbitalRadius: 0.3 } }), "oxidation")).toBe(true);
  });

  it("escapes more slowly from a planet with a higher escape velocity", () => {
    const weak = history({ planet: { orbitalRadius: 0.5 }, physics: { escapeVelocityKms: 8 } });
    const strong = history({ planet: { orbitalRadius: 0.5 }, physics: { escapeVelocityKms: 20 } });
    expect(weak.final.water).toBeLessThan(earthPhysics.waterInventory);
    expect(strong.final.water).toBeGreaterThan(weak.final.water);
  });
});

describe("stars that have left the main sequence", () => {
  it("records the star leaving, and the brightening giant boils the oceans of a once-temperate world", () => {
    const giant: Partial<Star> = { mass: 1, lifespan: 10, age: 9, classification: "red-giant", luminosity: 500 };
    const h = history({ star: giant });
    const leaves = h.events.find((e) => e.kind === "star-leaves-main-sequence");
    expect(leaves?.tGyr).toBe(mainSequenceEndGyr({ ...sun, ...giant }));
    const before = h.snapshots!.filter((s) => s.tGyr < leaves!.tGyr);
    expect(before[before.length - 1].meanK).toBeLessThan(330);
    expect(h.final.meanK).toBeGreaterThan(600);
    expect(h.final.steam || h.final.water < OCEANS_LOST_WATER).toBe(true);
  });

  it("runs no steps around a star younger than the formation delay", () => {
    const h = history({ star: { age: 0.3 } });
    expect(h.steps).toBe(0);
    expect(h.events).toEqual([]);
    expect(h.present.meanK).toBeGreaterThan(0);
  });
});

describe("across a universe", () => {
  const seed = 100000;
  const config = makeConfig(seed);
  const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars.slice(0, 150);
  const worlds = stars.flatMap((s) => generatePlanetsFor(s, seed, config).planets.filter(hasSolidSurface).map((p) => {
    const physics = derivePhysics(p, s, seed, config);
    return { star: s, planet: p, physics, history: runWorldHistory(p, physics, buildGeography(p, physics, seed), s, seed, config, { keepSnapshots: true }) };
  }));

  it("never gains water back", () => {
    expect(worlds.length).toBeGreaterThan(300);
    for (const { physics, history: h } of worlds) {
      let previous = physics.waterInventory;
      for (const s of h.snapshots!) { expect(s.water).toBeLessThanOrEqual(previous); previous = s.water; }
    }
  });

  it("makes no oxygen on a world that never lost water: without life, photolysis is the only source", () => {
    for (const { physics, history: h } of worlds) {
      if (h.final.water < physics.waterInventory) continue;
      for (const s of h.snapshots!) expect(s.o2Bar).toBe(0);
    }
  });

  it("keeps every state physical", () => {
    for (const { history: h } of worlds) {
      for (const s of h.snapshots!) {
        expect(s.co2Bar).toBeGreaterThanOrEqual(0);
        expect(s.o2Bar).toBeGreaterThanOrEqual(0);
        expect(s.unoxidisedCrust).toBeGreaterThanOrEqual(0);
        expect(s.ozone).toBeLessThanOrEqual(1);
        expect(Number.isFinite(s.meanK)).toBe(true);
        expect(s.iceFraction + s.openOceanFraction + s.openLandFraction).toBeCloseTo(1, 9);
      }
      const p = h.present;
      expect(p.oceanFraction + p.iceFraction + p.landFraction).toBeCloseTo(1, 9);
      for (let k = 1; k < h.events.length; k++) expect(h.events[k].tGyr).toBeGreaterThanOrEqual(h.events[k - 1].tGyr);
    }
  });

  it("produces varied histories: some worlds freeze, some run away, some stay temperate", () => {
    const share = (kind: string) => worlds.filter(({ history: h }) => has(h, kind)).length / worlds.length;
    expect(share("runaway-greenhouse") + share("oceans-lost")).toBeGreaterThan(0.02);
    expect(share("thaws")).toBeGreaterThan(0.02);
    expect(worlds.some(({ history: h }) => h.present.oceanFraction > 0.1 && h.present.meanK > 273 && h.present.meanK < 310)).toBe(true);
  });

  it("draws events per step, so the same planet's history does not depend on its neighbours", () => {
    const { star, planet: p, physics } = worlds[3];
    const again = runWorldHistory(p, physics, buildGeography(p, physics, seed), star, seed, config);
    expect(again.events).toEqual(worlds[3].history.events);
    expect(again.present).toEqual(worlds[3].history.present);
  });
});
