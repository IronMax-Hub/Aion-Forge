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
import { EARTH_HEAT_FLOW_W_M2, iceShellKm } from "../simulation/interiorHeat";

const sun: Star = {
  id: 1, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772, luminosity: 1,
  classification: "main-sequence", isRare: false, metallicity: 0,
};

function planet(overrides: Partial<Planet> = {}): Planet {
  const hostStarId = overrides.hostStarId ?? 1;
  return {
    id: 2, key: planetKey(hostStarId, 2), hostStarId, orbitalRadius: 1, orbitalIndex: 2, type: "rocky", size: 1, mass: 1,
    temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5, habitabilityScore: 0.8, isRare: false, surface: null, life: null, worldEvents: [], everLiquidWater: false, ...overrides,
  };
}

const earthPhysics: PlanetPhysics = {
  surfaceGravity: 1, escapeVelocityKms: 11.2, surfacePressureBar: 1, tidallyLocked: false, orbitalPeriodYears: 1,
  rotationPeriodHours: 24, axialTiltDeg: 23, snowLineAU: 2.3, waterInventory: 0.08,
};

/**
 * An Earth-like planet's history, with any part of the planet, its physics or
 * its star changed. `lifeless` runs it in a universe where life never begins
 * (emergenceSensitivity 0), for the rules of the planet alone.
 */
