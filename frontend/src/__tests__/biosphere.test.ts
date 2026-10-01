import { describe, it, expect } from "vitest";
import { generateBiosphere } from "../simulation/biosphere";
import { planetKey } from "../simulation/planet";
import type { Planet } from "../simulation/planet";
import type { Star } from "../simulation/star";
import type { PhylogenySummary } from "../simulation/evolution/phylogeny";
import { summarizePhylogeny } from "../simulation/evolution/phylogeny";
import { LINEAGE_CAP } from "../simulation/evolution/engine";
import type { EvolutionState, Lineage } from "../simulation/evolution/engine";
import type { Genome, Habitat } from "../simulation/evolution/genome";

// Worlds Up Close C2.5: the biosphere is read from the lineages.

const star: Star = {
  id: 1, position: [0, 0, 0], mass: 1, age: 4.6, lifespan: 10, temperature: 5772, luminosity: 1,
  classification: "main-sequence", isRare: false,
};

const phylogeny = (overrides: Partial<PhylogenySummary>): PhylogenySummary => ({
  livingLineages: 10, diversity: 10 / LINEAGE_CAP, largestLog10BodyMassKg: -12, foodChainLevels: 1,
  totalBiomass: 1e-3, traitSpread: 0.3, recentSurvival: 0.8, lethalCatastrophes: [], mind: null, firsts: [], ...overrides,
});

function planetWith(summary: PhylogenySummary, endedGyr: number | null = null): Planet {
  return {
    id: 2, key: planetKey(1, 2), hostStarId: 1, orbitalRadius: 1, orbitalIndex: 2, type: "rocky", size: 1, mass: 1,
    temperature: 288, atmosphere: "moderate", formationAtmosphere: "moderate", resourceAbundance: 0.5,
    habitabilityScore: 0.8, isRare: false, surface: null, life: { startedGyr: 0.6, endedGyr, phylogeny: summary }, worldEvents: [],
  };
}

const stageOf = (overrides: Partial<PhylogenySummary>) => generateBiosphere(planetWith(phylogeny(overrides)), star).stage;

describe("the life stage (Revision 1, C2.5)", () => {
  it("is microbial while the largest body is below 10⁻⁹ kg", () => {
    expect(stageOf({ largestLog10BodyMassKg: -12, foodChainLevels: 4, totalBiomass: 2 })).toBe("microbial");
  });

  it("is multicellular from 10⁻⁹ kg, and above 10⁻³ kg with fewer than three food-chain levels", () => {
    expect(stageOf({ largestLog10BodyMassKg: -6, foodChainLevels: 4 })).toBe("multicellular");
    expect(stageOf({ largestLog10BodyMassKg: 1, foodChainLevels: 2 })).toBe("multicellular");
  });

  it("is complex above 10⁻³ kg with three food-chain levels, and dominant from one unit of living biomass (C2.10)", () => {
    expect(stageOf({ largestLog10BodyMassKg: 1, foodChainLevels: 3, totalBiomass: 0.99 })).toBe("complex");
    expect(stageOf({ largestLog10BodyMassKg: 1, foodChainLevels: 3, totalBiomass: 1 })).toBe("dominant");
  });
});

describe("the biosphere's measures", () => {
  it("read body mass, lineage count, survival and trait spread", () => {
    const bio = generateBiosphere(planetWith(phylogeny({ largestLog10BodyMassKg: -5 })), star);
    expect(bio.complexity).toBeCloseTo(0.5, 12);   // −5 is halfway between −15 and 5
    expect(bio.diversity).toBeCloseTo(10 / LINEAGE_CAP, 12);
    expect(bio.stability).toBe(0.8);
    expect(bio.adaptability).toBe(0.3);
    expect(bio.ageGyr).toBeCloseTo(4.0, 12);
  });

  it("put biomass on a log scale from vent life to all of Earth's sunlight", () => {
    const biomassOf = (totalBiomass: number) => generateBiosphere(planetWith(phylogeny({ totalBiomass })), star).biomass;
    expect(biomassOf(1e-6)).toBe(0);
    expect(biomassOf(1e-5)).toBeCloseTo(0, 12);
    expect(biomassOf(1e-3)).toBeCloseTo(0.4, 12);
    expect(biomassOf(2)).toBe(1);
  });

  it("list every catastrophe that cost lineages, most recent first, with the share lost", () => {
    const bio = generateBiosphere(planetWith(phylogeny({
      lethalCatastrophes: [
        { tGyr: 1.0, cause: "impact", aliveBefore: 4, lineagesLost: 1 },
        { tGyr: 3.6, cause: "climate", aliveBefore: 20, lineagesLost: 10 },
      ],
    })), star);
    expect(bio.extinctions).toEqual([
      { cause: "climate shift", severityLoss: 0.5, timeAgo: expect.closeTo(1.0, 12) },
      { cause: "asteroid impact", severityLoss: 0.25, timeAgo: expect.closeTo(3.6, 12) },
    ]);
  });

  it("keep the record of life that has ended: when, how long it lasted, and what struck it", () => {
    const summary = phylogeny({
      livingLineages: 0, largestLog10BodyMassKg: null, foodChainLevels: 0, totalBiomass: 0,
      lethalCatastrophes: [{ tGyr: 2.6, cause: "volcanism", aliveBefore: 3, lineagesLost: 3 }],
    });
    const bio = generateBiosphere(planetWith(summary, 2.6), star);
    expect(bio.hasLife).toBe(false);
    expect(bio.stage).toBe("none");
    expect(bio.extinctAt).toBeCloseTo(2.0, 12);
    expect(bio.ageGyr).toBeCloseTo(2.0, 12);
    expect(bio.extinctions).toHaveLength(1);
    expect(bio.extinctions[0].severityLoss).toBe(1);
  });

  it("are empty where life never began", () => {
    const bio = generateBiosphere({ ...planetWith(phylogeny({})), life: null }, star);
    expect(bio.hasLife).toBe(false);
    expect(bio.extinctAt).toBeNull();
    expect(bio.extinctions).toEqual([]);
  });
});

