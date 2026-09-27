import { describe, it, expect } from "vitest";
import {
  clampGenome, ENERGY_SOURCES, HABITATS, TRAIT_RANGES, TRAIT_READERS,
} from "../simulation/evolution/genome";
import type { Genome } from "../simulation/evolution/genome";

// Worlds Up Close C2.1: the six-trait starting genome.

const earthAlga: Genome = {
  energySource: "light",
  absorptionPeakNm: 680,
  log10BodyMassKg: -12,
  habitat: "shallow-water",
  thermalOptimumK: 293,
  informationProcessing: 0,
};

describe("genome", () => {
  it("has six traits, no more", () => {
    expect(Object.keys(earthAlga).sort()).toEqual([
      "absorptionPeakNm", "energySource", "habitat", "informationProcessing", "log10BodyMassKg", "thermalOptimumK",
    ]);
  });

  it("lists the energy sources and habitats the plan names", () => {
    expect(ENERGY_SOURCES).toEqual(["chemical", "light", "consumer"]);
    expect(HABITATS).toEqual(["deep-water", "shallow-water", "land"]);
  });

  it("gives every trait at least one rule that reads it, and names no reader for a trait it lacks", () => {
    expect(Object.keys(TRAIT_READERS).sort()).toEqual(Object.keys(earthAlga).sort());
    for (const readers of Object.values(TRAIT_READERS)) expect(readers.length).toBeGreaterThan(0);
  });

  it("ranges its continuous traits as the plan and the owner set them", () => {
    expect(TRAIT_RANGES.absorptionPeakNm).toEqual({ min: 400, max: 1100 });
    expect(TRAIT_RANGES.log10BodyMassKg).toEqual({ min: -15, max: 5 });   // 10⁻¹⁵ to 10⁵ kg
    expect(TRAIT_RANGES.thermalOptimumK).toEqual({ min: 250, max: 400 });
    expect(TRAIT_RANGES.informationProcessing).toEqual({ min: 0, max: 1 });
  });
});

describe("clampGenome", () => {
  it("leaves a genome inside its ranges unchanged", () => {
    expect(clampGenome(earthAlga)).toEqual(earthAlga);
  });

  it("brings every continuous trait back inside its range and leaves the discrete ones alone", () => {
    const wild: Genome = {
      energySource: "consumer", absorptionPeakNm: 1500, log10BodyMassKg: -20, habitat: "land",
      thermalOptimumK: 200, informationProcessing: 1.4,
    };
    expect(clampGenome(wild)).toEqual({
      energySource: "consumer", absorptionPeakNm: 1100, log10BodyMassKg: -15, habitat: "land",
      thermalOptimumK: 250, informationProcessing: 1,
    });
  });

  it("does not change the genome it is given", () => {
    const wild: Genome = { ...earthAlga, thermalOptimumK: 500 };
    clampGenome(wild);
    expect(wild.thermalOptimumK).toBe(500);
  });
});
