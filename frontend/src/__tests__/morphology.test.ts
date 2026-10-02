import { describe, it, expect } from "vitest";
import { bodyPlan, bodyPlans, heritageOf, lengthOf, pigmentColour } from "../rendering/life/morphology";
import type { AnimalPlan, MorphologyEnvironment, ProducerPlan } from "../rendering/life/morphology";
import type { Lineage } from "../simulation/evolution/engine";
import type { Genome } from "../simulation/evolution/genome";
import { makeConfig } from "../simulation/config";
import { buildGalaxyConfig } from "../simulation/galaxy";
import { generateStarsFor, UNIVERSE_AGE_GYR } from "../simulation/star";
import { generatePlanetsFor, solidWorldOf } from "../simulation/planet";
import type { SolidWorld } from "../simulation/planet";

const genome = (over: Partial<Genome>): Genome => ({
  energySource: "consumer", absorptionPeakNm: 680, log10BodyMassKg: 1, habitat: "land",
  thermalOptimumK: 290, informationProcessing: 0.3, ...over,
});
const lineage = (id: number, over: Partial<Genome> = {}, parentId: number | null = null): Lineage => ({
  id, parentId, bornGyr: 1, diedGyr: null, deathCause: null, genome: genome(over), level: 1, biomass: 0.1,
  bandBiomass: new Float64Array(4), coldestK: 280, warmestK: 300,
});
const earth: MorphologyEnvironment = { gravityG: 1, starFlux: 1, starTemperatureK: 5772 };
const keys = { galaxySeed: 100000, starId: 3, planetId: 2 };
const planOf = (l: Lineage, env = earth, all: Lineage[] = [l]) => bodyPlan(l, new Map(all.map((x) => [x.id, x])), env, keys);

