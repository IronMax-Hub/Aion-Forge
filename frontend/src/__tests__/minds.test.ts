import { describe, it, expect } from "vitest";
import { findMind, mindThreshold, MIND_MIN_LOG10_KG } from "../simulation/evolution/minds";
import type { EvolutionState, Lineage } from "../simulation/evolution/engine";
import type { Genome } from "../simulation/evolution/genome";
import type { MindSummary, PhylogenySummary } from "../simulation/evolution/phylogeny";
import { generateBiosphere } from "../simulation/biosphere";
import { canSustainFire, generateCivilization } from "../simulation/civilization";
import { planetKey } from "../simulation/planet";
import type { Planet, PlanetSurface } from "../simulation/planet";
import type { Star } from "../simulation/star";

// Worlds Up Close C2.6: minds and the civilizations read from them.

function lineage(id: number, parentId: number | null, traits: Partial<Genome>, extra: Partial<Lineage> = {}): Lineage {
  return {
    id, parentId, bornGyr: 1, diedGyr: null, deathCause: null, level: 0, biomass: 0.1, bandBiomass: new Float64Array(18),
    coldestK: 280, warmestK: 300,
    genome: {
      energySource: "light", absorptionPeakNm: 600, log10BodyMassKg: -12, habitat: "land", thermalOptimumK: 288,
      informationProcessing: 0, ...traits,
    },
    ...extra,
  };
}

const state = (lineages: Lineage[]): EvolutionState => ({
  lineages, nextId: lineages.length, startedGyr: 0.6, endedGyr: null, firsts: [], catastrophes: [],
  lightBiomass: 0, chemicalBiomass: 0, totalBiomass: 0,
});

describe("the mind threshold (owner decision: the Intelligence setting shrinks the headroom above 0.5)", () => {
  it("is 0.5 at the default setting, lower above it and higher below, never impossible below 1", () => {
    expect(mindThreshold(1)).toBe(0.5);
    expect(mindThreshold(1.5)).toBe(0.25);
    expect(mindThreshold(0.3)).toBeCloseTo(0.85, 12);
    expect(mindThreshold(0.05)).toBeCloseTo(0.975, 12);
    expect(mindThreshold(0)).toBe(1);
    expect(mindThreshold(3)).toBe(0);
  });
});

describe("finding a mind", () => {
  it("needs a body heavier than 1 g (owner decision): a thinking microbe is not a mind", () => {
    const microbe = lineage(0, null, { informationProcessing: 0.9, log10BodyMassKg: -12 });
    const gram = lineage(1, 0, { informationProcessing: 0.9, log10BodyMassKg: MIND_MIN_LOG10_KG });
    expect(findMind(state([microbe, gram]), 0.5, 3)).toBeNull();
  });

  it("is the first living lineage, by id, that reaches the threshold", () => {
    const dead = lineage(0, null, { informationProcessing: 0.9, log10BodyMassKg: 1 }, { diedGyr: 2 });
    const dim = lineage(1, 0, { informationProcessing: 0.4, log10BodyMassKg: 1 });
    const first = lineage(2, 1, { informationProcessing: 0.6, log10BodyMassKg: 0 });
    const second = lineage(3, 1, { informationProcessing: 0.9, log10BodyMassKg: 2 });
    const mind = findMind(state([dead, dim, first, second]), 0.5, 3.2)!;
    expect(mind.lineageId).toBe(2);
    expect(mind.tGyr).toBe(3.2);
    expect(mind.informationProcessing).toBe(0.6);
  });

  it("reads consumer ancestry along the line of descent, and the temperatures it has lived in", () => {
    const root = lineage(0, null, { energySource: "chemical" });
    const grazer = lineage(1, 0, { energySource: "consumer" });
    const sidebranch = lineage(2, 0, { energySource: "consumer" });
    const mind = lineage(3, 1, { energySource: "consumer", informationProcessing: 0.7, log10BodyMassKg: 1 }, { coldestK: 250, warmestK: 310 });
    const found = findMind(state([root, grazer, sidebranch, mind]), 0.5, 3)!;
    expect(found.consumerAncestry).toBeCloseTo(2 / 3, 12);   // itself and its parent, not the root; the side branch is not an ancestor
    expect(found.temperatureSpanK).toBe(60);
  });
});