// ── The phylogeny summary ─────────────────────────────────────────────────────

let nextId = 0;
function lineage(habitat: Habitat, level: number, bandBiomass: number[], traits: Partial<Genome> = {}, diedGyr: number | null = null): Lineage {
  const genome: Genome = {
    energySource: level === 0 ? "light" : "consumer", absorptionPeakNm: 600, log10BodyMassKg: -12,
    habitat, thermalOptimumK: 288, informationProcessing: 0, ...traits,
  };
  return {
    id: nextId++, parentId: null, bornGyr: 1, diedGyr, deathCause: diedGyr === null ? null : "unviable", genome, level,
    biomass: bandBiomass.reduce((a, b) => a + b, 0), bandBiomass: Float64Array.from(bandBiomass),
    coldestK: Infinity, warmestK: -Infinity,
  };
}

const state = (lineages: Lineage[], catastrophes: EvolutionState["catastrophes"] = []): EvolutionState => ({
  lineages, nextId, startedGyr: 0.6, endedGyr: null, firsts: [], catastrophes,
  lightBiomass: 0, chemicalBiomass: 0, totalBiomass: 0,
});

describe("the phylogeny summary", () => {

  it("reads food-chain depth, the largest body and the living biomass", () => {
    const summary = summarizePhylogeny(state([
      lineage("land", 0, [0.1, 0]),
      lineage("shallow-water", 0, [0, 0.2]),
      lineage("shallow-water", 1, [0.05, 0.05], { log10BodyMassKg: -2 }),
    ]), null, 4.6);
    expect(summary.foodChainLevels).toBe(2);
    expect(summary.largestLog10BodyMassKg).toBe(-2);
    expect(summary.totalBiomass).toBeCloseTo(0.4, 12);
  });

  it("counts only the living", () => {
    const summary = summarizePhylogeny(state([
      lineage("land", 0, [0.1, 0]),
      lineage("deep-water", 0, [0, 0.1], { log10BodyMassKg: 3 }, 2.0),
    ]), null, 4.6);
    expect(summary.livingLineages).toBe(1);
    expect(summary.largestLog10BodyMassKg).toBe(-12);
  });

  it("has no trait spread for one lineage, and full spread for lineages at the ends of every range", () => {
    expect(summarizePhylogeny(state([lineage("land", 0, [0.1, 0])]), null, 4.6).traitSpread).toBe(0);
    const ends = summarizePhylogeny(state([
      lineage("land", 0, [0.1, 0], { log10BodyMassKg: -15, thermalOptimumK: 250, informationProcessing: 0 }),
      lineage("land", 0, [0.1, 0], { log10BodyMassKg: 5, thermalOptimumK: 400, informationProcessing: 1 }),
    ]), null, 4.6);
    expect(ends.traitSpread).toBe(1);
  });

  it("reads survival over the last five catastrophes, and keeps only the lethal ones", () => {
    const catastrophes = [
      { tGyr: 1, cause: "impact" as const, aliveBefore: 10, lineagesLost: 10 },   // older than the last five
      ...[2, 3, 4, 5].map((tGyr) => ({ tGyr, cause: "volcanism" as const, aliveBefore: 10, lineagesLost: 0 })),
      { tGyr: 6, cause: "climate" as const, aliveBefore: 10, lineagesLost: 5 },
    ];
    const summary = summarizePhylogeny(state([lineage("land", 0, [0.1, 0])], catastrophes), null, 4.6);
    expect(summary.recentSurvival).toBeCloseTo(45 / 50, 12);
    expect(summary.lethalCatastrophes.map((c) => c.tGyr)).toEqual([1, 6]);
    expect(summarizePhylogeny(state([lineage("land", 0, [0.1, 0])]), null, 4.6).recentSurvival).toBe(1);
  });

  it("keeps a mind's species alive while its lineage or any lineage descended from it lives (owner decision)", () => {
    const mind = { tGyr: 3, lineageId: 1, informationProcessing: 0.6, log10BodyMassKg: 1, consumerAncestry: 0, temperatureSpanK: 20 };
    const root = lineage("land", 0, [0.1, 0]);
    const mindLine = lineage("land", 0, [0, 0], {}, 3.5);
    const daughter = lineage("land", 0, [0.1, 0]);
    const cousin = lineage("land", 0, [0.1, 0]);
    [root.id, mindLine.id, daughter.id, cousin.id] = [0, 1, 2, 3];
    mindLine.parentId = 0; daughter.parentId = 1; cousin.parentId = 0;
    const living = summarizePhylogeny(state([root, mindLine, daughter, cousin]), mind, 4.6).mind!;
    expect(living.ageGyr).toBeCloseTo(1.6, 12);
    expect(living.speciesEndedAgoGyr).toBeNull();
    // The daughter dies later than the mind's own lineage: the species ends with the last of them
    const gone = { ...daughter, diedGyr: 4.0 };
    expect(summarizePhylogeny(state([root, mindLine, gone, cousin]), mind, 4.6).mind!.speciesEndedAgoGyr).toBeCloseTo(0.6, 12);
  });
});