describe("body plans", () => {
  it("are the same every time for the same lineage and planet", () => {
    const l = lineage(5);
    expect(planOf(l)).toEqual(planOf(l));
  });

  it("take their kind from the traits: microbes by size, then producers and animals by energy source", () => {
    expect(planOf(lineage(1, { log10BodyMassKg: -12 })).kind).toBe("microbe");
    expect(planOf(lineage(1, { log10BodyMassKg: -12, energySource: "light" })).kind).toBe("microbe");
    expect(planOf(lineage(1, { energySource: "light" })).kind).toBe("producer");
    expect(planOf(lineage(1, { energySource: "chemical", habitat: "deep-water" })).kind).toBe("producer");
    expect(planOf(lineage(1, { energySource: "consumer" })).kind).toBe("animal");
  });

  it("give land animals shorter legs and stouter bodies the heavier the world", () => {
    const walker = lineage(7, { habitat: "land" });
    let last: AnimalPlan | null = null;
    for (const gravityG of [0.3, 0.6, 1, 1.5, 2.5]) {
      const plan = planOf(walker, { ...earth, gravityG }) as AnimalPlan;
      if (last) {
        expect(plan.legLength).toBeLessThan(last.legLength);
        expect(plan.girth).toBeGreaterThan(last.girth);
      }
      last = plan;
    }
    // Swimmers are carried by water
    const swimmer = lineage(7, { habitat: "shallow-water" });
    expect((planOf(swimmer, { ...earth, gravityG: 2 }) as AnimalPlan).girth)
      .toBe((planOf(swimmer, { ...earth, gravityG: 0.5 }) as AnimalPlan).girth);
  });

  it("make land producers less slender on heavier worlds, and give them bigger leaves in dim light", () => {
    const tree = lineage(9, { energySource: "light", habitat: "land", log10BodyMassKg: 3 });
    const light = planOf(tree, { ...earth, gravityG: 0.5 }) as ProducerPlan;
    const heavy = planOf(tree, { ...earth, gravityG: 2 }) as ProducerPlan;
    expect(heavy.slenderness).toBeLessThan(light.slenderness);
    expect(heavy.lengthM).toBeLessThan(light.lengthM);
    expect((planOf(tree, { ...earth, starFlux: 0.4 }) as ProducerPlan).leafScale)
      .toBeGreaterThan((planOf(tree, { ...earth, starFlux: 1.5 }) as ProducerPlan).leafScale);
  });

  it("size bodies at water's density", () => {
    // 1 kg of water as a cube is 10 cm across
    expect(lengthOf(0, 1)).toBeCloseTo(0.1, 9);
    expect(planOf(lineage(1, { log10BodyMassKg: 2 })).lengthM).toBeGreaterThan(planOf(lineage(1, { log10BodyMassKg: 0 })).lengthM);
  });

  it("let a lineage resemble its parent: details are inherited, with small changes", () => {
    const parent = lineage(10);
    const all = [parent, ...Array.from({ length: 40 }, (_, i) => lineage(11 + i, {}, 10))];
    const byId = new Map(all.map((x) => [x.id, x]));
    const memo = new Map();
    const from = heritageOf(parent, byId, keys, memo);
    const children = all.slice(1).map((c) => heritageOf(c, byId, keys, memo));
    const sameLimbs = children.filter((h) => h.limbPairs === from.limbPairs).length;
    expect(sameLimbs).toBeGreaterThan(children.length * 0.7);
    for (const h of children) {
      expect(Math.abs(h.limbPairs - from.limbPairs)).toBeLessThanOrEqual(1);
      expect(Math.abs(h.build - from.build)).toBeLessThanOrEqual(0.25);
    }
  });

  it("colour a pigment with the light it does not absorb", () => {
    // Absorbing red leaves blue-green; absorbing blue leaves yellow-red; infrared leaves it pale
    const [r1, , b1] = pigmentColour(660, 5772);
    expect(b1).toBeGreaterThan(r1);
    const [r2, , b2] = pigmentColour(450, 5772);
    expect(r2).toBeGreaterThan(b2);
    const ir = pigmentColour(1000, 5772);
    expect(Math.max(...ir) - Math.min(...ir)).toBeLessThan(0.02);
  });

  it("never change the lineages they read", () => {
    const l = lineage(3, { habitat: "shallow-water" });
    const before = JSON.stringify({ ...l, bandBiomass: [...l.bandBiomass] });
    Object.freeze(l.genome);
    Object.freeze(l);
    planOf(l);
    expect(JSON.stringify({ ...l, bandBiomass: [...l.bandBiomass] })).toBe(before);
  });
});

describe("body plans of real planets", () => {
  const seed = 100000;
  const config = makeConfig(seed);
  const stars = generateStarsFor(buildGalaxyConfig(seed, config), UNIVERSE_AGE_GYR, config).stars;
  const living: { world: SolidWorld; planetId: number; starId: number }[] = [];
  for (const star of stars) {
    for (const planet of generatePlanetsFor(star, seed, config).planets) {
      if (planet.life?.endedGyr !== null || !planet.surface || planet.life.phylogeny.largestLog10BodyMassKg! < 0) continue;
      living.push({ world: solidWorldOf(planet, star, seed, config), planetId: planet.id, starId: star.id });
    }
    if (living.length >= 3) break;
  }

  it("give every lineage of a living, complex planet a sound plan", () => {
    expect(living.length).toBe(3);
    const kinds = new Set<string>();
    for (const { world, planetId, starId } of living) {
      const plans = bodyPlans(world.history.life!.lineages, earth, { galaxySeed: seed, starId, planetId });
      for (const plan of plans.values()) {
        kinds.add(plan.kind);
        expect(Number.isFinite(plan.lengthM) && plan.lengthM > 0).toBe(true);
        expect(plan.colour.every((c) => c >= 0 && c <= 1)).toBe(true);
      }
    }
    expect(kinds).toEqual(new Set(["microbe", "producer", "animal"]));
  });
});