// ── Civilizations from minds ──────────────────────────────────────────────────

const star: Star = {
  id: 1, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772, luminosity: 1,
  classification: "main-sequence", isRare: false,
};
const earthAir: PlanetSurface = {
  oceanFraction: 0.7, iceFraction: 0.03, landFraction: 0.27, habitableFraction: 0.8, surfaceGravity: 1, pressureBar: 1, o2Bar: 0.21,
};
const mindOf = (overrides: Partial<MindSummary> = {}): MindSummary => ({
  tGyr: 4.0, lineageId: 7, informationProcessing: 0.62, log10BodyMassKg: 1.5, consumerAncestry: 0.5, temperatureSpanK: 75,
  ageGyr: 0.6, speciesEndedAgoGyr: null, ...overrides,
});
function planetWith(mind: MindSummary | null, surface: PlanetSurface = earthAir, endedGyr: number | null = null): Planet {
  const phylogeny: PhylogenySummary = {
    livingLineages: endedGyr === null ? 20 : 0, diversity: 0.6, largestLog10BodyMassKg: endedGyr === null ? 1.5 : null,
    foodChainLevels: 3, totalBiomass: 0.5, traitSpread: 0.4, recentSurvival: 0.9, lethalCatastrophes: [], mind, firsts: [],
  };
  return {
    id: 2, key: planetKey(1, 2), hostStarId: 1, orbitalRadius: 1, orbitalIndex: 2, type: "rocky", size: 1, mass: 1,
    temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5, habitabilityScore: 0.8,
    isRare: false, surface, life: { startedGyr: 0.6, endedGyr, phylogeny }, worldEvents: [],
  };
}
const civOf = (planet: Planet) => generateCivilization(generateBiosphere(planet, star), planet, 42);

describe("a civilization", () => {
  it("needs a mind", () => {
    expect(civOf(planetWith(null))).toEqual({ species: null, civilization: null });
  });

  it("is as old as its mind, and its species' traits come from the mind's lineage", () => {
    const { species, civilization } = civOf(planetWith(mindOf()));
    expect(civilization!.ageGyr).toBe(0.6);
    expect(species!.intelligence).toBe(0.62);
    expect(species!.aggression).toBe(0.5);
    expect(species!.adaptability).toBe(0.5);   // 75 K of the genome's 150 K range
    expect(civilization!.extinctAgoGyr).toBeNull();
  });

  it("whose species has died out remains as ruins: collapsed, with its history before the end", () => {
    const { civilization } = civOf(planetWith(mindOf({ speciesEndedAgoGyr: 0.2 })));
    expect(civilization!.techStage).toBe("collapsed");
    expect(civilization!.extinctAgoGyr).toBe(0.2);
    expect(civilization!.milestones.every((m) => m.timeAgo >= 0.2 && m.timeAgo <= 0.6)).toBe(true);
    expect(civilization!.milestones.some((m) => m.type === "collapse" && m.timeAgo === 0.2)).toBe(true);
  });

  it("outlives the rest of life only as ruins (R8)", () => {
    const planet = planetWith(mindOf({ speciesEndedAgoGyr: 0.1 }), earthAir, 4.5);
    expect(generateBiosphere(planet, star).hasLife).toBe(false);
    expect(civOf(planet).civilization!.techStage).toBe("collapsed");
  });

  it("cannot reach industry without fire, and fire needs 0.16 bar of oxygen, however thick the air (C2.10)", () => {
    const thin = { ...earthAir, o2Bar: 0.15 };
    expect(canSustainFire(planetWith(null, { ...earthAir, pressureBar: 5, o2Bar: 0.24 }))).toBe(true);
    expect(canSustainFire(planetWith(null, earthAir))).toBe(true);
    expect(canSustainFire(planetWith(null, thin))).toBe(false);
    for (let lineageId = 0; lineageId < 40; lineageId++) {
      const civ = civOf(planetWith(mindOf({ lineageId, ageGyr: 3 }), thin)).civilization!;
      expect(["collapsed", "primitive", "agricultural"]).toContain(civ.techStage);
    }
  });
});