function history(
  { planet: p = {}, physics: ph = {}, star: s = {}, lifeless = false }:
    { planet?: Partial<Planet>; physics?: Partial<PlanetPhysics>; star?: Partial<Star>; lifeless?: boolean } = {},
): WorldHistory {
  const world = planet(p);
  const physics = { ...earthPhysics, ...ph };
  const config = lifeless ? { ...makeConfig(42), emergenceSensitivity: 0 } : undefined;
  return runWorldHistory(world, physics, buildGeography(world, physics, 42), { ...sun, ...s }, 42, config, { keepSnapshots: true });
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
      // Life's own oxygen may oxidise the air (C2.3b); nothing else happens to it
      expect(h.events.filter((e) => !["freezes-over", "thaws", "oxidation"].includes(e.kind))).toEqual([]);
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
      // Without the thermostat: ~14 K from the starlight alone, as the greenhouse scales with it (IH2);
      // a dimmer world that keeps some ice is colder still, by up to ~3 K (measured, recorded for IH4)
      expect(bright.final.meanK - dim.final.meanK).toBeLessThan(18);
    }
  });

  it("works on the ocean floor of a world with no land, so it keeps its oceans", () => {
    // All ocean: no land weathers, but the sea floor does (at 15% of land's rate), which
    // holds CO₂ down; without it the planet ran into a moist greenhouse and lost its water
    const world = planet();
    const physics = { ...earthPhysics, waterInventory: 1 };
    expect(buildGeography(world, physics, 42).oceanFraction).toBe(1);
    const h = history({ physics });
    const s = h.snapshots!;
    expect(Math.max(...s.map((x) => x.co2Bar))).toBeLessThan(0.1);
    expect(s[s.length - 1].water).toBeGreaterThan(0.95 * physics.waterInventory);
    expect(h.events.map((e) => e.kind)).not.toContain("moist-greenhouse");
    expect(h.events.map((e) => e.kind)).not.toContain("runaway-greenhouse");
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
  it("loses a hot world's oceans to its young star's ultraviolet before they can boil (AE2, decision 40)", () => {
    const h = history({ planet: { orbitalRadius: 0.42 } });
    const lost = h.events.find((e) => e.kind === "oceans-lost");
    expect(lost!.tGyr).toBeLessThan(1);
    expect(h.events.some((e) => e.kind === "runaway-greenhouse")).toBe(false);
    expect(h.final.water).toBeLessThan(OCEANS_LOST_WATER);
    expect(h.present.oceanFraction).toBe(0);
  });

  it("stops weathering once the oceans are steam, so CO₂ builds up towards a Venus", () => {
    // A giant boils the oceans of a once-temperate world (a closer world loses its water first, AE2)
    const h = history({ star: { mass: 1, lifespan: 10, age: 9, classification: "red-giant", luminosity: 500 }, lifeless: true });
    const runaway = h.events.find((e) => e.kind === "runaway-greenhouse")!;
    const before = h.snapshots!.find((s) => s.tGyr === runaway.tGyr)!;
    expect(h.final.co2Bar).toBeGreaterThan(before.co2Bar * 1000);
  });

  it("leaves oxygen from the escaping water: an oxidised atmosphere with no life", () => {
    expect(has(history({ planet: { orbitalRadius: 0.3 }, lifeless: true }), "oxidation")).toBe(true);
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
    // Its oceans today are liquid water all the same (EN0)
    expect(h.present.oceanFraction).toBeGreaterThan(0);
    expect(h.everLiquidWater).toBe(true);
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

  it("makes no oxygen on a lifeless world that never lost water: photolysis is the only other source", () => {
    for (const { physics, history: h } of worlds) {
      if (h.final.water < physics.waterInventory || h.life !== null) continue;
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

  it("records whether liquid water ever lay on the surface, open or under ice, at a step or today (EN0)", () => {
    const liquid = (bandLiquid: Float64Array) => bandLiquid.some((share) => share > 0);
    let wet = 0;
    for (const { history: h } of worlds) {
      expect(h.everLiquidWater).toBe(h.snapshots!.some((s) => liquid(s.bandLiquid)) || liquid(h.final.bandLiquid));
      // Steam is not liquid: no step whose oceans had boiled counts
      for (const s of h.snapshots!) if (s.steam) expect(liquid(s.bandLiquid)).toBe(false);
      if (h.everLiquidWater) wet++;
    }
    expect(wet).toBeGreaterThan(0);
    expect(wet).toBeLessThan(worlds.length);
  });

  it("draws events per step, so the same planet's history does not depend on its neighbours", () => {
    const { star, planet: p, physics } = worlds[3];
    const again = runWorldHistory(p, physics, buildGeography(p, physics, seed), star, seed, config);
    expect(again.events).toEqual(worlds[3].history.events);
    expect(again.present).toEqual(worlds[3].history.present);
  });
});

describe("ice shells (IH3)", () => {
  it("are as thick as the heat from below allows", () => {
    expect(iceShellKm(EARTH_HEAT_FLOW_W_M2, 240)).toBeCloseTo(0.9, 1);
    expect(iceShellKm(EARTH_HEAT_FLOW_W_M2, 100)).toBeCloseTo(7.5, 1);
    expect(iceShellKm(0.05, 100)).toBeCloseTo(13, 0);   // Europa: 10–30 km estimated
    expect(iceShellKm(EARTH_HEAT_FLOW_W_M2, 271)).toBe(0);
    expect(iceShellKm(0.2, 150)).toBeLessThan(iceShellKm(0.1, 150));
    expect(iceShellKm(0.1, 200)).toBeLessThan(iceShellKm(0.1, 150));
  });

  // A cold Earth-mass world far from the Sun (about 100 K), with deep or shallow water
  const cold = (waterKm: number) => history({
    planet: { orbitalRadius: 7 }, physics: { waterInventory: waterKm / 33.75, surfacePressureBar: 0.3 }, lifeless: true,
  });

  it("keep a dark ocean under a world whose water is deeper than its shell", () => {
    const h = cold(20);
    expect(h.final.meanK).toBeLessThan(130);
    expect(h.final.iceFraction).toBeGreaterThan(0.9);
    expect(h.final.bandLiquid.some((share) => share > 0)).toBe(true);
    expect(h.present.liquidUnderIceFraction).toBeGreaterThan(0);
    expect(h.events.map((e) => e.kind)).not.toContain("frozen-solid");
  });

  it("freeze a world with shallow water solid to its floor", () => {
    const h = cold(1);
    expect(h.final.bandLiquid.every((share) => share === 0)).toBe(true);
    expect(h.present.liquidUnderIceFraction).toBe(0);
    expect(h.everLiquidWater).toBe(false);
  });

  it("record the oceans freezing solid when they do", () => {
    // A world that cools as its interior does: liquid under its ice early, frozen solid later
    const h = cold(2);
    const solid = h.events.filter((e) => e.kind === "frozen-solid");
    expect(solid).toHaveLength(1);
    const s = h.snapshots!;
    const at = s.findIndex((x) => x.tGyr === solid[0].tGyr);
    expect(s[at].bandLiquid.every((share) => share === 0)).toBe(true);
    expect(s[at - 1].bandLiquid.some((share) => share > 0)).toBe(true);
    expect(h.everLiquidWater).toBe(true);
  });
});
